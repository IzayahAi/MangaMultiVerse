# Maintenance Agent Roadmap

_MangaMultiVerse — the maintenance wing of the agent factory. Created 2026-09-21._

These agents **maintain the app/website** (reliability, growth/SEO, cost, data, security) —
distinct from the content-generation LINE and from the existing Control Room brains
(Mr. K, Story Brains, Ops Brain, Error Agent). They form a new **Maintenance** sub-group
in the Control Room. Registry data lives in `src/lib/agents.js` (`MAINTENANCE`); the
runtime home is `src/components/MaintenancePage.jsx` + the secured runner `api/maintenance.js`.

Each agent = an admin surface (or a cron) that reads data (Supabase / live) and optionally
calls Claude to analyze it. None re-cluster client errors — that stays the Error Agent's job;
they only read `error_log` as a signal.

## Phase 0 — the secured maintenance runner (PREREQUISITE)

Most of these agents must read **across users and policies** (spend per account, `profiles`
balances, RLS config) — which the public anon key cannot do. So the first build is one
secured server-side runner, not an agent:

- **`api/maintenance.js`** — a serverless function that authorizes an **admin JWT** (verified
  against the caller's own `profiles.role`) **or** a trusted **Vercel cron** (`CRON_SECRET`),
  then dispatches named `checks`. It holds the server-only secrets the agents need
  (`SUPABASE_SERVICE_ROLE_KEY`, provider billing keys) so admin pages never carry them.
- Ships with a `selfcheck` that reports which capabilities are wired (service-role key,
  cron secret, provider keys) and whether the service key can read past RLS — **never returns
  secret values**.
- Founder action to fully arm it: add `SUPABASE_SERVICE_ROLE_KEY` (already set for the
  synthesis cron) and a new `CRON_SECRET` to Vercel env.

Build 7 of the 12 agents on top of this. **Status: SHIPPED (2026-09-21).**

## Wave 1 — P0

| Agent | Purpose | Trigger | New infra |
|---|---|---|---|
| 💸 **Spend Sentinel** ✅ | Per-provider/per-action AI spend + Fal 429 rate vs. budget; alert on runaway burn | cron hourly + button | `cost_ledger` table, provider billing keys |
| 🚀 **Deploy Sentinel** | After push-to-main, verify deploy boots + every `api/*` proxy + Supabase respond | deploy hook | `deploy_checks` table, Vercel token, health branch per proxy |
| 🔓 **Credit-Tamper & Abuse Watch** | Detect the client-set-grant tamper hole + demo-cap evasion (balances > 120, IP rotation) | cron 6h | service-role key, `security_flags` table |
| 🔍 **SEO & Social Metadata Agent** | Audit + generate per-story OG/meta (SPA ships zero OG tags — shares render blank) | on-publish + cron | ⚠️ prerender/head-injection surface, else report-only |
| 🗺️ **Sitemap & Discovery Agent** | Emit `sitemap.xml` / `robots.txt` / `llms.txt` so crawlers find the catalog | cron daily | stable per-story public slugs |

**Why first:** closes the three biggest gaps — silent bad deploys, uncapped/abusable AI spend
(the founder's #1 concern + the funding blocker), and a catalog that's invisible + unshareable.

## Wave 2 — P1

| Agent | Purpose |
|---|---|
| 📡 **Uptime & Health Monitor** | Continuous liveness of prod + 4 proxies + Supabase + synthesis freshness |
| 🩹 **Broken-Link & Dead-Asset Checker** | Dead covers, missing chapters, orphaned Storage refs |
| 📚 **Catalog Health & Quality Scanner** | Score published stories (stub chapters, generic titles, thin taglines) |
| 🧬 **Data-Integrity Checker** | Orphaned/inconsistent rows (translations→missing chapters, >12-lang limit) |
| 🛡️ **Security Posture Auditor** | RLS on for every table + no secret leaks in the bundle |

## Wave 3 — P2

| Agent | Purpose |
|---|---|
| 📦 **Dependency & Backup Sentinel** | `npm audit` triaged by Claude + a restorable Supabase backup exists |
| ♿ **Accessibility & Alt-Text Auditor** | a11y audit + vision-generated alt-text for covers/panels (reuses Catalog Scanner LLM) |

## Shared infra to design up front

- **Tables:** `cost_ledger`, `security_flags`, one `health_events` (deploy+uptime), `asset_health`.
- **Two hard blockers:** the Phase 0 service-role runner (in progress), and a **prerender
  surface** so the SEO agent's generated meta actually takes effect (else it's report-only).

## Recommended build order

Phase 0 runner → 💸 Spend Sentinel → 🚀 Deploy Sentinel → the 🔍/🗺️ SEO pair.
Protects the money, protects prod, opens the growth funnel — and the first three don't need
the prerender decision.

## Shipped log

- **2026-09-21 — Phase 0 runner + 💸 Spend Sentinel (Wave 1, first agent).** `api/maintenance.js`
  `spend_summary` check totals AI spend per provider/action over 1h/24h/7d from the new `cost_ledger`
  table (written best-effort by every charged proxy call via `_guard.logSpend`), watches the Fal 429
  rate, grades against `BUDGET` in `api/_pricing.js`, and drops an over-budget alert into Mr. K's inbox
  on the hourly Vercel cron. UI: a spend panel on the Maintenance page. **Founder setup:** run
  `db/cost_ledger.sql` (the service-role key is already set for the synthesis cron). Next: 🚀 Deploy Sentinel.

---
_Source: synthesized from a 3-desk planning pass (Reliability, Growth/SEO, Cost/Data/Security)._
