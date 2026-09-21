# Next Steps — MangaMultiVerse

_Mr. K's action backlog. Newest priorities at top. Last updated 2026-09-20._

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

- [ ] **gitleaks pre-commit hook** — secret scanning so a key can never be committed again. ~10 min.
- [ ] **Make the repo private** — optional now that all keys are revoked/rotated.

## 🟢 Mr. K system (from the 2026-09-20 deploy session)

- [x] Mr. K live in production — `/api/synthesis` returns 200; weekly cron active (Mondays 14:00 UTC).
- [x] Session-end daily logging made mandatory in repo + workspace CLAUDE.md.
- [x] Backfilled last-14-days daily logs from saved sessions (5 entries, 09-04 → 09-20).
- [ ] **Decide: widen the synthesis window?** `api/synthesis.js:45` reads only the last 14 days
      (`14 * 864e5`). The 09-04 and 09-05 backfill entries fall outside it, so the weekly cron won't see
      them. Bump to 21 or 30 days if you want deeper history to influence synthesis. One-line change + redeploy.

## 🔵 Portfolio / personal (from the 2026-09-04 session)

- [ ] **LinkedIn Featured card** — needs OG tags + a redeploy; `og.png` is already in `public/`. ~10 min.

## 🔭 Vision (captured, not scheduled)

- [ ] **Agent Factory floor** — captured vision, needs security Phase 1 live first (now done, so unblocked
      to *plan* when ready). Not scheduled.
