// Shared auth + credit guard for every provider proxy. Works from both edge (Request) and node (req)
// functions. The security win — provider keys living only on the server — is ALWAYS on; the auth +
// credit ENFORCEMENT is what the RELEASE_MODE gate toggles, so the demo keeps working until launch.

import { RELEASE_MODE, costFor, usdFor, DEMO_LIMITS } from "./_pricing.js";

const SB_URL = process.env.SUPABASE_URL;
const SB_ANON = process.env.SUPABASE_ANON_KEY;

// Best-guess client IP behind Vercel/proxies.
function clientIp(req) {
  const h = req?.headers;
  const get = k => (h?.get ? h.get(k) : h?.[k]);
  const xff = get("x-forwarded-for");
  return (xff ? String(xff).split(",")[0].trim() : (get("x-real-ip") || "local")) || "local";
}

// ── 💸 Spend Sentinel: best-effort spend ledger. Every charged provider call writes one row to
// cost_ledger (see db/cost_ledger.sql) so the Sentinel can trend spend + watch the Fal 429 rate.
// Fire-and-forget with the anon key (same pattern as error_log); never throws, never blocks the paid
// work if the table isn't set up yet. Works from both edge (fetch) and node runtimes.
export async function logSpend({ provider, action, credits = 0, usd = 0, event = false, ip = null, meta = {} }) {
  if (!SB_URL || !SB_ANON || !provider || !action) return;
  try {
    await fetch(`${SB_URL}/rest/v1/cost_ledger`, {
      method: "POST",
      headers: { apikey: SB_ANON, Authorization: `Bearer ${SB_ANON}`, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ provider, action, credits, usd, event, ip, meta }),
    });
  } catch { /* best-effort — a missing table or transient error never breaks generation */ }
}

// Demo-mode per-IP daily rate limit (only used when RELEASE_MODE is off). Best-effort: if the
// demo_usage RPC/table isn't set up yet, or anything errors, it ALLOWS (never breaks the demo).
// Retries/polls ('free') and admin Brain ('brain') calls aren't counted.
async function demoLimit(req, action) {
  if (action === "free" || action === "brain") return { ok: true, balance: null };
  if (!SB_URL || !SB_ANON) return { ok: true, balance: null };
  const kind = (action === "panel" || action === "lora") ? "img" : "txt";
  const limit = kind === "img" ? DEMO_LIMITS.imagesPerDay : DEMO_LIMITS.textPerDay;
  const day = new Date().toISOString().slice(0, 10);
  const key = `${clientIp(req)}:${kind}:${day}`;
  try {
    const r = await fetch(`${SB_URL}/rest/v1/rpc/bump_demo_usage`, {
      method: "POST",
      headers: { apikey: SB_ANON, Authorization: `Bearer ${SB_ANON}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p_key: key, p_limit: limit }),
    });
    if (!r.ok) return { ok: true, balance: null }; // RPC/table missing → allow (best-effort)
    const allowed = await r.json();
    if (allowed === false) return { ok: false, status: 429, code: "demo_limit", error: "Demo limit reached for today — thanks for trying it! Full access is coming when we launch." };
    return { ok: true, balance: null };
  } catch { return { ok: true, balance: null }; }
}

// Pull the bearer token from an edge Request (headers.get) or a node req (headers object).
export function getToken(req) {
  const h = req?.headers;
  const raw = h?.get ? h.get("authorization") : h?.authorization || h?.Authorization;
  if (!raw) return null;
  const m = /^Bearer\s+(.+)$/i.exec(raw);
  return m ? m[1] : null;
}

// CORS headers echoing the caller's own origin (same-origin app) instead of a blanket "*".
export function corsHeaders(req) {
  const origin = req?.headers?.get ? req.headers.get("origin") : req?.headers?.origin;
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Vary": "Origin",
  };
}

// Record a charged action to the spend ledger (best-effort). Skips `free` (retries/polls) and cost-0
// actions. `creditsCharged` is what actually came off the account (0 when not charged).
async function recordSpend(req, action, provider, creditsCharged = 0) {
  if (!provider || action === "free") return;
  const usd = usdFor(action);
  if (!usd) return; // nothing to trend (e.g. cost-0 actions)
  await logSpend({ provider, action, usd, credits: creditsCharged, ip: clientIp(req) });
}

// Atomically spend `amount` credits from the caller's account via the spend_credits RPC. Returns:
//   { ok:true, balance }     — charged, new balance
//   { unarmed:true }         — the RPC isn't created yet (db/spend_credits.sql not run) → caller decides
//   { ok:false, status }     — 401 (bad session) or 402 (insufficient)
async function chargeCredits(token, amount) {
  const r = await fetch(`${SB_URL}/rest/v1/rpc/spend_credits`, {
    method: "POST",
    headers: { apikey: SB_ANON, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ p_amount: amount }),
  });
  if (r.status === 404) return { unarmed: true };                 // RPC not set up yet
  if (r.status === 401) return { ok: false, status: 401, error: "Invalid session" };
  if (!r.ok) return { ok: false, status: 500, error: `Credit check failed (${r.status})` };
  const bal = await r.json(); // scalar int, or null when insufficient
  if (bal === null || bal === undefined) return { ok: false, status: 402, error: "Out of credits" };
  return { ok: true, balance: bal };
}

// Verify the caller and atomically charge `action`'s cost, then log the spend. Returns:
//   { ok:true, balance }            — proceed (balance may be null when nothing was charged)
//   { ok:false, status, error }     — 401 (no/invalid token), 402 (insufficient), 429 (demo cap)
// Credits are the ONE-TIME per-account allotment (the demo grant); they deplete and don't reset until a
// paid renewal. This is enforced in demo too (signed-in), so the demo is one-time per account — not a
// daily-resetting free-for-all. `provider` is used for the spend ledger.
export async function guard(req, action, provider) {
  const token = getToken(req);
  const amount = costFor(action);

  if (!RELEASE_MODE) {
    // Per-IP daily cap first (anti-abuse across accounts), then deplete the signed-in account's allotment.
    const d = await demoLimit(req, action);
    if (!d.ok) return d;
    if (token && amount > 0 && SB_URL && SB_ANON) {
      try {
        const c = await chargeCredits(token, amount);
        if (c.unarmed) { await recordSpend(req, action, provider, 0); return { ok: true, balance: null }; } // RPC not armed yet → per-IP only
        if (c.status === 401) { await recordSpend(req, action, provider, 0); return { ok: true, balance: null }; } // expired/invalid JWT in demo → fall back to per-IP cap, don't block
        if (!c.ok) return c; // 402 when the one-time demo allotment is used up
        await recordSpend(req, action, provider, amount);
        return { ok: true, balance: c.balance };
      } catch (e) { return { ok: true, balance: null }; } // never break the demo on a transient error
    }
    await recordSpend(req, action, provider, 0);
    return d;
  }

  // Launch: require auth + charge.
  if (!token) return { ok: false, status: 401, error: "Sign in required" };
  if (!SB_URL || !SB_ANON) return { ok: false, status: 500, error: "Auth not configured" };
  try {
    const c = await chargeCredits(token, amount);
    if (c.unarmed) return { ok: false, status: 500, error: "Credits not configured (run db/spend_credits.sql)" };
    if (!c.ok) return c;
    await recordSpend(req, action, provider, amount);
    return { ok: true, balance: c.balance };
  } catch (e) {
    return { ok: false, status: 500, error: "Credit check error: " + e.message };
  }
}
