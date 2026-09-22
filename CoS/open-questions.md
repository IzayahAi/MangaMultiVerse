# Open Questions — waiting on a decision or blocked

_Mr. K keeps this current. Resolved questions move to `decisions-log.md`._

## ✅ Deploy is live (resolved 2026-09-20, verified 2026-09-21)

The 09-18 "deploy unfinished" blocker is closed. The merge + push landed (`2159adc`), local `main` ==
`origin/main` with nothing unpushed, and prod `https://mangaverse-deploy.vercel.app/api/synthesis` returns
JSON — Mr. K is live in production and the weekly cron is active. Nothing to resume here.

## Public-demo launch (no billing) — founder-side to go live

_Decided 2026-09-22: free public demo, gate stays OFF, Together fallback, no Stripe. Code is done + verified
(legal pages shipped this session, left in the working tree). What's left is all founder-side:_

- **Point `SUPPORT_EMAIL` at a real, monitored inbox** (`src/constants.js`, currently
  `support@mangamultiverse.com` placeholder). It's the contact on Terms/Privacy/Content-Policy + footer.
- **Decide the account-count ceiling.** No `DEMO_MAX_USERS` today; open signups are bounded only by the
  per-IP cap + the 500-credit per-account allotment + free Together images. Options: rely on per-IP cap +
  funded Anthropic budget + Spend Sentinel (lowest effort); add a hard signup cap; or lower `DEMO_CREDITS`.
- **Confirm Anthropic budget + a spend alert** (the only real burn — images are free on Together).
- **Commit + deploy the legal pages, then flip nothing** (gate stays off) and smoke-test as a fresh public
  user (incognito): read → sign up → create → Together render → publish → report → admin hide.
- Have the beta policies **reviewed** before scaling / turning on billing.

## Blocking

- **Fund the providers before a tester round?** Fal (~$30–50) + Anthropic (~$15–25). For the public demo
  images fall back to Together (free, lower-fidelity) — funding Fal is optional, not a launch blocker.
  Decision owner: founder. Status: parked ("all we need is money").

## Waiting / to decide

- **Billing go-live: founder Stripe setup.** The pricing/subscription code is shipped but inert. Needs:
  create Stripe products/prices, set `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` + price IDs in Vercel,
  register the webhook, run `db/billing.sql`, then flip `RELEASE_MODE`/`VITE_RELEASE_MODE`. Full checklist:
  `BILLING_SETUP.md`. (`spend_credits.sql` + the 500 signup trigger are already run/armed.)
- **At launch, drop the signup-trigger grant** from 500 → 0 (Free is read-only). Noted in
  `db/signup_trigger.sql`.
- **Credit allotments assume Together (free) images.** Pro 1,500 / Studio 3,500 / Studio Pro 7,000 are
  profitable on Together but lose money on Fal (~$0.02/panel) — revisit prices or per-panel credit cost if
  paid tiers move to Fal-quality art.
- **Hide credit balance vs show to payers?** Currently built to show balance to paid plans, hide on Free.
  Confirm before launch (founder earlier leaned toward fully hidden).
- **Promote maintenance agents from manual → autonomous?** All 12 are built; uptime/integrity/posture/
  deps/spend/deploy/tamper already run on the daily `cron_tick` with inbox alerts. Next level is
  approval-gated auto-remediation (the Tier-3 "ACTION NEEDED" pattern) — not scheduled.
- **Agent Factory floor** — captured vision, not scheduled. The Phase 1 security plumbing it depends on is
  now largely in place.

## Captured ideas (not yet acted on)

- **SEO/Sitemap pays off when the demo goes public.** Built now (Wave 1) but the demo is private, so the
  `/s/<id>` prerender + sitemap/robots/llms only matter once discovery is wanted.
- **Bundle-size follow-up.** The build warns the main chunk is >500 KB; code-splitting is deferred, non-urgent.
