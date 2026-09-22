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

- **Post-launch build roadmap (Mr. K synthesis, 2026-09-22) — "what's next besides funding."** 21 agents are
  live (5 line, 4 control room, 12 maintenance). The gaps are all in the **autonomous + human-approval
  tier**, which going public surfaces. Priority order:
  - **P0 — 🛡️ Moderator Agent + the approval rail.** Auto-review each new publish (Claude vs the Content
    Policy: title/tagline/cover/first panels) → auto-hide clear violations, queue borderline ones. Needs a
    review-queue table + a `publish_review` runner check + the **"ACTION NEEDED / approve" rail** — the
    reusable human-in-the-loop surface every autonomous agent needs. Highest leverage: public AI-generated
    UGC under our name is the one thing that can actually hurt us, and the rail is the spine for all Tier-3.
  - **P1 — 🩺 Health Medic** (auto re-render missing/blank panels — Broken-Link detects, Medic fixes; cheap
    now that art is ~10× cheaper) and **✨ Curator/Recommender** (platform-wide "what to read next"/trending
    — retention for a growing public catalog; today it's per-story only).
  - **Later — Translator queue worker** (promote the on-demand engine to a capped queue; only matters once
    translation is on at launch) and **Ops Analyst → scheduled**.
  - **Non-agent additions (non-funding):** self-serve account/data deletion (GDPR/app-store; currently
    contact-only), lightweight privacy-respecting analytics (can't tune a public launch we can't measure),
    signup bot/abuse hardening (open signups invite bots), feed pagination (catalog will grow), a legal
    review of the beta policies, and a first-run "make your first manga" onboarding nudge.
- **SEO/Sitemap pays off when the demo goes public.** Built now (Wave 1) but the demo is private, so the
  `/s/<id>` prerender + sitemap/robots/llms only matter once discovery is wanted.
- **Bundle-size follow-up.** The build warns the main chunk is >500 KB; code-splitting is deferred, non-urgent.
