# Open Questions — waiting on a decision or blocked

_Mr. K keeps this current. Resolved questions move to `decisions-log.md`._

## ✅ `ANTHROPIC_API_KEY` blocker — RESOLVED (found + fixed 2026-11-18)

Found this session: the entire app's AI was down in production — `POST /api/claude` returned Anthropic's
`401 invalid x-api-key`, taking out all four callers that share the one env var (`api/claude.js` core
generation, `api/translate.js`, `api/maintenance.js` daily cron, `api/synthesis.js` weekly cron). Cause:
the key expired / account ran dry during the ~5-week gap since the Oct 10 commit.

Fixed same session — founder rotated the key in place (edited the existing `ANTHROPIC_API_KEY` value in
Vercel) + redeployed. Verified: `/api/claude` now returns `400 "model: Field required"` (past auth — key
accepted) and `/api/synthesis` returns `200` with a real generated synthesis (cron live + key funded).
(Moved to decisions-log 2026-11-18.)

**Still worth doing:** confirm a spend alert on the Anthropic account so this doesn't recur silently (the
root cause was budget, not the key itself — see the long-standing funding item below).

**Surfaced by the first live synthesis run (2026-11-18), to triage:** it reported "all five API endpoints
returning 204 for 30+ days" (almost certainly historical maintenance-cron noise from the idle/keyless gap —
should self-clear on the next clean daily run; confirm it does) and a recurring `vite@7.3.6` advisory
(real but low-urgency dep bump).

## Next milestone — "first 50 creators" beta (2026-11-19)

