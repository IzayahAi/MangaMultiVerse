// Mr. K — weekly CoS synthesis. Reads the recent daily logs + open inbox, asks Claude to surface the
// patterns and the critical path, and writes the result back as a 'synthesis' daily-log entry.
//
// Two triggers:
//   • Vercel Cron  → GET (weekly, see vercel.json). Reads with SUPABASE_SERVICE_ROLE_KEY (bypasses RLS,
//     since cron has no user session). No service key set → cron reads nothing and no-ops.
//   • Manual       → POST from the dashboard with the admin's Bearer JWT (RLS enforces admin). Works today.

const SB_URL = process.env.SUPABASE_URL;
const SB_ANON = process.env.SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY; // optional — only for unattended cron reads
const ANTHROPIC = process.env.ANTHROPIC_API_KEY;

function bearer(req) {
  const a = req.headers.authorization || req.headers.Authorization || "";
  const m = /^Bearer\s+(.+)$/i.exec(a);
  return m ? m[1] : null;
}

export default async function handler(req, res) {
  const origin = req.headers.origin || "*";
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Vary", "Origin");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET" && req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!SB_URL || !ANTHROPIC) return res.status(500).json({ error: "not configured" });

  // GET = Vercel Cron (verified by the x-vercel-cron header or a CRON_SECRET); POST = admin manual run.
  const cronSecret = process.env.CRON_SECRET;
  const isCron = req.method === "GET" || !!req.headers["x-vercel-cron"] || (cronSecret && req.headers["x-cron-secret"] === cronSecret);
  const token = bearer(req);
  if (!isCron && !token) return res.status(401).json({ error: "Sign in required" });

  // Reads: cron via the service role (bypasses RLS); manual via the admin JWT (RLS enforces admin).
  const readKey = isCron ? (SERVICE || SB_ANON) : token;
  const sbGet = async (path) => {
    try {
      const r = await fetch(`${SB_URL}/rest/v1/${path}`, { headers: { apikey: SB_ANON, Authorization: `Bearer ${readKey}` } });
      return r.ok ? r.json() : [];
    } catch { return []; }
  };

  const since = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
  const [logs, inbox] = await Promise.all([
    sbGet(`cos_daily_logs?select=log_date,title,body,source&log_date=gte.${since}&order=log_date.desc&limit=60`),
    sbGet(`cos_inbox?select=text,status&status=eq.open&order=created_at.desc&limit=60`),
  ]);

  if ((!logs || !logs.length) && (!inbox || !inbox.length)) {
    return res.status(200).json({ ok: true, empty: true, message: isCron && !SERVICE ? "Cron needs SUPABASE_SERVICE_ROLE_KEY to read the CoS tables." : "Nothing to synthesize yet." });
  }

  const digest = (
    `DAILY LOGS (last 30 days):\n` +
    (logs || []).map(l => `- [${l.log_date}] ${l.title || ""}: ${(l.body || "").slice(0, 400)}`).join("\n") +
    `\n\nOPEN INBOX:\n` +
    (inbox || []).map(i => `- ${i.text}`).join("\n")
  ).slice(0, 12000);

  const prompt = `You are Mr. K, the founder's Chief of Staff for the MangaMultiVerse platform. Read the recent daily logs and open inbox below and write a concise weekly synthesis for the founder. Surface: (1) the 2-4 clearest PATTERNS in what's happening, (2) the current CRITICAL PATH and top priorities, (3) anything being repeatedly deferred or at risk. Calm, specific, direct — no hype, no exclamation points. 180 words max. Plain prose, no markdown headers.\n\n${digest}`;

  let text;
  try {
    const ar = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": ANTHROPIC, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: "claude-haiku-4-5-20251001", max_tokens: 600, messages: [{ role: "user", content: prompt }] }),
    });
    if (!ar.ok) return res.status(502).json({ error: "synthesis model error " + ar.status });
    const data = await ar.json();
    text = (data.content || []).map(c => c.text || "").join("").trim();
  } catch (e) { return res.status(502).json({ error: "synthesis failed: " + e.message }); }
  if (!text) return res.status(502).json({ error: "no synthesis produced" });

  // Write back as a daily-log entry (insert policy is with-check true, so any key works).
  const writeKey = isCron ? (SERVICE || SB_ANON) : token;
  try {
    await fetch(`${SB_URL}/rest/v1/cos_daily_logs`, {
      method: "POST",
      headers: { apikey: SB_ANON, Authorization: `Bearer ${writeKey}`, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ title: "🔎 Weekly synthesis", body: text, source: "synthesis" }),
    });
  } catch {}

  return res.status(200).json({ ok: true, synthesis: text });
}
