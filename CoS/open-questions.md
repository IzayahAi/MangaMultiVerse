# Open Questions — waiting on a decision or blocked

_Mr. K keeps this current. Resolved questions move to `decisions-log.md`._

## ✅ Deploy is live (resolved 2026-09-20, verified 2026-09-21)

The 09-18 "deploy unfinished" blocker is closed. The merge + push landed (`2159adc`), local `main` ==
`origin/main` with nothing unpushed, and prod `https://mangaverse-deploy.vercel.app/api/synthesis` returns
JSON — Mr. K is live in production and the weekly cron is active. Nothing to resume here.

## Public-demo launch (no billing) — founder-side to go live

_Decided 2026-09-22: free public demo, gate stays OFF, Together fallback, no Stripe. Code is done, deployed,
and verified live this session. Only a couple of founder-side items remain:_

**Remaining:**
- **Image providers (decided 2026-09-22): fund Together + add DeepInfra key.** Chain is now Together
  (Juggernaut Lightning Flux) primary → DeepInfra fallback, Fal demoted (~10× cheaper). To activate the
  quality tier: (a) fund the Together account so `Rundiffusion/Juggernaut-Lightning-Flux` serves — unfunded
  it 402s and falls to free FLUX ($0, still works); (b) add `DEEPINFRA_API_KEY` in Vercel (+ `.env.local`).
  Also: the local `.env.local` `TOGETHER_API_KEY` is stale (401) — prod's is valid; refresh the local one
  to test locally. Live end-to-end verification of Juggernaut + DeepInfra is pending this setup.
- **Confirm a funded Anthropic budget + a spend alert** (Anthropic text is the other real burn).
- **Run the incognito smoke test**, then announce: guest read → sign up → create → Together render →
  publish → ⚑ report → admin hide.
- **Decide the account-count ceiling** (still open). No `DEMO_MAX_USERS`; open signups are bounded by the
  per-IP cap + the 500-credit per-account allotment + free Together images. Options: rely on that + the
  Spend Sentinel (lowest effort); add a hard signup cap; or lower `DEMO_CREDITS`. Recommendation: ship on
  the per-IP cap + budget alert; only add a hard cap if burn looks scary.
- Have the beta policies **reviewed** before scaling / turning on billing.
- Optional: turn on the support inbox's Gmail **auto-reply** (draft provided in-session).

**Resolved this session:**
- ✅ Legal pages (Terms / Privacy / Content Policy) shipped, teen-first, deployed + verified live.
- ✅ `SUPPORT_EMAIL` = `mangamultiverse.support@gmail.com` (real inbox, founder created it). Receive-only —
  the app only links a `mailto:`, so no SPF/DKIM/deliverability setup needed.
- ✅ Supabase **Confirm email is OFF** → public signup is instant, no email round-trip, no deliverability
  risk. ⚠️ If it's ever flipped back ON, a custom SMTP provider (Resend/SendGrid/Postmark) is required
  first — Supabase's built-in sender throttles real signups.

## Blocking

- **Fund the providers before a tester round?** Fal (~$30–50) + Anthropic (~$15–25). For the public demo
  images fall back to Together (free, lower-fidelity) — funding Fal is optional, not a launch blocker.
  Decision owner: founder. Status: parked ("all we need is money").

## Waiting / to decide

- **Art-quality upgrade — parked (decided 2026-09-22 to stay cheap for now).** Current chain is Together
  Juggernaut Lightning Flux (primary) → DeepInfra FLUX-schnell (fallback) — both fast/cheap distills. Founder:
  "leave lightning flux and deepinfra flux schnell as backup and we can work our way up later." When ready
  to climb, the "best art for low cost" candidates (per 50-panel chapter, all ≤ Fal's ~$1) are: Together
  Juggernaut Pro Flux ~$0.245 (value quality tier), DeepInfra FLUX-2-klein-9b ~$0.75 or Together FLUX.2 dev
  ~$0.77 (frontier Flux 2). Upgrade = a one-line model swap in `api/image.js` (primary) + optionally the
  DeepInfra model. Best decided by an A/B: generate the same panel across these and eyeball, then lock in.
  Needs both accounts funded first (Together for the paid primary, DeepInfra for the fallback).

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

- **Post-launch agent roadmap — P3 wave BUILT 2026-09-22 ("build them all").** All four autonomous+approval
  agents shipped on the runner (Moderator + Approval Rail, Health Medic, Curator/Recommender, Translator
  Queue). Remaining to finish them:
  - **Run `db/review_queue.sql`** in Supabase (Moderator's queue; best-effort until then).
  - **Verify the two data-writers on a throwaway story** before cron-promoting: Health Medic's `medic_heal`
    (does the reader pick up panels written to `script.panel_images`?) and the Translator Queue (does a
    written translation render? confirm the `translations` table's columns/shape match).
  - **Wire Curator shelves into the public homepage** (App.jsx) — today it computes shelves but only shows
    them on the Maintenance page; the last mile is rendering trending/staff-picks on the feed.
  - Ops Analyst → scheduled remains a later nicety.
  - **Non-agent additions (non-funding), still open:** self-serve account/data deletion (GDPR/app-store),
    lightweight privacy-respecting analytics, signup bot/abuse hardening, feed pagination, a legal review of
    the beta policies, and a first-run "make your first manga" onboarding nudge.
- **SEO/Sitemap pays off when the demo goes public.** Built now (Wave 1) but the demo is private, so the
  `/s/<id>` prerender + sitemap/robots/llms only matter once discovery is wanted.
- **Bundle-size follow-up.** The build warns the main chunk is >500 KB; code-splitting is deferred, non-urgent.
