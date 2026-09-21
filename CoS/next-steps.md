# Next Steps — MangaMultiVerse

_Mr. K's action backlog. Newest priorities at top. Last updated 2026-09-21._

## 🟣 Pending from the 2026-09-21 build session

- [ ] **Push 2 local commits** (`9a4721a` Error Agent, `237f4e9` Maintenance wing + Phase 0 runner) to
      deploy them. Held at founder's pause. Docs+UI only; no behavior change to the demo.
- [ ] **Arm the maintenance runner** — add `SUPABASE_SERVICE_ROLE_KEY` (already set for the synthesis cron)
      and a new `CRON_SECRET` to Vercel env. Until then `api/maintenance.js` authorizes admins but reports
      "not armed" and the maintenance agents can't read past RLS.
- [ ] **Finish spend_credits** — run `NOTIFY pgrst, 'reload schema';` in Supabase (deferred). The RPC exists
      but PostgREST hasn't cached it, so the launch gate would still 500 on paid actions if flipped.
- [ ] **Next build:** Wave 1 P0 maintenance agents — start with 💸 **Spend Sentinel** (founder's #1 concern).
      Full roadmap in `MAINTENANCE_AGENTS.md`.

## 🔴 Blocker (owner: founder)

- [ ] **Fund the providers before a tester round.** Fal (~$30–50) + Anthropic (~$15–25). Until then the
      demo runs but images fall back to Together (slower, lower fidelity) and story/synthesis calls are
      capped. This is the single thing gating a real tester round. Status: parked ("all we need is money").

## ✅ Fixed 2026-09-21 — Mr. K logging RLS

- [x] **`cos_daily_logs` anon insert was RLS-blocked (42501); now returns 201.** Founder ran the corrected
      insert policy (`with check (true)`) on project `kkpzbfhnpvhnykxitnon`; verified with a live anon POST.
      This was the true cause of synthesis reading "logging discipline collapsed" — the anon insert path had
      never worked; only service-key writes (backfill + cron read) did. Session logs now post cleanly.

## 🟠 Launch prep (do before flipping to real users)

- [x] **Launch armed + runbook written** (2026-09-21, `LAUNCH.md`). Verified the gate is one-switch ready:
      two env vars (`RELEASE_MODE` server + `VITE_RELEASE_MODE` client) + redeploy. Confirmed the Fal→Together
      image fallback is already built and robust (`src/lib/claude.js` ~L597–711) — no code needed. `LAUNCH.md`
      has the exact flip sequence, verify curls, and rollback.
- [~] **FOUNDER — `db/spend_credits.sql` ran, but the RPC isn't live yet (PGRST202).** The function was
      created but PostgREST can't see it — stale schema cache. One-liner in the Supabase SQL editor to
      finish: `NOTIFY pgrst, 'reload schema';` (or toggle any API setting to force a reload). Until the
      probe returns 401/403 instead of 404, flipping the gate will still 500 every paid action. See `LAUNCH.md`.
- [ ] **Before flipping:** set both env vars together + redeploy (client gate is build-time). Do at launch,
      not before.
- [ ] **Harden before PUBLIC (not before a trusted tester round):** move the initial credit grant from the
      client insert (`supabase.js:330`) to a server-side `handle_new_user` trigger — today a user could seed
      their own starting balance. The atomic RPC stops over-spending, not a doctored initial grant.
- [ ] **Close the demo credit-balance gap.** On the demo, a user can edit their own client-side credit
      balance. Not a security/key leak (the real app enforces server-side via `_guard.js` + `_pricing.js`),
      but worth knowing it's a demo-only limitation.

## 🟡 Security hardening (deferred from the 2026-09-18 session — none blocking)

- [x] **gitleaks pre-commit hook** — shipped 2026-09-20 (`14663e9`): `scripts/hooks/pre-commit` runs
      `gitleaks protect --staged` + `.github/workflows/gitleaks.yml` CI backstop. One-time local setup
      (install binary + `git config core.hooksPath scripts/hooks`) is documented in `CLAUDE.md`.
- [ ] **Make the repo private** — optional now that all keys are revoked/rotated.

## 🟢 Mr. K system (from the 2026-09-20 deploy session)

- [x] Mr. K live in production — `/api/synthesis` returns 200; weekly cron active (Mondays 14:00 UTC).
- [x] Session-end daily logging made mandatory in repo + workspace CLAUDE.md.
- [x] Backfilled last-14-days daily logs from saved sessions (5 entries, 09-04 → 09-20).
- [x] **Synthesis window widened to 30 days** — shipped 2026-09-20 (`4d87d87`). `api/synthesis.js:45`
      now reads `30 * 864e5`, so the 09-04/09-05 backfill entries are within range and the weekly cron
      sees the full history.

## 🔵 Portfolio / personal (from the 2026-09-04 session)

- [~] **LinkedIn Featured card** — DECLINED 2026-09-21. Founder is not making the demo public, so a public
      share card is out of scope. OG tags + `og.png` stay unshipped. Revisit only if the project goes public.

## 🔭 Vision (captured, not scheduled)

- [ ] **Agent Factory floor** — captured vision, needs security Phase 1 live first (now done, so unblocked
      to *plan* when ready). Not scheduled.
