# Billing setup (Stripe) — founder checklist

The pricing/subscription code is shipped and inert until these steps are done. Do it in **test mode**
first, verify, then repeat with **live** keys. Claude never handles keys — you paste them yourself.

## 1. Create products + prices in Stripe (test mode)

Dashboard → Products. Create these and copy each **Price ID** (`price_...`):

| Product | Type | Price | Env var for its Price ID |
|---|---|---|---|
| Pro | Recurring · monthly | $25 | `STRIPE_PRICE_PRO` |
| Studio | Recurring · monthly | $50 | `STRIPE_PRICE_STUDIO` |
| Studio Pro | Recurring · monthly | $100 | `STRIPE_PRICE_STUDIO_PRO` |
| 300 credits | One-time | $5 | `STRIPE_PRICE_PACK_SMALL` |
| 1,000 credits | One-time | $15 | `STRIPE_PRICE_PACK_MEDIUM` |
| 3,000 credits | One-time | $40 | `STRIPE_PRICE_PACK_LARGE` |
| 10,000 credits | One-time | $120 | `STRIPE_PRICE_PACK_XL` |

(Free needs no Stripe product.)

## 2. Add env vars in Vercel (Project → Settings → Environment Variables)

- `STRIPE_SECRET_KEY` = `sk_test_...` (later `sk_live_...`)
- `STRIPE_WEBHOOK_SECRET` = `whsec_...` (from step 3)
- The 7 `STRIPE_PRICE_*` IDs from the table above.

For **local** testing, put the same in `.env.local` and restart `vercel dev`.

## 3. Register the webhook

Stripe → Developers → Webhooks → Add endpoint:
- **URL:** `https://mangaverse-deploy.vercel.app/api/stripe-webhook`
- **Events:** `checkout.session.completed`, `invoice.paid`, `customer.subscription.updated`,
  `customer.subscription.deleted`
- Copy the endpoint's **Signing secret** → set as `STRIPE_WEBHOOK_SECRET`.

(For local webhook testing use the Stripe CLI: `stripe listen --forward-to localhost:3000/api/stripe-webhook`.)

## 4. Run the DB migration

Run `db/billing.sql` once in the Supabase SQL editor (adds plan/billing columns + `billing_events`).

## 5. Redeploy

Env changes only apply to a new deployment — redeploy after setting the vars.

## 6. Test (test mode)

Sign in, open **Pricing**, choose a plan → Stripe Checkout (use test card `4242 4242 4242 4242`).
After payment the webhook should set your `plan` + grant credits. Verify in Supabase `profiles`
(plan, credits) and `billing_events`. Try a top-up pack; try "Manage billing" (portal).

## 7. Go live

- Swap to **live** Stripe keys + create live products/prices + a live webhook (repeat 1-3 with live mode).
- Flip the launch gate: `RELEASE_MODE=true` (server) **and** `VITE_RELEASE_MODE=true` (client) in Vercel,
  redeploy. This turns on auth+credit enforcement and shows Pricing to everyone.
- ⚠️ Also confirm `SUPABASE_SERVICE_ROLE_KEY` is set with a real value in prod (the webhook needs it to
  grant credits) — verify via Maintenance → self-check (Service-role key 🟢).

## Notes

- Tier prices/credits are config in `api/_pricing.js` (server, authoritative) mirrored in
  `src/constants.js` (display). Change both to retune; no schema change needed.
- The webhook is the only credit granter — never trust the client. Credits/plan columns are not
  client-writable (revoked in `db/signup_trigger.sql`).
- Margins are tight because Fal image cost is high per chapter; the Spend Sentinel watches actual burn.
  Dropping the panel-count default stretches every tier further.
