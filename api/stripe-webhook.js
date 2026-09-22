// 💳 Stripe webhook — the ONLY place plans/credits are granted. Verifies Stripe's signature, then
// updates profiles via the service role (bypasses RLS + the client column locks). Idempotent: each
// Stripe event id is recorded in billing_events and skipped if seen again (webhooks retry).
//
// Needs the RAW request body for signature verification, so bodyParser is off.

import Stripe from "stripe";
import { PLANS, PACKS } from "./_pricing.js";
import { hasService, svcGetProfileByCustomer, svcPatchProfile, svcInsert, eventSeen } from "./_supa.js";

const MONTH_MS = 31 * 864e5;
const planByPrice = (priceId) => Object.values(PLANS).find((p) => p.stripePrice && p.stripePrice === priceId) || null;

async function readRaw(req) {
  const chunks = [];
  for await (const c of req) chunks.push(typeof c === "string" ? Buffer.from(c) : c);
  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const key = process.env.STRIPE_SECRET_KEY;
  const whSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!key || !whSecret) return res.status(500).json({ error: "Stripe webhook not configured" });
  if (!hasService()) return res.status(500).json({ error: "Service role not configured" });
  const stripe = new Stripe(key);

  let event;
  try {
    const raw = await readRaw(req);
    event = stripe.webhooks.constructEvent(raw, req.headers["stripe-signature"], whSecret);
  } catch (e) {
    return res.status(400).json({ error: "Signature verification failed: " + (e.message || "") });
  }

  // Idempotency — don't double-grant on retries.
  if (await eventSeen(event.id)) return res.status(200).json({ ok: true, duplicate: true });

  try {
    const now = Date.now();
    const obj = event.data.object;

    if (event.type === "checkout.session.completed") {
      const userId = obj.metadata?.userId || obj.client_reference_id;
      const customerId = typeof obj.customer === "string" ? obj.customer : obj.customer?.id;
      if (!userId) return res.status(200).json({ ok: true, note: "no userId" });

      if (obj.metadata?.kind === "pack") {
        const pack = PACKS[obj.metadata.itemId];
        if (pack) {
          // Increment credits (top-up adds, never resets).
          const profile = await svcGetProfileByCustomer(customerId);
          const current = Number(profile?.credits) || 0;
          await svcPatchProfile(userId, { credits: current + pack.credits, ...(customerId ? { stripe_customer_id: customerId } : {}) });
          await svcInsert("billing_events", { user_id: userId, type: "pack_purchase", pack: pack.id, credits_granted: pack.credits, amount_usd: (obj.amount_total || 0) / 100, stripe_event_id: event.id, stripe_object_id: obj.id });
        }
      } else {
        // New subscription — set the plan + grant the first month's credits.
        const plan = PLANS[obj.metadata?.plan] || null;
        if (plan) {
          await svcPatchProfile(userId, {
            plan: plan.id, plan_status: "active", plan_since: new Date(now).toISOString(),
            credits: plan.credits, credits_renew_at: new Date(now + MONTH_MS).toISOString(),
            ...(customerId ? { stripe_customer_id: customerId } : {}),
          });
          await svcInsert("billing_events", { user_id: userId, type: "subscription_start", plan: plan.id, credits_granted: plan.credits, amount_usd: (obj.amount_total || 0) / 100, stripe_event_id: event.id, stripe_object_id: obj.id });
        }
      }
    } else if (event.type === "invoice.paid") {
      // Recurring renewal — reset the monthly credits. Skip the first invoice (granted at checkout).
      if (obj.billing_reason === "subscription_cycle") {
        const customerId = typeof obj.customer === "string" ? obj.customer : obj.customer?.id;
        const profile = await svcGetProfileByCustomer(customerId);
        const priceId = obj.lines?.data?.[0]?.price?.id;
        const plan = planByPrice(priceId) || (profile?.plan ? PLANS[profile.plan] : null);
        if (profile && plan) {
          await svcPatchProfile(profile.id, { plan: plan.id, plan_status: "active", credits: plan.credits, credits_renew_at: new Date(now + MONTH_MS).toISOString() });
          await svcInsert("billing_events", { user_id: profile.id, type: "invoice_paid", plan: plan.id, credits_granted: plan.credits, amount_usd: (obj.amount_paid || 0) / 100, stripe_event_id: event.id, stripe_object_id: obj.id });
        }
      }
    } else if (event.type === "customer.subscription.updated") {
      const customerId = typeof obj.customer === "string" ? obj.customer : obj.customer?.id;
      const profile = await svcGetProfileByCustomer(customerId);
      if (profile) {
        const priceId = obj.items?.data?.[0]?.price?.id;
        const plan = planByPrice(priceId);
        const patch = { plan_status: obj.status };
        if (plan) patch.plan = plan.id; // handles upgrades/downgrades
        await svcPatchProfile(profile.id, patch);
        await svcInsert("billing_events", { user_id: profile.id, type: "subscription_updated", plan: plan?.id || profile.plan, stripe_event_id: event.id, stripe_object_id: obj.id, meta: { status: obj.status } });
      }
    } else if (event.type === "customer.subscription.deleted") {
      const customerId = typeof obj.customer === "string" ? obj.customer : obj.customer?.id;
      const profile = await svcGetProfileByCustomer(customerId);
      if (profile) {
        await svcPatchProfile(profile.id, { plan: "free", plan_status: "canceled", credits_renew_at: null });
        await svcInsert("billing_events", { user_id: profile.id, type: "subscription_canceled", plan: "free", stripe_event_id: event.id, stripe_object_id: obj.id });
      }
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    // Return 500 so Stripe retries a genuinely failed handler.
    return res.status(500).json({ error: "handler error: " + (e.message || "") });
  }
}

export const config = { api: { bodyParser: false } };
