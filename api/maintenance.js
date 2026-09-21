import { corsHeaders, getToken } from "./_guard.js";
import { BUDGET } from "./_pricing.js";

// ─────────────────────────────────────────────────────────────────────────────
// The secured maintenance runner (Phase 0 of the maintenance-agent roadmap).
//
// Maintenance agents need to read ACROSS users and policies (spend per account,
// profiles balances, RLS config) — which the public anon key cannot do. This is
// the one server-side place that holds the elevated secrets (service-role key,
// provider billing keys) so admin PAGES never carry them.
//
// Authorizes an admin JWT (verified against the caller's own profiles.role) OR a
// trusted Vercel cron (CRON_SECRET), then dispatches a named `check`. Ships with
// `selfcheck`; each maintenance agent registers its own check in CHECKS.
// It NEVER returns secret values — only whether a capability is wired.
// ─────────────────────────────────────────────────────────────────────────────

const SB_URL = process.env.SUPABASE_URL;
const SB_ANON = process.env.SUPABASE_ANON_KEY;
const SB_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CRON_SECRET = process.env.CRON_SECRET;

// Verify the caller: a trusted cron (shared secret) or an admin (own JWT → own role).
// Admin verification does NOT require the service key — a user can always read their
// own profile row under RLS — so the runner can gate access even before it's armed.
async function authorize(req) {
  const auth = (req.headers.authorization || req.headers.Authorization || "");
  // Trusted Vercel cron: the x-vercel-cron header is injected by the platform and stripped from external
  // requests, so its presence is trustworthy (same basis as api/synthesis.js). A shared CRON_SECRET also works.
  if (req.headers["x-vercel-cron"]) return { ok: true, actor: "cron" };
  if (CRON_SECRET && (auth === `Bearer ${CRON_SECRET}` || req.headers["x-cron-secret"] === CRON_SECRET)) return { ok: true, actor: "cron" };

  const token = getToken(req);
  if (!token) return { ok: false, status: 401, error: "Sign in required" };
  if (!SB_URL || !SB_ANON) return { ok: false, status: 500, error: "Auth not configured" };
  try {
    const u = await fetch(`${SB_URL}/auth/v1/user`, { headers: { apikey: SB_ANON, Authorization: `Bearer ${token}` } });
    if (!u.ok) return { ok: false, status: 401, error: "Invalid session" };
    const user = await u.json();
    const p = await fetch(`${SB_URL}/rest/v1/profiles?id=eq.${user.id}&select=role`, { headers: { apikey: SB_ANON, Authorization: `Bearer ${token}` } });
    const rows = await p.json().catch(() => []);
    if (rows?.[0]?.role !== "admin") return { ok: false, status: 403, error: "Admin only" };
    return { ok: true, actor: "admin", userId: user.id };
  } catch (e) {
    return { ok: false, status: 500, error: "Auth check failed: " + e.message };
  }
}

// Service-role fetch — reads/writes past RLS. Returns null when the key isn't configured,
// so every check must handle the "not armed yet" case gracefully.
const svc = (path, init = {}) =>
  SB_SERVICE && SB_URL
    ? fetch(`${SB_URL}${path}`, { ...init, headers: { apikey: SB_SERVICE, Authorization: `Bearer ${SB_SERVICE}`, ...(init.headers || {}) } })
    : null;

// Best-effort alert to Mr. K's cloud inbox (anon insert is allowed by cos_inbox RLS). Used when the
// cron finds the spend over budget, so an over-burn surfaces to the founder without needing a session.
async function alertInbox(text) {
  if (!SB_URL || !SB_ANON) return false;
  try {
    const r = await fetch(`${SB_URL}/rest/v1/cos_inbox`, {
      method: "POST",
      headers: { apikey: SB_ANON, Authorization: `Bearer ${SB_ANON}`, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ text, source: "spend-sentinel" }),
    });
    return r.ok;
  } catch { return false; }
}

