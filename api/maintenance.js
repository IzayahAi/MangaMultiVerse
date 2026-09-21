import { corsHeaders, getToken } from "./_guard.js";
import { BUDGET, DEMO_CREDITS, LIMITS } from "./_pricing.js";

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

// Best-effort write to the health-event log (anon insert allowed by health_events RLS). No-ops if the
// table isn't set up yet — the check still returns live results.
async function logHealth(kind, status, down, results) {
  if (!SB_URL || !SB_ANON) return;
  try {
    await fetch(`${SB_URL}/rest/v1/health_events`, {
      method: "POST",
      headers: { apikey: SB_ANON, Authorization: `Bearer ${SB_ANON}`, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ kind, status, down, results }),
    });
  } catch { /* best-effort */ }
}

// Best-effort write to the security-flags log (anon insert allowed by security_flags RLS). No-ops if the
// table isn't set up yet — the check still returns live findings.
async function logFlags(status, findings) {
  if (!SB_URL || !SB_ANON) return;
  try {
    await fetch(`${SB_URL}/rest/v1/security_flags`, {
      method: "POST",
      headers: { apikey: SB_ANON, Authorization: `Bearer ${SB_ANON}`, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ status, findings }),
    });
  } catch { /* best-effort */ }
}

// Service-role JSON read (bypasses RLS). null = not armed (no service key); [] = error/empty.
async function svcJson(path) {
  const r = svc(path);
  if (!r) return null;
  try { const resp = await r; return resp.ok ? await resp.json() : []; } catch { return []; }
}

