# Working Hypotheses — Mr. K's read on the founder's priorities

_Last updated: 2026-11-19. Mr. K revises this when new evidence shifts the read._

## Current read

- **Depth over breadth.** The founder values multi-chapter series (a story people follow) over more
  one-shots — "creating more chapters is more important than more stories." Demo caps reflect this:
  2 stories × 3 chapters, 50 panels/chapter.

- **Cost discipline is a live concern, not abstract.** Repeated moves to cut token/API spend: English-only
  translation in demo, voice off, per-IP caps, and — this session — killing all unprompted AI generation.
  The founder notices spend and reacts to it. Assume any "it's generating on its own" report is a priority.

- **The blocker is now readiness, not money (2026-11-19).** Providers are funded and the founder says
  "budget is fine." What actually stalls launch is reliability drift during gaps — after ~5 weeks away the
  Anthropic key had lapsed and a latent 60s timeout surfaced. Expect each return-from-break session to
  start with a health sweep before new work.

- **Cautious about going public.** Skipped publishing even a throwaway smoke-test story (2026-11-19).
  Public-facing steps get an explicit yes from him; don't publish on his behalf.

- **Founder is the orchestrator; Claude executes.** He runs secrets himself (never hands over keys), runs
  the Supabase SQL himself, and wants Claude to build + verify. He corrects course quickly when Claude jumps
  ahead ("i wasnt done") — pace to his lead.

- **He thinks in systems.** Interested in an "AI Agent Factory," an admin brain, and now a named Chief of
  Staff. He's building an operation, not just an app. Capture the vision even when it's not scheduled.
  _Reinforced 2026-09-21:_ greenlit and drove the entire 12-agent Maintenance wing (P0→P2) in a single
  session — he invests in durable infrastructure/observability, not just features. Works phase-by-phase
  ("next," "wave 2," "wave 3") and expects each shipped + verified before moving on.

- **He wants the product opaque to users about its mechanics.** Directed that users "should never know how
  much credits they have" — hide the metering entirely (enforce server-side, show nothing). Pairs with the
  security instinct this session (closing the client-set-grant tamper hole). Lean toward: don't surface
  internal accounting/limits in the UI unless he asks; keep enforcement server-side and invisible.

- **UI clarity matters to him.** Pushed to consolidate scattered tabs into one dashboard; flagged not being
  able to tell which chapter he was on. Small legibility gaps are worth fixing promptly.

## Retired / superseded

- ~~**The one blocker is money, not code**~~ (2026-09-21 read) — retired 2026-11-19: providers funded,
  founder confirmed budget is fine; superseded by "readiness, not money" above.
