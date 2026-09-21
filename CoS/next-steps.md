# Next Steps — MangaMultiVerse

_Mr. K's action backlog. Newest priorities at top. Last updated 2026-09-21._

## 🔴 Blocker (owner: founder)

- [ ] **Fund the providers before a tester round.** Fal (~$30–50) + Anthropic (~$15–25). Until then the
      demo runs but images fall back to Together (slower, lower fidelity) and story/synthesis calls are
      capped. This is the single thing gating a real tester round. Status: parked ("all we need is money").

## 🟠 Launch prep (do before flipping to real users)

- [ ] **Arm the secure credit path + flip `RELEASE_MODE`.** `db/spend_credits.sql` is coded but not run;
      the gate is OFF (demo). Running the SQL + flipping `RELEASE_MODE` (client `src/constants.js` + server
      `api/_pricing.js`) turns on strict auth + pricing. Also re-enables translation (`TRANSLATION_ENABLED
      = RELEASE_MODE`). Do at launch, not before.
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
