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

- **Billing go-live: founder Stripe setup.** The pricing/subscription code is shipped but inert. Needs:
  create Stripe products/prices, set `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` + price IDs in Vercel,
  register the webhook, run `db/billing.sql`, then flip `RELEASE_MODE`/`VITE_RELEASE_MODE`. Full checklist:
  `BILLING_SETUP.md`.
- **Hide credit balance from everyone, or show it to paying users?** Built to show the balance to paid
  plans (so they know when to top up) and hide on Free — but the founder earlier wanted it fully hidden.
  Confirm which before launch.

- **Arm `db/spend_credits.sql` + `RELEASE_MODE`?** The secure credit path is coded but the SQL isn't run
  and the gate is off (demo). Flip at launch. (Note: the client-set-grant hole is now closed server-side
  regardless — signup trigger + profiles.role/credits column locks, verified 2026-09-21.)
- **Promote maintenance agents from manual → autonomous?** All 12 are built; uptime/integrity/posture/
  deps/spend/deploy/tamper already run on the daily `cron_tick` with inbox alerts. Next level is
  approval-gated auto-remediation (the Tier-3 "ACTION NEEDED" pattern) — not scheduled.
- **Agent Factory floor** — captured vision, not scheduled. The Phase 1 security plumbing it depends on is
  now largely in place.

## Captured ideas (not yet acted on)

- **SEO/Sitemap pays off when the demo goes public.** Built now (Wave 1) but the demo is private, so the
  `/s/<id>` prerender + sitemap/robots/llms only matter once discovery is wanted.
- **Bundle-size follow-up.** The build warns the main chunk is >500 KB; code-splitting is deferred, non-urgent.
