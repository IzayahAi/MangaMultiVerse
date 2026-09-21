import { corsHeaders, getToken } from "./_guard.js";

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
  if (CRON_SECRET && auth === `Bearer ${CRON_SECRET}`) return { ok: true, actor: "cron" };

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
};

export default async function handler(req, res) {
  const cors = corsHeaders(req);
  for (const [k, v] of Object.entries(cors)) res.setHeader(k, v);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const a = await authorize(req);
  if (!a.ok) return res.status(a.status).json({ error: a.error });

  const check = (req.body && req.body.check) || "selfcheck";
  const fn = CHECKS[check];
  if (!fn) return res.status(400).json({ error: `unknown check: ${check}`, available: Object.keys(CHECKS) });

  try {
    const started = Date.now();
    const result = await fn(req.body || {});
    return res.status(200).json({ ok: true, check, actor: a.actor, ms: Date.now() - started, result });
  } catch (e) {
    return res.status(500).json({ ok: false, check, error: e.message });
  }
}

export const config = { api: { bodyParser: true } };