// The check registry. Phase 0 ships `selfcheck`; maintenance agents add their own here.
const CHECKS = {
  // Reports which capabilities are wired and whether the service key can read past RLS.
  // Returns booleans only — never a secret value.
  async selfcheck() {
    const caps = {
      service_role_key: !!SB_SERVICE,
      cron_secret: !!CRON_SECRET,
      supabase_url: !!SB_URL,
      providers: {
        anthropic: !!process.env.ANTHROPIC_API_KEY,
        fal: !!process.env.FAL_KEY,
        together: !!process.env.TOGETHER_API_KEY,
        elevenlabs: !!process.env.ELEVENLABS_KEY,
      },
    };
    // Prove the service key actually reads past RLS (or report why not).
    let serviceRead = "no_key";
    const r = svc(`/rest/v1/profiles?select=id&limit=1`);
    if (r) { try { serviceRead = (await r).ok ? "ok" : "denied"; } catch { serviceRead = "error"; } }
    const armed = caps.service_role_key && serviceRead === "ok";
    return { runner: "ok", armed, caps, serviceRead };
  },

  // 💸 Spend Sentinel — total AI spend per provider/action over 1h / 24h / 7d from the cost_ledger,
  // watch the Fal 429 rate, and grade it against BUDGET. When the CRON runs it and spend is over budget,
  // it drops an alert into Mr. K's inbox. Reads past RLS with the service role.
  async spend_summary(_params, ctx = {}) {
    const r = svc(`/rest/v1/cost_ledger?select=provider,action,credits,usd,event,created_at&created_at=gte.${new Date(Date.now() - 7 * 864e5).toISOString()}&order=created_at.desc&limit=20000`);
    if (!r) return { armed: false, note: "Add SUPABASE_SERVICE_ROLE_KEY to Vercel to arm the Spend Sentinel." };
    const resp = await r;
    if (!resp.ok) {
      // 404 / missing relation → the ledger table isn't set up yet.
      return { armed: true, table: false, note: "Run db/cost_ledger.sql in Supabase — no ledger to read yet.", httpStatus: resp.status };
    }
    const rows = await resp.json().catch(() => []);
    const now = Date.now();
    const W = { "1h": 36e5, "24h": 864e5, "7d": 7 * 864e5 };

    const blank = () => ({ usd: 0, credits: 0, byProvider: {}, byAction: {} });
    const windows = { "1h": blank(), "24h": blank(), "7d": blank() };
    const fal429 = { "1h": 0, "24h": 0, "7d": 0 };
    const falAttempts = { "1h": 0, "24h": 0, "7d": 0 }; // fal spend rows, for the throttle rate

    for (const row of rows) {
      const age = now - new Date(row.created_at).getTime();
      for (const [w, span] of Object.entries(W)) {
        if (age > span) continue;
        if (row.event) {
          if (row.action === "fal_429") fal429[w]++;
          continue;
        }
        const usd = Number(row.usd) || 0, cr = Number(row.credits) || 0;
        const acc = windows[w];
        acc.usd += usd; acc.credits += cr;
        acc.byProvider[row.provider] = (acc.byProvider[row.provider] || 0) + usd;
        acc.byAction[row.action] = (acc.byAction[row.action] || 0) + usd;
        if (row.provider === "fal") falAttempts[w]++;
      }
    }

    // Round for display.
    const r4 = (n) => Math.round(n * 1e4) / 1e4;
    for (const w of Object.keys(windows)) {
      windows[w].usd = r4(windows[w].usd);
      for (const k of Object.keys(windows[w].byProvider)) windows[w].byProvider[k] = r4(windows[w].byProvider[k]);
      for (const k of Object.keys(windows[w].byAction)) windows[w].byAction[k] = r4(windows[w].byAction[k]);
    }
    const rate = (n, d) => (d + n > 0 ? Math.round((n / (d + n)) * 100) / 100 : 0);
    const falRate24h = rate(fal429["24h"], falAttempts["24h"]);

    // Grade against budget: worst of the hourly and daily ratios.
    const ratio = Math.max(windows["1h"].usd / BUDGET.hourlyUsd, windows["24h"].usd / BUDGET.dailyUsd);
    const status = ratio >= 1 ? "alert" : ratio >= BUDGET.warnAt ? "warn" : "ok";

    // Unattended cron: surface an over-budget burn to the founder's inbox.
    let alerted = false;
    if (ctx.actor === "cron" && status !== "ok") {
      alerted = await alertInbox(
        `💸 Spend Sentinel: spend is ${status.toUpperCase()} — $${windows["24h"].usd} in 24h (budget $${BUDGET.dailyUsd}), $${windows["1h"].usd} in the last hour (budget $${BUDGET.hourlyUsd}). Fal 429 rate ${Math.round(falRate24h * 100)}% over 24h.`
      );
    }

    return {
      armed: true, table: true, status,
      budget: { hourlyUsd: BUDGET.hourlyUsd, dailyUsd: BUDGET.dailyUsd, warnAt: BUDGET.warnAt },
      ratio: Math.round(ratio * 100) / 100,
      windows,
      fal429: { ...fal429, rate24h: falRate24h },
      rowsConsidered: rows.length,
      alerted,
    };
  },
};

export default async function handler(req, res) {
  const cors = corsHeaders(req);
  for (const [k, v] of Object.entries(cors)) res.setHeader(k, v);
  if (req.method === "OPTIONS") return res.status(200).end();
  // POST = admin/manual (or cron with a shared secret); GET = Vercel cron (check from ?check=).
  if (req.method !== "POST" && req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const a = await authorize(req);
  if (!a.ok) return res.status(a.status).json({ error: a.error });

  const params = req.method === "POST" ? (req.body || {}) : {};
  const check = params.check || (req.query && req.query.check) || "selfcheck";
  const fn = CHECKS[check];
  if (!fn) return res.status(400).json({ error: `unknown check: ${check}`, available: Object.keys(CHECKS) });

  try {
    const started = Date.now();
    const result = await fn(params, { actor: a.actor, userId: a.userId });
    return res.status(200).json({ ok: true, check, actor: a.actor, ms: Date.now() - started, result });
  } catch (e) {
    return res.status(500).json({ ok: false, check, error: e.message });
  }
}

export const config = { api: { bodyParser: true } };
