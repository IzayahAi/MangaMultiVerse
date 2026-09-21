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
| 🚀 **Deploy Sentinel** ✅ | After push-to-main, verify deploy boots + every `api/*` proxy + Supabase respond | cron daily + button | `health_events` table |
| 🔓 **Credit-Tamper & Abuse Watch** ✅ | Detect the client-set-grant tamper hole + demo-cap evasion (balances > 120, IP rotation) | cron daily + button | service-role key, `security_flags` table |
| 🔍 **SEO & Social Metadata Agent** ✅ | Audit + generate per-story OG/meta (SPA ships zero OG tags — shares render blank) | button + cron | ✅ prerender surface built (`api/share.js` at `/s/<id>`) |
| 🗺️ **Sitemap & Discovery Agent** ✅ | Emit `sitemap.xml` / `robots.txt` / `llms.txt` so crawlers find the catalog | button + cron | ✅ per-story `/s/<id>` slugs built |

**Why first:** closes the three biggest gaps — silent bad deploys, uncapped/abusable AI spend
(the founder's #1 concern + the funding blocker), and a catalog that's invisible + unshareable.

## Wave 2 — P1

| Agent | Purpose |
|---|---|
| 📡 **Uptime & Health Monitor** ✅ | Continuous liveness of prod + 4 proxies + Supabase + synthesis freshness |
| 🩹 **Broken-Link & Dead-Asset Checker** ✅ | Dead covers, missing chapters, orphaned Storage refs |
| 📚 **Catalog Health & Quality Scanner** ✅ | Score published stories (stub chapters, generic titles, thin taglines) |
| 🧬 **Data-Integrity Checker** ✅ | Orphaned/inconsistent rows (translations→missing chapters, >12-lang limit) |
| 🛡️ **Security Posture Auditor** ✅ | RLS on for every table + no secret leaks in the bundle |

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
  `db/cost_ledger.sql` (the service-role key is already set for the synthesis cron). ✅ armed 2026-09-21.

- **2026-09-21 — 🚀 Deploy Sentinel (Wave 1, agent 2).** `deploy_check` probes the live deploy (app root,
  every `api/*` proxy via OPTIONS = no spend, Supabase REST), grades it (app/supabase down = alert, proxy
  down = warn), records to the new `health_events` table, and alerts Mr. K's inbox on the cron. Crons
  consolidated to stay Hobby-safe: a single **daily `cron_tick`** runs spend_summary + deploy_check
  together (replacing the standalone hourly spend cron), so the wing uses 2 crons total (synthesis weekly
  + cron_tick daily). UI: a health panel on the Maintenance page. **Founder setup:** run
  `db/health_events.sql` (optional — the check runs live without it; the table persists history + enables
  alerts). ✅ armed 2026-09-21.

- **2026-09-21 — 🔓 Credit-Tamper & Abuse Watch (Wave 1, agent 3).** `tamper_watch` reads `profiles` past
  RLS (service role) and flags the fallout of the client-set-grant hole (`signUp` inserts `credits` + `role`
  from the browser): over-grant balances (> demo grant, non-admin), negative credits, unexpected admin
  accounts, and a 24h signup burst. Records to the new `security_flags` table, alerts Mr. K's inbox on the
  cron, and surfaces the remediation (a server-side signup trigger — its own hardening ticket, see
  LAUNCH.md). Folded into the daily `cron_tick` (still 2 crons total). UI: an accounts-scan panel on the
  Maintenance page. **Founder setup:** run `db/security_flags.sql` (optional — the scan runs live without
  it). **Wave 1 P0: 3 of 5 shipped.**

- **2026-09-21 — 🔍 SEO + 🗺️ Sitemap pair (Wave 1, agents 4–5) → WAVE 1 COMPLETE.** Built the missing
  connective tissue: a canonical **`/s/<id>` public story URL**. `api/share.js` serves that route as the
  SPA shell with per-story OG/meta injected into `<head>` (the prerender surface — SEO is no longer
  report-only); `api/discovery.js` serves `/sitemap.xml`, `/robots.txt`, `/llms.txt` listing every
  published story at `/s/<id>`; App.jsx gained a deep-link handler so `/s/<id>` opens that story in the
  reader. Two runner checks — `discovery_check` (files served + URL count) and `seo_audit` (per-story
  meta coverage) — folded into `cron_tick` and shown in a Discovery & SEO panel. vercel.json routes the
  four paths ahead of the SPA catch-all. No new tables (reuses `health_events`); nothing for the founder
  to run. Note: the demo is private today, so this pays off when it goes public — built now to finish the
  wave. **Wave 1 P0: 5 of 5 shipped ✅.** Next up: Wave 2 (P1) internal-health agents.

- **2026-09-21 — Wave 2 (P1) internal health: all 5 shipped ✅.** Five runner checks, all reading past RLS
  with the service role, no new tables (reuse `health_events` with per-agent `kind`):
  📡 `uptime_check` (prod + Supabase liveness + weekly-synthesis freshness), 🩹 `links_check` (published
  stories missing a cover or rendered panel art), 📚 `catalog_check` (0–100 quality score per story:
  title/tagline/logline/chapters/tags/cover), 🧬 `integrity_check` (orphaned translations/bibles +
  stories over the 12-language cap), 🛡️ `posture_check` (scans the deployed JS bundle for leaked provider
  secrets — reports pattern names + counts only, never values — and probes that admin-only tables aren't
  anon-readable). uptime/integrity/posture fold into the daily `cron_tick` with inbox alerts; links +
  catalog are on-demand quality audits (button-only). UI: a combined "Wave 2 · Internal health" panel.
  **Wave 2 P1: 5 of 5 shipped ✅.** Remaining: Wave 3 (P2) — Dependency & Backup, Accessibility & Alt-Text.

---
_Source: synthesized from a 3-desk planning pass (Reliability, Growth/SEO, Cost/Data/Security)._
