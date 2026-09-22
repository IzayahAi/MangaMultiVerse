// 💳 Combined Stripe billing endpoint — Checkout (subscribe/top-up) and the billing portal (manage/cancel).
// Merged from stripe-checkout.js + stripe-portal.js to stay under the Hobby plan's 12-Serverless-Function
// cap per deployment (see git history for the "No more than 12 Serverless Functions" deploy failure this
// fixed). Dispatches on `action` in the body: "checkout" or "portal". Both return { url } to redirect to.
// The webhook (api/stripe-webhook.js) is what actually grants the plan/credits after payment — never trust the client.

import Stripe from "stripe";
import { corsHeaders, getToken } from "./_guard.js";
import { planFor, packFor } from "./_pricing.js";
import { verifyUser, svcGetProfile, svcPatchProfile } from "./_supa.js";

async function doCheckout(req, res, stripe, user) {
  const { kind, id } = req.body || {};
  const item = kind === "pack" ? packFor(id) : planFor(id);
  if (!item || !item.stripePrice) return res.status(400).json({ error: `No Stripe price configured for ${kind} '${id}'` });
  if (kind !== "pack" && id === "free") return res.status(400).json({ error: "Free needs no checkout" });

  const origin = (req.headers.origin) || (req.headers.host ? `https://${req.headers.host}` : (process.env.APP_URL || ""));

  try {
    // Reuse or create the Stripe customer for this user, and remember it on the profile.
    const profile = await svcGetProfile(user.id);
    let customerId = profile?.stripe_customer_id || null;
    if (!customerId) {
      const customer = await stripe.customers.create({ email: user.email || profile?.email || undefined, metadata: { userId: user.id } });
      customerId = customer.id;
      await svcPatchProfile(user.id, { stripe_customer_id: customerId });
    }

    const isPack = kind === "pack";
    const session = await stripe.checkout.sessions.create({
      mode: isPack ? "payment" : "subscription",
      customer: customerId,
      client_reference_id: user.id,
      line_items: [{ price: item.stripePrice, quantity: 1 }],
      success_url: `${origin}/?billing=success`,
      cancel_url: `${origin}/?billing=cancel`,
      metadata: { userId: user.id, kind: isPack ? "pack" : "subscription", itemId: id },
      ...(isPack ? {} : { subscription_data: { metadata: { userId: user.id, plan: id } } }),
    });
    return res.status(200).json({ url: session.url });
  } catch (e) {
    return res.status(502).json({ error: "Stripe checkout failed: " + (e.message || "error") });
  }
}

async function doPortal(req, res, stripe, user) {
  const profile = await svcGetProfile(user.id);
  if (!profile?.stripe_customer_id) return res.status(400).json({ error: "No billing account yet — subscribe first." });

  const origin = (req.headers.origin) || (req.headers.host ? `https://${req.headers.host}` : (process.env.APP_URL || ""));
  try {
    const session = await stripe.billingPortal.sessions.create({ customer: profile.stripe_customer_id, return_url: `${origin}/?billing=portal` });
    return res.status(200).json({ url: session.url });
  } catch (e) {
    return res.status(502).json({ error: "Stripe portal failed: " + (e.message || "error") });
  }
}

export default async function handler(req, res) {
  const cors = corsHeaders(req);
  for (const [k, v] of Object.entries(cors)) res.setHeader(k, v);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return res.status(500).json({ error: "Stripe not configured" });
  const stripe = new Stripe(key);

  const user = await verifyUser(getToken(req));
  if (!user?.id) return res.status(401).json({ error: "Sign in required" });

  const { action } = req.body || {};
  if (action === "portal") return doPortal(req, res, stripe, user);
  if (action === "checkout") return doCheckout(req, res, stripe, user);
  return res.status(400).json({ error: "action must be 'checkout' or 'portal'" });
}

export const config = { api: { bodyParser: true } };