// The prod base URL to probe: an explicit PROD_URL, else this deployment (VERCEL_URL), else the known
// production domain. Post-deploy the cron runs ON the new deployment, so VERCEL_URL verifies THAT build.
function prodBase() {
  const b = process.env.PROD_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://mangaverse-deploy.vercel.app");
  return b.replace(/\/$/, "");
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

  // 🚀 Deploy Sentinel — verify the live deploy is healthy: the app boots, every api/* proxy responds
  // (OPTIONS → 200, so no provider call and no spend), and Supabase answers. Records to health_events;
  // on the cron, alerts Mr. K's inbox if anything's down. `app` or `supabase` down = alert; a proxy
  // down = warn.
  async deploy_check(_params, ctx = {}) {
    const base = prodBase();
    const targets = [
      { name: "app",             method: "GET",     url: `${base}/`,                 ok: (s) => s >= 200 && s < 400 },
      { name: "api/claude",      method: "OPTIONS", url: `${base}/api/claude`,        ok: (s) => s === 200 },
      { name: "api/fal",         method: "OPTIONS", url: `${base}/api/fal`,           ok: (s) => s === 200 },
      { name: "api/image",       method: "OPTIONS", url: `${base}/api/image`,         ok: (s) => s === 200 },
      { name: "api/eleven",      method: "OPTIONS", url: `${base}/api/eleven`,        ok: (s) => s === 200 },
      { name: "api/maintenance", method: "OPTIONS", url: `${base}/api/maintenance`,   ok: (s) => s === 200 },
      { name: "supabase",        method: "GET",     url: `${SB_URL}/rest/v1/`, headers: { apikey: SB_ANON }, ok: (s) => s >= 200 && s < 500 },
    ];

    const results = await Promise.all(targets.map(async (t) => {
      const started = Date.now();
      try {
        const r = await fetch(t.url, { method: t.method, headers: t.headers || {} });
        return { name: t.name, ok: t.ok(r.status), status: r.status, ms: Date.now() - started };
      } catch (e) {
        return { name: t.name, ok: false, status: 0, ms: Date.now() - started, error: (e.message || "fetch failed").slice(0, 120) };
      }
    }));

    const down = results.filter((r) => !r.ok);
    const critical = down.some((d) => d.name === "app" || d.name === "supabase");
    const status = down.length === 0 ? "ok" : critical ? "alert" : "warn";

    await logHealth("deploy", status, down.length, results);

    let alerted = false;
    if (ctx.actor === "cron" && status !== "ok") {
      alerted = await alertInbox(`🚀 Deploy Sentinel: ${down.length} target(s) failing — ${down.map((d) => `${d.name} (${d.status || "err"})`).join(", ")}. Base: ${base}`);
    }

    return { base, status, down: down.length, results, alerted };
  },

  // 🔓 Credit-Tamper & Abuse Watch — reads profiles past RLS (service role) and flags the fallout of the
  // client-set-grant hole (signUp inserts profiles.credits + role from the browser, so both are
  // tamperable until a server-side signup trigger lands):
  //   • over-grant  — a non-admin with credits above the demo grant (legit balances only ever decrease)
  //   • rogue admin — any admin account (should only be the founder; surfaced for an eyeball)
  //   • negative    — credits < 0 (should be impossible via spend_credits)
  //   • velocity    — a burst of signups in 24h (scripted multi-account / demo-cap evasion)
  // Records a summary to security_flags; alerts Mr. K's inbox on the cron. Does NOT fix anything — the
  // remediation (a server-side signup trigger) is its own hardening ticket.
  async tamper_watch(_params, ctx = {}) {
    const r = svc(`/rest/v1/profiles?select=id,username,email,role,credits,created_at&limit=10000`);
    if (!r) return { armed: false, note: "Add SUPABASE_SERVICE_ROLE_KEY to Vercel to arm the tamper watch." };
    const resp = await r;
    if (!resp.ok) return { armed: true, ok: false, note: `Couldn't read profiles (HTTP ${resp.status}).` };
    const rows = await resp.json().catch(() => []);

    const grant = DEMO_CREDITS;
    const brief = (p) => ({ id: p.id, username: p.username || null, email: p.email || null, credits: p.credits, role: p.role });
    const overCredits = rows.filter((p) => p.role !== "admin" && Number(p.credits) > grant).map(brief);
    const negative    = rows.filter((p) => Number(p.credits) < 0).map(brief);
    const admins      = rows.filter((p) => p.role === "admin").map(brief);

    const dayAgo = Date.now() - 864e5;
    const hasCreatedAt = rows.some((p) => p.created_at);
    const recentSignups24h = hasCreatedAt ? rows.filter((p) => p.created_at && new Date(p.created_at).getTime() >= dayAgo).length : null;
    const VELOCITY_WARN = 20; // signups/24h above this looks scripted for a private demo

    const findings = {
      totalProfiles: rows.length,
      grant,
      overCredits,
      negative,
      admins,
      adminCount: admins.length,
      recentSignups24h,
    };

    // alert = concrete tamper (over-grant or negative credits). warn = eyeball needed (extra admins or a
    // signup burst). ok = nothing anomalous.
    const status =
      overCredits.length || negative.length ? "alert"
      : (admins.length > 1 || (recentSignups24h != null && recentSignups24h > VELOCITY_WARN)) ? "warn"
      : "ok";

    await logFlags(status, findings);

    let alerted = false;
    if (ctx.actor === "cron" && status !== "ok") {
      const bits = [];
      if (overCredits.length) bits.push(`${overCredits.length} account(s) over the ${grant}-credit grant`);
      if (negative.length) bits.push(`${negative.length} with negative credits`);
      if (admins.length > 1) bits.push(`${admins.length} admin accounts`);
      if (recentSignups24h != null && recentSignups24h > VELOCITY_WARN) bits.push(`${recentSignups24h} signups in 24h`);
      alerted = await alertInbox(`🔓 Credit-Tamper Watch (${status.toUpperCase()}): ${bits.join("; ")}. Review the Maintenance page.`);
    }

    return {
      armed: true, status, findings,
      remediation: overCredits.length || negative.length
        ? "Harden signUp: move the credit grant + role to a server-side Supabase signup trigger so the browser can't set them (see LAUNCH.md)."
        : null,
    };
  },

  // 🗺️ Sitemap & Discovery — verify /sitemap.xml, /robots.txt, /llms.txt are served on prod and report
  // how many published stories the sitemap lists. No provider cost.
  async discovery_check(_params, _ctx = {}) {
    const base = prodBase();
    const files = ["/sitemap.xml", "/robots.txt", "/llms.txt"];
    const results = await Promise.all(files.map(async (path) => {
      const started = Date.now();
      try {
        const r = await fetch(`${base}${path}`);
        const text = await r.text();
        const urls = path === "/sitemap.xml" ? (text.match(/<url>/g) || []).length : null;
        return { path, ok: r.ok, status: r.status, ms: Date.now() - started, ...(urls != null ? { urls } : {}) };
      } catch (e) {
        return { path, ok: false, status: 0, ms: Date.now() - started, error: (e.message || "fetch failed").slice(0, 120) };
      }
    }));
    const down = results.filter((r) => !r.ok);
    const status = down.length === 0 ? "ok" : "warn";
    const storyUrls = results.find((r) => r.path === "/sitemap.xml")?.urls ?? null;
    await logHealth("discovery", status, down.length, results);
    return { base, status, down: down.length, storyUrls, results };
  },

  // 🔍 SEO & Metadata audit — reads published stories and flags ones whose share card would be thin
  // (missing title or a usable description). The /s/<id> prerender (api/share.js) generates the OG tags
  // live from these fields, so "coverage" = stories that will unfurl with real title + description.
  async seo_audit(_params, _ctx = {}) {
    if (!SB_URL || !SB_ANON) return { armed: false, note: "Supabase not configured." };
    let rows = [];
    try {
      const r = await fetch(`${SB_URL}/rest/v1/stories?status=eq.published&select=id,title,tagline,logline&limit=5000`, { headers: { apikey: SB_ANON, Authorization: `Bearer ${SB_ANON}` } });
      rows = r.ok ? await r.json() : [];
    } catch (e) { return { armed: true, ok: false, note: "Couldn't read stories: " + e.message }; }

    const thin = rows
      .filter((s) => !s.title || !(s.tagline || s.logline))
      .map((s) => ({ id: s.id, title: s.title || null, hasDesc: !!(s.tagline || s.logline) }));
    const total = rows.length;
    const withMeta = total - thin.length;
    const coverage = total ? Math.round((withMeta / total) * 100) : 100;
    const status = total === 0 ? "ok" : thin.length === 0 ? "ok" : coverage >= 80 ? "warn" : "alert";
    await logHealth("seo", status, thin.length, thin.slice(0, 50));
    return { armed: true, status, total, withMeta, coverage, thin: thin.slice(0, 50) };
  },

  // ── WAVE 2 (P1) — internal health ────────────────────────────────────────────────────────────────

  // 📡 Uptime Monitor — is prod live (app + Supabase) and is the weekly synthesis actually running?
  // (Deploy Sentinel covers the per-proxy detail; this adds synthesis freshness.) Alerts on the cron.
  async uptime_check(_params, ctx = {}) {
    const base = prodBase();
    const probe = async (name, url, headers) => {
      const started = Date.now();
      try { const r = await fetch(url, { headers: headers || {} }); return { name, ok: r.status >= 200 && r.status < 500, status: r.status, ms: Date.now() - started }; }
      catch (e) { return { name, ok: false, status: 0, ms: Date.now() - started, error: (e.message || "fail").slice(0, 100) }; }
    };
    const [app, sb] = await Promise.all([
      probe("app", `${base}/`),
      probe("supabase", `${SB_URL}/rest/v1/`, { apikey: SB_ANON }),
    ]);
    // Synthesis freshness (needs the service role to read the admin-gated CoS table).
    let synthesis = { known: false };
    const rows = await svcJson(`/rest/v1/cos_daily_logs?source=eq.synthesis&select=log_date,created_at&order=created_at.desc&limit=1`);
    if (rows && rows.length) {
      const last = new Date(rows[0].created_at || rows[0].log_date).getTime();
      const ageDays = Math.round((Date.now() - last) / 864e5);
      synthesis = { known: true, ageDays, stale: ageDays > 8 };
    } else if (rows) {
      synthesis = { known: true, ageDays: null, stale: true, note: "no synthesis entry yet" };
    }
    const live = app.ok && sb.ok;
    const status = !live ? "alert" : synthesis.stale ? "warn" : "ok";
    await logHealth("uptime", status, live ? 0 : 1, [app, sb, { name: "synthesis", ...synthesis }]);
    let alerted = false;
    if (ctx.actor === "cron" && status !== "ok") {
      alerted = await alertInbox(`📡 Uptime (${status.toUpperCase()}): ${!live ? "prod/Supabase unreachable" : `weekly synthesis stale (${synthesis.ageDays ?? "never"}d)`}.`);
    }
    return { base, status, live: { app, supabase: sb }, synthesis, alerted };
  },

  // 🩹 Broken-Link & Dead-Asset — published stories with no cover or no rendered panel art (a dead card
  // in the feed / an empty read). Reads past RLS to see every author's catalog.
  async links_check(_params, _ctx = {}) {
    const stories = await svcJson(`/rest/v1/stories?status=eq.published&select=id,title,chapters,script,cover_color,emoji&limit=5000`);
    if (stories === null) return { armed: false, note: "Add SUPABASE_SERVICE_ROLE_KEY to arm." };
    const hasArt = (s) => {
      const sc = s.script || {};
      const imgs = sc.panel_images && typeof sc.panel_images === "object" ? Object.keys(sc.panel_images).length : 0;
      const inPanels = Array.isArray(sc.panels) && sc.panels.some((p) => p && (p.image || p.img || p.url || p.image_url));
      return imgs > 0 || inPanels;
    };
    const noCover = stories.filter((s) => !s.cover_color && !s.emoji).map((s) => ({ id: s.id, title: s.title || null }));
    const noArt = stories.filter((s) => !hasArt(s)).map((s) => ({ id: s.id, title: s.title || null }));
    const total = stories.length;
    const broken = new Set([...noCover, ...noArt].map((x) => x.id)).size;
    const status = broken === 0 ? "ok" : broken / (total || 1) >= 0.25 ? "alert" : "warn";
    await logHealth("links", status, broken, { noCover: noCover.length, noArt: noArt.length });
    return { armed: true, status, total, noCover, noArt };
  },

  // 📚 Catalog Health & Quality — score each published story on title/tagline/logline/chapters/tags/cover.
  async catalog_check(_params, _ctx = {}) {
    const stories = await svcJson(`/rest/v1/stories?status=eq.published&select=id,title,tagline,logline,chapters,genre_tags,cover_color,emoji&limit=5000`);
    if (stories === null) return { armed: false, note: "Add SUPABASE_SERVICE_ROLE_KEY to arm." };
    const generic = /^(untitled|new story|test|draft|story)\b/i;
    const score = (s) => {
      let n = 0;
      if (s.title && !generic.test(s.title.trim())) n += 25;
      if (s.tagline && s.tagline.trim().length >= 20) n += 25;
      if (s.logline && s.logline.trim().length >= 20) n += 15;
      if ((s.chapters || 0) >= 1) n += 15;
      if (Array.isArray(s.genre_tags) && s.genre_tags.length) n += 10;
      if (s.cover_color || s.emoji) n += 10;
      return n;
    };
    const scored = stories.map((s) => ({ id: s.id, title: s.title || null, score: score(s) })).sort((a, b) => a.score - b.score);
    const total = scored.length;
    const avg = total ? Math.round(scored.reduce((a, s) => a + s.score, 0) / total) : 100;
    const status = total === 0 ? "ok" : avg >= 70 ? "ok" : avg >= 50 ? "warn" : "alert";
    await logHealth("catalog", status, scored.filter((s) => s.score < 50).length, { avg });
    return { armed: true, status, total, avgScore: avg, lowest: scored.slice(0, 8) };
  },

  // 🧬 Data-Integrity — orphaned translations/bibles (story_id gone) + stories over the language cap.
  async integrity_check(_params, _ctx = {}) {
    const [stories, translations, bibles] = await Promise.all([
      svcJson(`/rest/v1/stories?select=id&limit=20000`),
      svcJson(`/rest/v1/translations?select=story_id,language&limit=20000`),
      svcJson(`/rest/v1/story_bible?select=story_id&limit=20000`),
    ]);
    if (stories === null) return { armed: false, note: "Add SUPABASE_SERVICE_ROLE_KEY to arm." };
    const ids = new Set((stories || []).map((s) => s.id));
    const orphanTranslations = (translations || []).filter((t) => t.story_id && !ids.has(t.story_id)).length;
    const orphanBibles = (bibles || []).filter((b) => b.story_id && !ids.has(b.story_id)).length;
    const perStoryLangs = {};
    (translations || []).forEach((t) => { if (t.story_id && t.language) (perStoryLangs[t.story_id] = perStoryLangs[t.story_id] || new Set()).add(t.language); });
    const cap = LIMITS.maxLanguagesPerPublish || 12;
    const overCap = Object.entries(perStoryLangs).filter(([, set]) => set.size > cap).map(([id, set]) => ({ id, langs: set.size }));
    const issues = orphanTranslations + orphanBibles + overCap.length;
    const status = orphanTranslations || orphanBibles ? "alert" : overCap.length ? "warn" : "ok";
    await logHealth("integrity", status, issues, { orphanTranslations, orphanBibles, overCap: overCap.length });
    return { armed: true, status, orphanTranslations, orphanBibles, overCap, cap };
  },

  // 🛡️ Security Posture — (1) no provider secret leaked into the JS bundle, (2) admin-only tables are not
  // anon-readable. Reports pattern NAMES + counts only, never a secret value.
  async posture_check(_params, ctx = {}) {
    const base = prodBase();
    // (1) Bundle secret scan.
    const patterns = [
      { name: "anthropic key (sk-ant-)", re: /sk-ant-[A-Za-z0-9_\-]{15,}/g },
      { name: "openai-style key (sk-)", re: /\bsk-[A-Za-z0-9]{24,}/g },
      { name: "google key (AIza)", re: /\bAIza[0-9A-Za-z_\-]{30,}/g },
      { name: "VITE_ provider key", re: /VITE_[A-Z0-9_]*(KEY|TOKEN|SECRET)/g },
      { name: "server key name in bundle", re: /(ANTHROPIC_API_KEY|ELEVENLABS_KEY|TOGETHER_API_KEY|FAL_KEY|SERVICE_ROLE)/g },
    ];
    const leaks = [];
    try {
      const idx = await (await fetch(`${base}/`)).text();
      const assets = Array.from(idx.matchAll(/["']([^"']*\/assets\/[^"']+\.js)["']/g)).map((m) => m[1]).slice(0, 5);
      const urls = assets.length ? assets.map((a) => (a.startsWith("http") ? a : `${base}${a.startsWith("/") ? "" : "/"}${a}`)) : [];
      const texts = await Promise.all(urls.map(async (u) => { try { return await (await fetch(u)).text(); } catch { return ""; } }));
      const blob = idx + texts.join("\n");
      for (const p of patterns) { const hits = (blob.match(p.re) || []).length; if (hits) leaks.push({ pattern: p.name, count: hits }); }
    } catch (e) { leaks.push({ pattern: "bundle fetch failed", count: 0, error: (e.message || "").slice(0, 100) }); }

    // (2) Anon read probe on admin-only tables — any rows returned = an RLS leak.
    const adminTables = ["error_log", "reports", "cost_ledger", "health_events", "security_flags", "cos_daily_logs", "brain_notes"];
    const rlsLeaks = [];
    if (SB_URL && SB_ANON) {
      await Promise.all(adminTables.map(async (t) => {
        try {
          const r = await fetch(`${SB_URL}/rest/v1/${t}?select=*&limit=1`, { headers: { apikey: SB_ANON, Authorization: `Bearer ${SB_ANON}` } });
          if (r.ok) { const rows = await r.json(); if (Array.isArray(rows) && rows.length > 0) rlsLeaks.push(t); }
        } catch { /* ignore */ }
      }));
    }

    const realLeaks = leaks.filter((l) => l.count > 0);
    const status = realLeaks.length || rlsLeaks.length ? "alert" : "ok";
    await logHealth("posture", status, realLeaks.length + rlsLeaks.length, { bundleLeaks: realLeaks, rlsLeaks });
    let alerted = false;
    if (ctx.actor === "cron" && status !== "ok") {
      alerted = await alertInbox(`🛡️ Security Posture (ALERT): ${realLeaks.length ? `possible secret(s) in bundle (${realLeaks.map((l) => l.pattern).join(", ")})` : ""}${rlsLeaks.length ? ` anon can read: ${rlsLeaks.join(", ")}` : ""}.`);
    }
    return { armed: true, status, bundleLeaks: realLeaks, rlsLeaks, scanned: adminTables.length, alerted };
  },

  // Consolidated cron entry — runs every maintenance check that should fire unattended, in one call, so
  // the whole wing needs only ONE daily cron (Hobby plans cap crons at 2 total / once-daily). Each check
  // still alerts Mr. K's inbox on its own when the actor is cron. On-demand checks use their own buttons.
  async cron_tick(params, ctx = {}) {
    const run = (name) => CHECKS[name](params, ctx).catch((e) => ({ error: e.message }));
    // The unattended set: money, prod, security, data, discovery. links_check + catalog_check are
    // on-demand quality audits (button-only) — not urgent and not worth a daily inbox nudge.
    const names = ["spend_summary", "deploy_check", "tamper_watch", "uptime_check", "integrity_check", "posture_check", "discovery_check", "seo_audit"];
    const out = {};
    const results = await Promise.all(names.map(run));
    names.forEach((n, i) => { out[n] = results[i]; });
    return { ran: names, ...out };
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
