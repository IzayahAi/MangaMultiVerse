import { corsHeaders } from "./_guard.js";

// 🌐 Cache-first translation. This is what makes "every manga, every language, every reader — free" affordable:
// each (story, language, chapter) is translated ONCE (cheap Haiku), persisted to the shared translations store,
// and served free to every reader forever after. A cache HIT costs nothing. Only a cache MISS calls the model,
// and it's bounded by the same per-IP daily cap the demo uses, so it can't be mass-abused.
//
// No credit charge and no sign-in required — reading a manga in any language is open to everyone (the point is
// reach/views). The ANTHROPIC + service-role keys live only here on the server.

const SB_URL = process.env.SUPABASE_URL;
const SB_ANON = process.env.SUPABASE_ANON_KEY;
const SB_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANTHROPIC = process.env.ANTHROPIC_API_KEY;

function clientIp(req) {
  const xff = req.headers["x-forwarded-for"];
  return (xff ? String(xff).split(",")[0].trim() : (req.headers["x-real-ip"] || "local")) || "local";
}

// Cache key mirrors saveTranslation/fetchTranslation: Ch.1 = `${storyId}_${lang}`, Ch.n = `${storyId}_${n}_${lang}`.
const cacheId = (storyId, lang, chapter) => (chapter > 1 ? `${storyId}_${chapter}_${lang}` : `${storyId}_${lang}`);

async function getCached(id) {
  if (!SB_URL || !SB_ANON) return null;
  try {
    const r = await fetch(`${SB_URL}/rest/v1/translations?id=eq.${encodeURIComponent(id)}&select=data`, { headers: { apikey: SB_ANON, Authorization: `Bearer ${SB_ANON}` } });
    if (!r.ok) return null;
    const rows = await r.json();
    return rows?.[0]?.data || null;
  } catch { return null; }
}

// Persist with the service role (bypasses the owner-write RLS so ANY reader's translation caches globally).
// Falls back to the anon key (works only if the caller owns the story) — a missing service key just means the
// translation isn't cached and the next reader re-translates.
async function persist(id, storyId, lang, data) {
  const key = SB_SERVICE || SB_ANON;
  if (!SB_URL || !key) return;
  try {
    await fetch(`${SB_URL}/rest/v1/translations?on_conflict=id`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({ id, story_id: storyId, language: lang, data, updated_at: new Date().toISOString() }),
    });
  } catch { /* best-effort */ }
}

// Per-IP daily cap on cache MISSES only (reuses the demo_usage RPC). Allows on error / when unarmed.
async function perIpOk(req) {
  if (!SB_URL || !SB_ANON) return true;
  const day = new Date().toISOString().slice(0, 10);
  const key = `${clientIp(req)}:txt:${day}`;
  try {
    const r = await fetch(`${SB_URL}/rest/v1/rpc/bump_demo_usage`, { method: "POST", headers: { apikey: SB_ANON, Authorization: `Bearer ${SB_ANON}`, "Content-Type": "application/json" }, body: JSON.stringify({ p_key: key, p_limit: 100 }) });
    if (!r.ok) return true;
    return (await r.json()) !== false;
  } catch { return true; }
}

// Translate the panels with Haiku, in the exact shape MangaReader.applyTranslation consumes.
async function haikuTranslate(panels, lang, story) {
  if (!ANTHROPIC) return null;
  const sys = `You are a manga translator. Translate the script to ${lang}. Respond ONLY with valid JSON in EXACTLY this shape: {"language":"${lang}","chapter_title":"<title in ${lang}>","panels":[{"number":1,"dialogue":[{"character":"name","type":"speech|thought|narration|sfx","original":"<source text>","translated":"<${lang} text>","voice_note":""}]}]}. Rules: translate EVERY dialogue line into ${lang}; return the SAME number of dialogue entries per panel in the SAME order; keep each panel's original "number"; SFX text may stay as-is.`;
  const user = JSON.stringify({ title: story?.title, logline: story?.logline, panels: (panels || []).slice(0, 60) }).slice(0, 9000);
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "x-api-key": ANTHROPIC, "anthropic-version": "2023-06-01", "content-type": "application/json" }, body: JSON.stringify({ model: "claude-haiku-4-5-20251001", max_tokens: 4000, system: sys, messages: [{ role: "user", content: user }] }) });
    if (!r.ok) return null;
    const d = await r.json();
    const text = Array.isArray(d.content) ? d.content.map((b) => b.text || "").join("") : "";
    try { return JSON.parse((text.match(/\{[\s\S]*\}/) || [text])[0]); } catch { return null; }
  } catch { return null; }
}

export default async function handler(req, res) {
  const cors = corsHeaders(req);
  for (const [k, v] of Object.entries(cors)) res.setHeader(k, v);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { storyId, language, chapterNum = 1, panels, story } = req.body || {};
  if (!storyId || !language) return res.status(400).json({ error: "storyId + language required" });

  const id = cacheId(storyId, language, chapterNum);

  // 1) Cache hit → free, instant, identical for every reader.
  const cached = await getCached(id);
  if (cached) return res.status(200).json({ cached: true, data: cached });

  // 2) Miss → per-IP cap, translate once, persist for everyone.
  if (!(await perIpOk(req))) return res.status(429).json({ error: "Translation limit reached for today — try again tomorrow.", code: "demo_limit" });
  const data = await haikuTranslate(panels, language, story);
  if (!data || !Array.isArray(data.panels)) return res.status(200).json({ cached: false, data: null, note: "translate_failed" });
  await persist(id, storyId, language, data);
  return res.status(200).json({ cached: false, data });
}

export const config = { api: { bodyParser: true } };
