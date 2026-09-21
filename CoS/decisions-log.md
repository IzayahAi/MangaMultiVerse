# Decisions Log

_Newest first. Mr. K appends decisions at session end, signed `— Mr. K`._

## 2026-09-21

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
