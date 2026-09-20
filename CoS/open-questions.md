# Open Questions — waiting on a decision or blocked

_Mr. K keeps this current. Resolved questions move to `decisions-log.md`._

## ▶️ RESUME HERE (paused 2026-09-18 — founder hit token limit until Sunday)

**Deploy is unfinished.** All session work is committed locally (`5c517a8` on `main`); backup branch
`backup-pre-reconcile-2026-09-18` holds the pre-reconcile state. Production still runs an OLD GitHub commit,
so Mr. K + this session's fixes are NOT live yet. The sandbox blocked the last two git steps — the founder
runs them (from the project folder):
1. `git merge -s ours origin/main -m "Merge origin/main: local tree supersedes earlier fal/eleven/claude commits"`
2. `git push origin main`  → Vercel auto-deploys.
Then verify `https://mangaverse-deploy.vercel.app/api/synthesis` returns JSON (not the SPA HTML).
Reminder: `SUPABASE_SERVICE_ROLE_KEY` is already set in Vercel (for the weekly cron). SQL for cos_inbox +
cos_daily_logs is already run. Fal funding still the demo blocker.

## Blocking

- **Fund the providers before a tester round?** Fal (~$30–50) + Anthropic (~$15–25). Until then the demo
  runs but images fall back to Together (slower/lower-fidelity). Decision owner: founder. Status: parked
  ("lets pause on the demo for now all we need is money").

## Waiting / to decide

- **Mr. K full port (Phases 2–4)?** Phase 1 (persona + these files) is live. Do we build the Supabase
  inbox, daily logs, and scheduled synthesis next, or leave Mr. K lightweight until after launch? Founder
  asked for a full port; Phase 1 shipped first as the prerequisite.
- **Arm `db/spend_credits.sql` + `RELEASE_MODE`?** The secure credit path is coded but the SQL isn't run
  and the gate is off (demo). Flip at launch.
- **Agent Factory floor** — captured vision, not scheduled. Needs Phase 1 of the security work live first.

## Captured ideas (not yet acted on)

_(Mr. K logs stray mid-session ideas here.)_
