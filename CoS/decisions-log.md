# Decisions Log

_Newest first. Mr. K appends decisions at session end, signed `— Mr. K`._

## 2026-09-23

- **Panel art quality root-caused and fixed, twice.** First: panels were rendering as extreme face
  close-ups regardless of the scene/action-craft prompt work — `generatePanelImage()` put the ~600-char
  style/quality preamble FIRST, and both provider proxies truncated the prompt to 200–300 chars, so every
  panel generated from nothing but the style text (which for PRISMA literally says "expressive anime manga
  faces"). Reordered scene+characters+action first, style trails; raised truncation to 1800 chars. Second:
  busier panels (long scene + multiple characters) still ran past even 1800 chars before the style/color
  block, causing inconsistent color/style between panels in the same chapter — added a short
  guaranteed-to-survive "essential" prefix (color mode + anatomy + no-text) at the very front. Both
  verified with real before/after panel generations. — Mr. K

- **DeepInfra promoted to primary art provider, Together demoted to fallback.** Funded 2026-09-23; a
  side-by-side test on the same prompt showed DeepInfra rendering fuller environments with no text-glitch
  artifacts, at roughly a third the per-panel cost of Together's Lightning model. — Mr. K

- **Found panel art has never reached the database, for any story.** `publicPanelImages()` only accepts
  `http`-prefixed URLs; both providers return base64, wrapped as a `data:` URI, which never qualified.
  Confirmed directly against a same-day-published story (zero `script.panel_images` entries). Fix shipped:
  a public Supabase Storage bucket (`db/panel_art_storage.sql`) + an upload helper wired into both provider
  proxies. **Not yet verified end-to-end** — blocked on a corrupted `SUPABASE_ANON_KEY` (below). — Mr. K

- **Found `SUPABASE_ANON_KEY` in Vercel Production is corrupted** — a bullet character replaced one
  character of the 208-char key, almost certainly a masked-field copy-paste artifact. Silently breaks any
  server call using it as a header value; several such failures were already being swallowed by existing
  "never break the demo" fallback logic elsewhere, so this has likely been degrading things invisibly for
  a while, not just today. Gave Michele the clean value (verified byte-identical to the working
  client-side hardcoded key). First re-save attempt landed empty — unresolved as of session close, see
  open-questions.md. — Mr. K

- **Admin (hypheezay@gmail.com only) now exempt from all demo-mode limits** — story cap, chapter cap, and
  the server-side per-IP/credit caps — in both RELEASE_MODE states, so building/testing isn't throttled
  like a visitor. — Mr. K

- **Hardened scriptCraft against character invention and repetition**, diagnosed via a 3-agent review of a
  test chapter — the model was inventing unlisted characters and giving dialogue to unnamed
  factions/voices despite an existing "never invent" rule, plus heavy phrase repetition. Verified via a
  real regeneration: invented-character count dropped roughly in half and the specific "who did the
  protagonist die saving" contradiction we found was fully resolved. — Mr. K

- **Translate tab removed from the Studio creation flow** per Michele's request (reader-side live
  translation untouched — separate feature, separate code path). — Mr. K

- **Redo buttons + Add Character shipped** — re-roll Logline/Central Conflict/Chapter 1 Hook individually
  without discarding the rest of a generated concept, and grow the cast after initial generation via a
  short hint. Neither existed before this session. — Mr. K

## 2026-09-22