The 504 was the last thing in the way. Remaining: founder confirms the LinkedIn limited-beta share is still
the plan → incognito pass (guest read → sign up → create → publish → ⚑ report → admin hide) → post. 44/50
slots left. Founder-side housekeeping (not blocking): delete Supabase project
`hhjyfwgujmiiariqtaix`, `vercel login` (CLI token expired — Claude can't read function logs).

## ✅ Deploy is live (resolved 2026-09-20, verified 2026-09-21)

The 09-18 "deploy unfinished" blocker is closed. The merge + push landed (`2159adc`), local `main` ==
`origin/main` with nothing unpushed — Mr. K is deployed in production. ⚠️ **Update 2026-11-18:** the weekly
synthesis cron is currently DOWN — `/api/synthesis` now returns `502 "synthesis model error 401"` because
the shared `ANTHROPIC_API_KEY` is invalid in Vercel (see the 🔴 BLOCKING section at the top). The deploy
itself is fine; it's the expired model key. Cron resumes automatically once the key is refreshed.

## Public-demo launch (no billing) — founder-side to go live

_Decided 2026-09-22: free public demo, gate stays OFF, Together fallback, no Stripe. Code is done, deployed,
and verified live this session. Only a couple of founder-side items remain:_

**Demo is LIVE (2026-09-22) — remaining cleanup after the two-project fix:**
- ✅ **`SUPABASE_ANON_KEY` corruption — RESOLVED (confirmed 2026-11-18).** The Sep-23 bullet-char
  corruption was fixed back then (commits `78b068f` redeploy + `dcfd930`); the doc just never got updated.
  Re-verified 2026-11-18: local `.env.local` key is byte-identical to the clean client-hardcoded key in
  `src/lib/supabase.js` (208 chars, pure ASCII, no bullet); it works live (REST 200, auth 200); and
  production proves it — a server-uploaded AI story ("Blood Remembers", Sep 29) holds 78 panel images as
  real `https://…/storage/v1/object/public/panel-art/…` URLs, which only land via a working prod anon key.
  Nothing to paste. (Moved to decisions-log 2026-11-18.)
- ✅ **Panel art reaching the DB — RESOLVED / verified end-to-end (2026-11-18).** The `data:`-URI →
  Storage-bucket fix (`db/panel_art_storage.sql` + `api/_storage.js` wired into `api/image.js` /
  `api/deepinfra.js`) works in production. Verified: ran the exact `uploadPanelArt` path with the anon key
  → upload HTTP 200, public fetch HTTP 200; and art is in the DB for both story types — AI ("Blood
  Remembers", 78 images) and the new custom illustrator story ("Rooftop Duel", Oct 9, 1 image). The
  "panel art has never reached the DB" blocker is closed. (Moved to decisions-log 2026-11-18.)
- ✅ **Founder create-flow smoke test — re-run 2026-11-19 after the 504 fix (PR #5):** concept (4 steps) →
  8-panel chapter → DeepInfra panel art all 200 on prod. Publish skipped by choice (last verified 2026-10-09).
- **Delete the old `hhjyfwgujmiiariqtaix` Supabase project** once nothing needs it (it's paused + stale).
- **Free-tier Supabase auto-pauses after ~7 days idle** — what just bit us. Steady public traffic prevents
  it; Supabase Pro ($25/mo) guarantees always-on if a quiet stretch is a risk.
- **Daily generation cap (10/20/unlimited chapters)** — discussed, NOT built. It adds no cost (monthly
  credits already cap spend); it's only burst/abuse protection. Build only if abuse shows up.

**Remaining (pre-existing):**
- **Image providers (decided 2026-09-22): fund Together + add DeepInfra key.** Chain is now Together
  (Juggernaut Lightning Flux) primary → DeepInfra fallback, Fal demoted (~10× cheaper). To activate the
  quality tier: (a) fund the Together account so `Rundiffusion/Juggernaut-Lightning-Flux` serves — unfunded
  it 402s and falls to free FLUX ($0, still works); (b) add `DEEPINFRA_API_KEY` in Vercel (+ `.env.local`).
  Also: the local `.env.local` `TOGETHER_API_KEY` is stale (401) — prod's is valid; refresh the local one
  to test locally. Live end-to-end verification of Juggernaut + DeepInfra is pending this setup.
- ✅ ~~Confirm a funded Anthropic budget~~ — founder confirmed 2026-11-18 ("budget is fine").
- **Run the incognito smoke test**, then announce: guest read → sign up → create → Together render →
  publish → ⚑ report → admin hide.
- ✅ **Account-count ceiling — RESOLVED 2026-09-27: hard-capped at 50.** Before sharing the demo link
  publicly (LinkedIn), decided on a firm 50-account limit. Enforced at the DB level (`db/signup_cap.sql`
  replaces `handle_new_user()` to raise once 50 profiles exist — rolls back the auth.users row too, no
  orphans), so it can't be bypassed client-side. Public `signup_slots_remaining()` RPC drives a clean
  "Demo is full — 50/50" message in AuthModal. Verified live (RPC returned 46 = 4 accounts, cap 50).
  Commit `9c5fe10`. To raise/remove later: edit the `50` in both functions and re-run the SQL.
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

_(nothing blocking as of 2026-11-19.)_ ~~Fund the providers~~ — retired: Anthropic key rotated + funded
(founder: "budget is fine"), DeepInfra is funded and serving as primary art provider, Fal is demoted.

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
  - ✅ ~~Run `db/review_queue.sql`~~ — already applied (verified 2026-11-19: anon REST → 200 `[]`, not 404).
  - **Verify the two data-writers on a throwaway story** before cron-promoting: Health Medic's `medic_heal`
    (does the reader pick up panels written to `script.panel_images`?) and the Translator Queue (does a
    written translation render? confirm the `translations` table's columns/shape match).
  - ✅ **Curator shelves wired into the public homepage** (2026-09-22) — `src/lib/curation.js` (`buildShelves`,
    the reader-facing mirror of the agent) renders 🔥 Trending + ✦ Fresh + themed-by-genre rows on the home
    feed (client-side, no cost). Verified in preview. (Claude "staff picks" stay admin-only in the agent.)
  - Ops Analyst → scheduled remains a later nicety.
  - **Non-agent additions (non-funding), still open:** self-serve account/data deletion (GDPR/app-store),
    lightweight privacy-respecting analytics, signup bot/abuse hardening, feed pagination, a legal review of
    the beta policies, and a first-run "make your first manga" onboarding nudge.
- **SEO/Sitemap pays off when the demo goes public.** Built now (Wave 1) but the demo is private, so the
  `/s/<id>` prerender + sitemap/robots/llms only matter once discovery is wanted.
- **Bundle-size follow-up.** The build warns the main chunk is >500 KB; code-splitting is deferred, non-urgent.
