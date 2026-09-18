# Decisions Log

_Newest first. Mr. K appends decisions at session end, signed `— Mr. K`._

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