- **Public demo is LIVE (https://mangaverse-deploy.vercel.app), reader path smoke-tested green.** Browse +
  Curator shelves, story reader with full art, live per-chapter translation (verified Spanish via
  /api/translate), report button, legal + subscription pages all working on prod. Create-flow (signup →
  generate → publish) still needs a founder pass (can't test — no credentials). — Mr. K

- **Fixed a long deploy bug: live app was pointed at a PAUSED/wrong Supabase project.** Root cause: two
  Supabase projects exist — `kkpzbfhnpvhnykxitnon` (active, all the real work + SQL) and
  `hhjyfwgujmiiariqtaix` (paused, old schema). Prod's Vercel env pointed at the paused one, and its stale
  `VITE_SUPABASE_ANON_KEY` (old project's key) silently overrode every fix → 401 / empty library. Chased
  build-cache + service-worker red herrings before the Vercel build log revealed the same commit produced a
  different bundle on Vercel (old key) vs local (correct key). **Fix: hardcode the correct kkpz URL + anon
  key DIRECTLY in `src/lib/supabase.js`** (public values, RLS-protected) so no env can override; plus
  `rm -rf node_modules/.vite` in the build and a `.gitleaks.toml` allowlist for the public anon key. — Mr. K

- **Subscription page opened to everyone (view-only until launch).** Removed the admin/RELEASE_MODE nav gate;
  buttons show "Available at launch" (disabled) while billing's off, so visitors see the plans without
  hitting a broken checkout. — Mr. K

- **Pricing reassessed + restructured after the ~20× image-cost drop, then split by art quality.** A
  50-panel chapter now costs ~$0.05 (Juggernaut Lightning, was ~$1 on Fal). After several iterations landed
  on a **quality-vs-quantity ladder** with a real Studio Pro differentiator (premium art):
  - **Pro $15/mo · 5,000 cr · standard (Lightning) art · no LoRA** — limited entry (~91 ch/mo, ~68% margin).
  - **Studio $30/mo · 16,000 cr · standard art · everything + LoRA** — the volume tier (~291 ch/mo, ~49%).
  - **Studio Pro $100/YEAR · 35,000 cr · PREMIUM Juggernaut Pro art** — best quality, fewer tokens
    (~636 ch/yr, ~29%). `premiumArt` plan feature routes its panels to `RunDiffusion/Juggernaut-pro-flux`
    (api/image.js); demo/free stay on Lightning.
  - **One top-up: 5,000 cr / $10** (~500 cr/$, matches Pro). Translation removed from paid perks (free for
    all readers). Demo grant raised to 700 (covers the 3×3×50 cap). Why premium art is Studio-Pro-only:
    on Juggernaut Pro ($0.0049/MP) every tier loses money at the old credit levels if maxed, so it's the
    single premium differentiator, not universal. **Pre-billing: verify the real per-panel cost via Spend
    Sentinel `cost_ledger` (per-MP vs 1 MP-minimum doubles cost) before Stripe.** Stripe = 4 products. — Mr. K

- **Translation model: every manga, every language, every reader — free + globally cached.** Founder wants
  max reach ("all mangas possible for everyone in every language … to get more views"), and flagged
  translation as "really expensive." Root cause found: it already uses cheap Haiku (~$0.008/lang/chapter),
  but live translations were cached only in the reader's **localStorage**, never the shared store (RLS blocks
  non-owner writes) — so a popular story×language was re-paid **once per reader per device**. Fix: new
  `api/translate.js` — **cache-first** (checks the translations store; on a hit, free/instant; on a miss,
  translates once with Haiku and **persists globally via the service role**), so each (story, language,
  chapter) is paid for **once, ever**, then free for everyone. Removed the paid/sign-in gate on *reading*
  translations (MangaReader now routes the live path through `translateCached`); misses are bounded by the
  existing per-IP cap. Result: whole catalog translatable into any language for all readers at trivial cost
  (a story read in 20 languages ≈ $0.16 total, one-time). No new founder setup (uses the service-role +
  Anthropic keys already set). Inert in the English-only demo; activates at launch. — Mr. K

- **Built the P3 "autonomous + approval" agent wave — 4 agents.** Founder: "build them all including the
  translator queue worker." Shipped on the existing secured runner (`api/maintenance.js`) + a cheap Haiku
  helper (`askClaudeServer`): **🛡️ Moderator + Approval Rail** (reviews each new publish vs the Content
  Policy → auto-hides violations, queues borderline/mis-rated for a human; `db/review_queue.sql`;
  `publish_review`/`review_list`/`review_decide`; folded into the daily cron), **🩹 Health Medic** (scan +
  capped re-render of missing panels via Together-free), **✨ Curator/Recommender** (trending/fresh/themed
  shelves + Claude staff-picks, read-only), **🌐 Translator Queue** (capped pre-translation into top
  languages, inert in the English-only demo). The two data-writers (Medic heal, Translator) are **manual +
  capped, deliberately NOT on the cron** until verified. Registry (`agents.js`) + a Maintenance UI wave +
  roadmap updated. Build clean. **Founder setup: run `db/review_queue.sql`; verify the two writers on a
  throwaway story before cron-promoting.** — Mr. K

- **Panel image provider switched: Fal → Together (Juggernaut Lightning Flux) primary + DeepInfra fallback
  (~10× cheaper).** Pulled live pricing across providers for a 50-panel chapter: Fal ~$1.00, vs Together
  Juggernaut Lightning Flux (`Rundiffusion/Juggernaut-Lightning-Flux`, $0.0017/MP) ~$0.085 and DeepInfra
  FLUX-schnell ~$0.10 — same fast-Flux quality. Founder: "we do together lightning flux with deepinfra …
  a tenth of the price as fal." Rewired `generatePanelImage` (`src/lib/claude.js`): Together primary
  (Juggernaut → free FLUX → SDXL) → new DeepInfra proxy (`api/deepinfra.js`) fallback → Fal demoted behind
  `FAL_ENABLED` (default off; `VITE_FAL_ENABLED=true` reverts). Added Juggernaut as the primary Together
  model (`api/image.js`). Fixed a real trap: the Together call was hardcoded `'free'` (it used to run after
  Fal charged) — now the primary call charges/counts exactly once via `chargeAction()`, and the per-IP
  demo-cap 429 surfaces the right toast. Chain degrades gracefully (verified prod `/api/image` still returns
  a valid image; local `.env.local` Together key is stale/401 — prod key is fine). Build clean. **Founder
  setup: fund the Together account so Juggernaut serves (unfunded → free FLUX, still $0), and add
  `DEEPINFRA_API_KEY` in Vercel.** Full live verification pending that setup. — Mr. K

- **Teen-first platform: dropped "All ages", made Teen the default rating.** SUPERSEDES the "kids + adults
  on one platform" call below. Founder's reasoning: the house style is genuinely gory (murim, horror,
  action) — not appropriate for young kids, and "all ages" was never real for this catalog. Reframed the
  age gate as a *distribution* asset (ad-network / app-store / Stripe eligibility), not a monetization
  lever — mature-as-a-paywall is a dead end (Stripe bans explicit, stores block it, the AI won't generate
  it). Calibration kept: blood/gore alone is Teen (cf. Demon Slayer / AoT), so Teen is the default bucket
  and 18+ Mature is reserved for the heavy slice (sexual themes short of explicit, or gratuitous gore).
  Collapsed the rating model 3→2 (`CONTENT_RATINGS` in constants.js; `DEFAULT_RATING="teen"`; PublishModal
  + Studio defaults; legacy "all" rows fall through `ratingOf` → Teen). Monetization stays uniform across
  ratings (credits/subscription/ads). — Mr. K

- **Chose a free PUBLIC-demo launch (no billing) + shipped the legal surface it needed.** Founder wants to
  open the app to the public as a free demo with the gate **OFF** (`RELEASE_MODE` off, Together image
  fallback, no Stripe). Reconciled launch-readiness against the live backend — several docs were stale:
  ✅ `spend_credits` armed, ✅ per-IP cap (`bump_demo_usage` RPC) enforcing, ✅ `content_rating` run,
  ✅ `cos_daily_logs` RLS fixed, ✅ SEO (robots/sitemap/OG) live with real stories, ✅ credit-grant hole
  closed via `signup_trigger`. The one real code gap for a *public* launch was the missing legal/policy
  surface — built it: `src/components/LegalPage.jsx` (Terms / Privacy / Content Policy), a `SUPPORT_EMAIL`
  constant, footer policy links, and a `legal` route in `App.jsx`. Verified rendering + tab-switch in
  preview; prod build clean. **Left in the working tree — not committed/deployed** (founder commits). — Mr. K

- **Pricing model finalized + made real.** Demo grant → 500, and now a TRUE one-time per-account
  allotment: credits deplete server-side in demo too (via `spend_credits`, which the founder armed along
  with the 500 signup trigger), no daily reset. Free tier → read-only (read + be on the site,
  ad-supported) and removed from the Subscription page (Pricing renamed → Subscription). Credit
  allotments set to **Pro 1,500 / Studio 3,500 / Studio Pro 7,000** — profitable on Together's free-tier
  images; would need revisiting (or higher prices / higher per-panel credit cost) if paid tiers move to
  Fal-quality art. — Mr. K

- **Ad revenue path chosen: ad-supported free reading.** Built an ad-gate scaffold — a 15s interstitial
  every ~6 chapters for non-paying viewers, ad-free for paid plans, launch-only. Real ad revenue waits on
  an ad network + public traffic (rendered into the `#mv-ad-slot` placeholder). — Mr. K

- **Studio funnel: guests write-your-own only.** Signed-in creators keep the full seed tools
  (Trending/For you/Wizard); guests get a clean write-your-own screen + a "Sign in to save your story"
  promo. No unprompted seed generation for guests. — Mr. K

- **Kids + adults on one platform, via an age gate — mature THEMES only, never explicit.** _(SUPERSEDED
  same day — see the teen-first decision at the top of 2026-09-22: "All ages" was dropped, Teen is now the
  default. The mature-themes/never-explicit and age-gate parts still stand.)_ Decided against
  explicit/NSFW: Stripe bans it and the AI stack can't generate it. Shipped per-story content ratings
  (all/teen/mature) + a self-attested 18+ AgeGate; Mature is reader-gated and its covers are blurred + 18+
  badged for unverified viewers so kids never see mature art. Both audiences monetize through the same
  subscription tiers; mature is gated by age, not a separate paywall. Strict separation kept; no adult
  payment processor, no explicit generation. — Mr. K

## 2026-09-21

- **Pricing & subscriptions decided + built (Stripe, behind the launch gate).** After cost-modeling with
  the founder (Fal image spend is the binding constraint — a 50-panel chapter ≈ $1, so flat-unlimited
  loses money), landed on: Free $0/100cr · Pro $25/700cr · Studio $50/1,600cr · **Studio Pro $100/4,000cr
  = full access, capped by credits**; over the cap users buy top-up packs (300/$5, 1,000/$15, 3,000/$40,
  10,000/$120). Founder's framing: a pro doing 7-8 chapters/day can't be flat-included, so cap-then-top-up
  is the model. Built the full stack: Stripe Checkout + a signature-verified idempotent webhook (the only
  credit granter, service-role) + billing portal + Pricing page + `db/billing.sql`. All inert until the
  founder does the Stripe setup (`BILLING_SETUP.md`) and flips RELEASE_MODE. Open question carried: hide
  credit balance from everyone vs show it to paying users (built to show for payers). — Mr. K

- **Per-plan feature gates wired (client + server).** Voice, translation (+ language cap), LoRA, and the
  story cap now unlock by plan at launch; enforced in the UI AND server-side (eleven.js voice, fal.js LoRA
  via `planAllows`) so a bypassed client gate still can't reach a premium feature. Credits stay the hard
  usage cap; gates are the product tiering on top. Demo behavior unchanged (gate off). — Mr. K

- **Unified the Factory Floor into one map.** The AI Agents page now shows production line + control room +
  the Maintenance wing (all 12 agents, by wave, with live-status dots) — realizing the captured "AI Agent
  Factory" single-pane vision. Driven by the agent registry so it stays in sync. — Mr. K

- **Shipped the ENTIRE Maintenance agent wing — 12 agents (P0×5, P1×5, P2×2) — in one session, on the
  Phase 0 runner.** P0: 💸 Spend Sentinel (`cost_ledger`), 🚀 Deploy Sentinel (`health_events`), 🔓
  Credit-Tamper Watch (`security_flags`), 🔍 SEO + 🗺️ Sitemap (built a real `/s/<id>` prerender surface —
  `api/share.js` injects per-story OG tags; `api/discovery.js` serves sitemap/robots/llms). P1: 📡 Uptime,
  🩹 Broken-Link, 📚 Catalog Health, 🧬 Data-Integrity, 🛡️ Security Posture. P2: 📦 Dependency & Backup
  (OSV scan), ♿ Accessibility. Crons kept Hobby-safe: 2 total (weekly synthesis + a daily `cron_tick`
  running 9 checks, each alerting Mr. K's inbox on its own). Founder armed 3 new Supabase tables — all
  verified (anon insert 201 / RLS-gated read). Rationale: as the app grows, maintenance needs its own
  server-side agents the public anon key can't power; this completes the roadmap synthesized 2026-09-21. — Mr. K

- **Closed the client-set-grant security hole (server-side signup trigger + column locks).** `signUp` used
  to insert the profile row from the browser with `credits` + `role`, so a user could self-grant unlimited
  credits or `role='admin'`. Fix: an `on_auth_user_created` SECURITY DEFINER trigger creates the profile
  server-side; `revoke insert,update on profiles ... then grant back only (id,username,email)/(username)`
  (a column-level revoke alone was ineffective against Supabase's default table-wide grant — verified).
  End-to-end verified: a throwaway signup gets creator/120 from the trigger; tampering credits or role
  from the user's own session returns 403; username edits still work. Client cleaned up to match. — Mr. K

- **Hid credit balances from users entirely (founder decision).** Removed every user-facing credit display
  (sidebar, creator dashboard, stat tile) and the "Not enough credits" / "out of credits" messaging that
  leaked the mechanic. Credits remain fully enforced server-side; users just never see a number. — Mr. K

- **Acted on the Dependency agent's first real catch: bumped vite 5.4.21 → 7.3.6.** OSV flagged vite; the
  3 vulns in 5.4.x are only fixed in 6+. Upgraded to 7.3.6, `npm audit fix` cleared the transitive
  advisories → `npm audit` 0 vulnerabilities, build clean, prod deploy verified booting. Hardened
  `deps_check` to read locked versions from `package-lock.json` (the range-min mismatch caused the flag). — Mr. K

- **Built out the agent factory + a Maintenance wing.** Completed the 5-station pipeline by adding
  standalone Story + Script bench tools; created the agent registry (`src/lib/agents.js`) as the single
  source of truth; built the Factory Floor map (doubles as navigator) and a top-nav Agents entry; added an
  Overview to-do list; built the Error Agent (clusters + Claude-triages `error_log`). Then ran a 3-desk
  planning pass (Reliability, Growth/SEO, Cost/Security) and synthesized a 12-agent maintenance roadmap
  (`MAINTENANCE_AGENTS.md`) + started Phase 0: the secured runner `api/maintenance.js` (admin-JWT or cron
  auth, holds service-role + provider keys, `selfcheck`) + a Maintenance control-room page. Rationale: as
  the app grows, maintenance (spend, deploys, SEO, data/security) needs its own agents, and they need a
  server-side runner the public anon key can't provide. First 8 commits pushed/live; Error Agent (`9a4721a`)
  and Maintenance (`237f4e9`) committed but UNPUSHED at founder's pause. Next build: Spend Sentinel. — Mr. K

- **BUG FOUND: `cos_daily_logs` anon insert is blocked by RLS (42501) — Mr. K's session-end logging has
  been silently failing.** The documented path (POST with anon key) returns
  `42501 new row violates row-level security policy`, while the sibling `cos_inbox` insert with the *same*
  anon key returns 201. So the live RLS on `cos_daily_logs` does NOT match `db/cos_daily_logs.sql` (which
  declares `for insert with check (true)`) — the file was run before that policy existed, or a restrictive
  policy shadows it. **This is the real reason the weekly synthesis reads "logging discipline collapsed" —
  the logs can't be written, not (only) forgotten.** FOUNDER FIX (one-time, Supabase SQL editor):
  `drop policy if exists "cos_daily_logs insert" on public.cos_daily_logs;`
  `create policy "cos_daily_logs insert" on public.cos_daily_logs for insert with check (true);`
  Until then, today's session log lives only in this file (below). Note: a diagnostic probe row
  ("connectivity probe") was inserted into `cos_inbox` while confirming the anon path — dismiss it in triage. — Mr. K

- **Armed the launch (kept off) + wrote `LAUNCH.md`.** Founder: "arm the launch with fal ready but if not
  we have together to fall back on." Traced the full path: the launch gate is genuinely one-switch
  (`RELEASE_MODE` server + `VITE_RELEASE_MODE` client, both env, + redeploy), and the Fal→Together image
  fallback is already built and robust (`src/lib/claude.js` ~L597–711; Fal primary w/ 60s circuit breaker,
  Together auto-fallback) — no code change needed. Wrote `LAUNCH.md` as the mechanical flip runbook. The one
  hard blocker is founder-only: run `db/spend_credits.sql` in Supabase, or a flipped gate 500s every paid
  action. Flagged a pre-public hole: the initial credit grant is a client insert (`supabase.js:330`), so
  harden to a server-side signup trigger before opening to untrusted users. Gate stays OFF (demo private). — Mr. K

- **Reconciled the CoS tracking docs against git.** The 09-18 "deploy unfinished / RESUME HERE" block in
  `open-questions.md` was stale — the merge + push landed 09-20 (`2159adc`), local `main` == `origin/main`,
  and prod `/api/synthesis` returns JSON. Marked done in `next-steps.md`: gitleaks pre-commit hook + CI
  backstop (`14663e9`) and the synthesis window widened to 30 days (`4d87d87`, `api/synthesis.js:45`).
  Cleared the resolved "Mr. K full port (Phases 2–4)?" question (all phases shipped 09-18). Trigger: the
  live weekly synthesis flagged collapsed logging discipline — this closes the gap between code and docs.
  Single remaining blocker to a tester round is unchanged: fund the providers (Fal + Anthropic). — Mr. K

- **LinkedIn Featured card declined — demo stays private.** Founder: "im not trying to make the demo
  public." The OG-tags + share-card task is out of scope; parked in `next-steps.md`, not deleted, in case
  the project goes public later. No public-sharing work is queued. — Mr. K

## 2026-09-18

- **Mr. K Phase 4 (scheduled synthesis) shipped — Mr. K is now complete (Phases 1–4).** `api/synthesis.js`
  reads recent daily logs + open inbox → Claude → a "🔎 Weekly synthesis" entry. Manual button (admin JWT,
  works now) + Vercel Cron weekly (`vercel.json`, Mondays 14:00 UTC). Automated cron needs the founder to
  add `SUPABASE_SERVICE_ROLE_KEY` at deploy; the manual button needs nothing. — Mr. K

- **Mr. K Phase 3 (daily logs) shipped.** `db/cos_daily_logs.sql` + `addDailyLog`/`fetchDailyLogs` +
  a Daily Log tab on the 🎩 Mr. K page (Inbox / Daily Log). Mr. K writes a dated session summary at
  session end. Awaiting the founder to run the SQL. Only Phase 4 (scheduled synthesis) remains. — Mr. K

- **Mr. K Phase 2 (cloud inbox) shipped.** `db/cos_inbox.sql` (anon insert, admin read/update) + supabase
  helpers + a 🎩 Mr. K page in the AdminDashboard "Yours" group. Founder captures/triages ideas in-app;
  Mr. K captures mid-session by POSTing to `cos_inbox`. Awaiting the founder to run the SQL in Supabase.
  Phases 3 (daily logs) + 4 (scheduled synthesis) still queued. — Mr. K

- **Named the project Chief of Staff "Mr. K" (he/him).** Adapted from the Prism "Chloe" pattern, renamed,
  scoped to this repo. Built Phase 1 (persona in `CLAUDE.md` + this `CoS/` folder). Full port (Supabase
  inbox, daily logs, scheduled synthesis) captured as Phases 2–4 in the plan file. — Mr. K

- **Stop all unprompted AI generation.** Removed the on-mount trending-seeds call and the on-open Story
  Brain auto-backfill; both are button-only now. Rationale: they spent tokens before the user acted, on a
  cost-metered demo. — Mr. K

- **Fal 429 handling = graceful degradation, not a fix.** Added a 60s circuit breaker + fail-fast so a
  throttled Fal account no longer floods the console; panels fall back to Together. The real fix is funding
  Fal — code just stops it being ugly meanwhile. — Mr. K

- **Chapters get first-class controls.** Persistent chapter badge/dropdown in the studio header, a
  delete-chapter action, and a confirm on ＋ New chapter (an accidental click had created a persisted
  "phantom" Chapter 2). — Mr. K

- **QA-hardening over new features while money is paused.** With the demo feature-complete and funding the
  blocker, this session fixed live bugs (moderation RPC, Fal 422/429) rather than starting new builds. — Mr. K
