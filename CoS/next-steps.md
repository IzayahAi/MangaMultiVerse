# Next Steps — MangaMultiVerse

_Mr. K's action backlog. Newest priorities at top. Rebuilt from the closed-session daily
logs (25 sessions through 2026-09-28). Last updated 2026-09-29._

---

## 🔴 Blockers to a real tester round (owner: founder)

- [ ] **`spend_credits` RPC is still not live (verified HTTP 404 / PGRST202 today).** The function
      exists but PostgREST hasn't cached it. One line in the Supabase SQL editor finishes it:
      `NOTIFY pgrst, 'reload schema';` (or toggle any API setting to force a reload). Until the probe
      returns 401/403 instead of 404, flipping `RELEASE_MODE` will 500 on every paid action. See `LAUNCH.md`.
- [ ] **Founder create-flow smoke test.** Reader path is verified live; the *create* path has never been
      run end-to-end with a working key. Now that the anon key is fixed (below), do: sign up → create a
      story → generate a chapter (confirm the art renders) → publish. This is the gate on trusting the demo.

## 🟠 Now unblocked by today's anon-key fix — verify these

- [x] **Panel art → database, end-to-end (verified 2026-09-29).** Confirmed live: `POST /api/image`
      returns `panel-art` storage URLs and they persist in `script.panel_images` (spot-checked reachable).
      Went further: rehosted 356 legacy external provider URLs into the bucket (`panel_images` now 100%
      own-bucket, 0 external), handled 3 dead links, and recovered the in-flight drafts' art. Then fixed
      the *root-cause* Studio save bug so art stops drifting out of the DB (see Recently shipped). No known
      panel-art gaps remain.
- [x] **Panel-art uploads confirmed succeeding (2026-09-29).** The storage upload path works with the
      restored anon key (verified end-to-end above). _Note: error_log inserts + credit charging were not
      separately re-exercised this session — they share the now-confirmed-working key, so fold a dedicated
      spot-check into the create-flow smoke test above._

## 🟡 Harden before PUBLIC (not required for a trusted tester round)

- [ ] **Move the initial credit grant server-side.** Today it's a client insert (`supabase.js:330`), so a
      user could seed their own starting balance. Move it to a `handle_new_user` trigger. The atomic RPC
      stops over-spending, not a doctored initial grant.
- [ ] **Close the demo credit-balance gap.** On the demo a user can edit their own client-side balance.
      Not a key/security leak (the real app enforces server-side via `_guard.js` + `_pricing.js`) — a
      demo-only limitation worth knowing.
- [ ] **Delete the old stale Supabase project** (`hhjyfwgujmiiariqtaix`) once nothing needs it.
- [ ] **Make the repo private** — optional now that keys are rotated.

## 🟢 Ops / maintenance agents

- [x] **`CRON_SECRET` — added & verified (2026-09-28).** Set cleanly in Vercel production (newline-free) and
      confirmed live via `GET /api/maintenance?check=selfcheck` → `actor:"cron"`, `cron_secret:true`, HTTP 200.
      Note: this was **optional, not a blocker** — the daily `cron_tick`/auto-heal already authorizes via the
      platform-injected `x-vercel-cron` header (`api/maintenance.js:30`), independent of the secret. `CRON_SECRET`
      only enables *external* manual triggering (curl the endpoint without an admin login).
- [x] **Runner armed — service-role key fixed (2026-09-28).** `selfcheck` now returns `armed:true`,
      `serviceRead:"ok"`. Root cause: the `SUPABASE_SERVICE_ROLE_KEY` in Vercel prod had a trailing newline
      (added via `echo` — same footgun as CRON_SECRET), so `Bearer <jwt>\n` was an invalid JWT → RLS denied. Fixed
      by re-adding the known-good `service_role` key (from `.env.local`, verified `role:service_role`) newline-free
      via `printf %s | vercel env add` + `vercel --prod`. Spend Sentinel / Health Medic / Translator Queue can now
      read past RLS.
- [ ] **Verify the two data-writer agents on a throwaway story before cron-promoting:** Health Medic's
      `medic_heal` (does the reader pick up panels it writes to `script.panel_images`?) and the Translator
      Queue (does a written translation render? confirm the `translations` shape).

## 🔵 Growth / launch

