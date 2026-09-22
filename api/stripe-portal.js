// 💳 Open the Stripe billing portal so a user can manage/cancel their subscription or update payment.
// Authenticated; returns { url } for the client to redirect to.

import Stripe from "stripe";
import { corsHeaders, getToken } from "./_guard.js";
import { verifyUser, svcGetProfile } from "./_supa.js";

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

export const config = { api: { bodyParser: true } };
