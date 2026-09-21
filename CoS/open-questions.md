# Open Questions — waiting on a decision or blocked

_Mr. K keeps this current. Resolved questions move to `decisions-log.md`._

## ✅ Deploy is live (resolved 2026-09-20, verified 2026-09-21)

The 09-18 "deploy unfinished" blocker is closed. The merge + push landed (`2159adc`), local `main` ==
`origin/main` with nothing unpushed, and prod `https://mangaverse-deploy.vercel.app/api/synthesis` returns
JSON — Mr. K is live in production and the weekly cron is active. Nothing to resume here.

## Blocking

- **Fund the providers before a tester round?** Fal (~$30–50) + Anthropic (~$15–25). Until then the demo
  runs but images fall back to Together (slower/lower-fidelity). Decision owner: founder. Status: parked
  ("lets pause on the demo for now all we need is money").

## Waiting / to decide

- **Arm `db/spend_credits.sql` + `RELEASE_MODE`?** The secure credit path is coded but the SQL isn't run
  and the gate is off (demo). Flip at launch.
- **Agent Factory floor** — captured vision, not scheduled. Needs Phase 1 of the security work live first.

## Captured ideas (not yet acted on)

_(Mr. K logs stray mid-session ideas here.)_