- [ ] **Announce the demo.** Run the incognito smoke test (guest read → sign up → create → render → publish →
      ⚑ report → admin hide), then share the LinkedIn limited-beta post. The 50-account hard cap is live, so
      scarcity framing ("first 50 creators") is accurate.
- [ ] **Billing go-live (only when monetizing).** Create Stripe products/prices, set the keys + price IDs +
      webhook in Vercel, run `db/billing.sql`, then flip `RELEASE_MODE`/`VITE_RELEASE_MODE`. Full checklist:
      `BILLING_SETUP.md`. (`spend_credits` + the signup trigger are already run; item #1's cache reload is the
      remaining gate.)

## ⚪ Provider funding — parked ("all we need is money")

- [ ] Fund the quality art tier: `DEEPINFRA_API_KEY` (primary, already set in Vercel) + a funded Together
      account (fallback) + an Anthropic budget (~$15–25). Optional — the free Together FLUX fallback keeps the
      demo fully functional unfunded. Not a launch blocker.

---

## ✅ Recently shipped (from the closed sessions)

- **2026-09-29 — Studio panel-art SAVE bug fixed at the source (both chapter paths).** Save/autoSave/
  updateLive/publish (Ch.1) and `chapterScript`/`persistChapterN` (Ch.2+) blindly overwrote `panel_images`
  with component state, so an empty/partial state wiped DB art; the autosave dedup was count-only, so
  same-count regenerations never persisted. Fix: merge current hosted art OVER the stored floor
  (`panelImagesForSave` for Ch.1, chapter-row floor for Ch.2+) + a content-hash autosave signature
  (`panelSig`). Commits `d0497a0` + `abbc9ab` → deployed → verified live on Glitch Run (Ch.1), The Inverted
  Dungeon Ch.2, and Silent Resonance Ch.2. No known panel-art gaps remain.
- **2026-09-29 — Panel art fully persisted to the DB.** Verified the storage fix end-to-end; rehosted 356
  external provider URLs into the `panel-art` bucket (`panel_images` now 100% own-bucket, 0 external);
  nulled 3 dead links (later regenerated); recovered 3 drafts' browser-cached art to the DB (Glitch Run,
  Silent Resonance, Crimson Inherit — all 50/50).
- **2026-09-29 — Temp `_debug` diagnostic removed** from `api/_storage.js` + `api/image.js` once panel-art
  persistence was confirmed (commit `e5ba7ba`, deployed, smoke-tested clean).
- **2026-09-28/29 — Maintenance runner fully armed.** `CRON_SECRET` added clean + `SUPABASE_SERVICE_ROLE_KEY`
  newline corruption fixed → `selfcheck` `armed:true`, `serviceRead:"ok"` (details in the Ops section).
- **2026-09-28 — Studio `Object.values(null)` crash fixed.** Surfaced by the Error Agent; root cause was
  `typeof null === "object"`. Null guards added at both sites. PR #1 merged → deployed → verified live.
- **2026-09-28 — `SUPABASE_ANON_KEY` empty-in-Vercel bug fixed.** 15 dashboard re-saves had all landed empty
  (known Vercel bug). Wrote the correct 208-char key via the authenticated CLI, redeployed, and verified the
  server-side Supabase read works (live sitemap returns real stories). error_log resolved rows cleared; a
  scoped `scripts/clear-resolved-errors.sh` + permission rule added.
- **2026-09-28 — Hard 50-account demo cap** shipped + verified (`db/signup_cap.sql`, DB-enforced), with the
  share card + LinkedIn post reframed as a limited beta.
- **2026-09-23 — Panel art quality** made full-color + scene-driven; found art had never reached the DB and
  shipped the storage-bucket fix (verification was blocked on the anon key — see above).
- **2026-09-22 — Public demo LIVE** at mangaverse-deploy.vercel.app; reader path smoke-tested green. Pricing
  fully restructured (Stripe, behind `RELEASE_MODE`); legal pages + teen-first ratings + support email shipped.
- **2026-09-21/22 — 12 maintenance agents** built on the Phase 0 runner (all DB tables now exist), plus the
  P3 autonomous+approval wave (Moderator, Health Medic, Curator, Translator Queue).
- **2026-09-20/21 — Mr. K live** (`/api/synthesis` 200, weekly cron), logging RLS fixed, launch armed (`LAUNCH.md`).

_— Mr. K_
