# LAUNCH — arming checklist for MangaMultiVerse

_Last updated: 2026-09-21. The demo runs with `RELEASE_MODE` **off**. This file is the exact, mechanical
sequence to flip to live. Nothing here is done automatically — flipping the gate is a deliberate act._

## State: armed, not flipped

The code is one-switch ready. The launch gate is a single boolean read from env on both sides:
- **Server:** `api/_pricing.js` → `RELEASE_MODE = process.env.RELEASE_MODE === "true"`
- **Client:** `src/constants.js` → `RELEASE_MODE = import.meta.env.VITE_RELEASE_MODE === "true"`
  (and `TRANSLATION_ENABLED = RELEASE_MODE`, so translation re-enables automatically)

While off: provider keys stay server-side (the security win is always on), but auth + credit charging are
skipped and per-IP daily caps (`DEMO_LIMITS`) keep demo spend sane.

## Image providers — Together primary, DeepInfra fallback (Fal demoted 2026-09-22)

Orchestrated client-side in `src/lib/claude.js` (`generatePanelImage`). Each step falls through on failure:

1. **Together** (`/api/image`) is PRIMARY: `Rundiffusion/Juggernaut-Lightning-Flux` (paid, ~$0.0017/MP —
   ~10× cheaper than Fal; needs a **funded** Together account) → `FLUX.1-schnell-Free` (free) → `SDXL`
   (free), with 429 backoff (honors `x-ratelimit-reset`), 30s timeout, and model failover.
2. **DeepInfra** (`/api/deepinfra`) is the FALLBACK: `FLUX-1-schnell` (cheap, and no aggressive input
   content-filter, so combat/dark prompts render instead of 422-ing). Needs `DEEPINFRA_API_KEY`; the call
   no-ops cleanly until that env is set.
3. **Fal** is DEMOTED — still fully wired but OFF (`FAL_ENABLED=false`, the default). Set
   `VITE_FAL_ENABLED=true` (client build env) + redeploy to bring it back with no code change.

**Founder setup for the quality tier:** (a) **fund the Together account** so Juggernaut Lightning serves —
unfunded, it 402s and silently falls to the free FLUX, so the demo still renders for $0; (b) add
**`DEEPINFRA_API_KEY`** in Vercel (+ `.env.local` for local dev) for the fallback. Fal's `FAL_KEY` is now
unused. Panels are charged/counted exactly once regardless of which provider serves them.

## THE blocker you must clear first (only you can — DDL needs the SQL editor)

Run **`db/spend_credits.sql`** once in the Supabase SQL editor. It creates the atomic
`public.spend_credits(int)` RPC that `_guard.js` calls to charge credits when the gate is on. **If you flip
`RELEASE_MODE` on without this, every paid action 500s** ("Credit check failed (404)") and the app breaks
for signed-in users.

Verify it exists afterward (anon key is fine to check presence; it will 401/permission-error rather than
404 once the function is defined):

```bash
URL="$(grep '^SUPABASE_URL=' .env.local | cut -d= -f2-)"
ANON="$(grep '^SUPABASE_ANON_KEY=' .env.local | cut -d= -f2-)"
curl -s -o /dev/null -w "spend_credits RPC -> HTTP %{http_code}\n" \
  -X POST "$URL/rest/v1/rpc/spend_credits" \
  -H "apikey: $ANON" -H "Authorization: Bearer $ANON" \
  -H "Content-Type: application/json" -d '{"p_amount":0}'
# 404 = NOT created yet (still the blocker). 401/403 = created (anon correctly rejected). Good.
```

## The flip (do all three together, then redeploy)

The client gate is **build-time** (Vite), so a redeploy is required for `VITE_RELEASE_MODE` to take effect.
Flip both vars together — if client and server disagree, one side charges while the other thinks it's demo.

1. Vercel → project env: set **`RELEASE_MODE=true`** (server) and **`VITE_RELEASE_MODE=true`** (client build).
2. Confirm `SUPABASE_URL` + `SUPABASE_ANON_KEY` are set in Vercel (they are — the cron uses them).
3. Redeploy (push to `main`, or Vercel "Redeploy").

## Post-flip verification

- Sign in → confirm you can generate a panel and your credit balance ticks down (`x-mv-balance` header).
- Sign out → confirm a paid action returns **401 "Sign in required"** (the gate is live).
- Translation controls reappear in the studio (`TRANSLATION_ENABLED` followed the gate).

## Pre-flip checklist (confirm, not blockers)

- [ ] `db/spend_credits.sql` run in Supabase (the hard blocker above).
- [x] New signups get a starting balance — `src/lib/supabase.js:330` inserts `credits: DEMO_CREDITS` (120).
- [ ] **Known hole, fine for a trusted private tester round, harden before public:** the *initial* credit
      grant is a client-side insert, so a user could seed their own balance. The atomic RPC stops
      *over-spending*, but not a doctored starting balance. Move the grant to a server-side signup trigger
      (`handle_new_user`) before opening to untrusted users.
- [ ] Providers funded if you want Fal-fidelity: `FAL_KEY` (Fal) + `ANTHROPIC` budget. Not required — the
      Together fallback keeps the app fully functional unfunded.

## Rollback

Set both env vars back to `false` (or remove them) and redeploy. Instant return to demo mode; no data change.
