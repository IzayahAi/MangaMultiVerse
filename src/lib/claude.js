import { STYLE_GUIDE, RELEASE_MODE } from "../constants.js";

// ── Session token for authenticated calls to our own /api/* proxies ──────────────
// App.jsx calls setApiToken(token) on auth change so provider calls can attach the user's JWT WITHOUT
// threading a token param through every call site. onBalance(newBalance) lets the UI reflect the
// server-charged credit balance returned by a proxy (x-mv-balance header).
let _apiToken = null;
let _onBalance = null;
// Circuit breaker: once Fal rate-limits the account (429), skip Fal for this cooldown window and go
// straight to Together — otherwise every remaining panel re-hammers the throttled account (429 flood).
let _falCooldownUntil = 0;
// Fal is DEMOTED (2026-09-22). The panel image chain is now Together (Juggernaut Lightning Flux) primary →
// DeepInfra FLUX-schnell fallback — ~10x cheaper than Fal at the same fast-Flux quality. Fal stays fully
// wired but OFF by default; set VITE_FAL_ENABLED=true (client build env) to bring it back with no code change.
const FAL_ENABLED = ((typeof import.meta !== "undefined" && import.meta.env?.VITE_FAL_ENABLED) ?? "false") === "true";
export function setApiToken(token, onBalance) { _apiToken = token || null; if (onBalance) _onBalance = onBalance; }
function apiHeaders(action, extra = {}) {
  const h = { "Content-Type": "application/json", ...extra };
  if (_apiToken) h["Authorization"] = `Bearer ${_apiToken}`;
  if (action) h["x-mv-action"] = action;
  return h;
}
function noteBalance(res) {
  try { const b = res.headers.get("x-mv-balance"); if (b != null && _onBalance) _onBalance(Number(b)); } catch {}
}

// fetch with exponential backoff + jitter, honoring Retry-After and special-casing 429/503. Returns the
// Response (caller inspects res.ok) or throws on network failure after the last attempt.
export async function fetchWithBackoff(url, opts = {}, { tries = 3, base = 600 } = {}) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, opts);
      if ((res.status === 429 || res.status === 503) && i < tries - 1) {
        const ra = Number(res.headers.get("retry-after"));
        const wait = Number.isFinite(ra) && ra > 0 ? ra * 1000 : base * 2 ** i + Math.random() * base;
        await new Promise(r => setTimeout(r, wait));
        continue;
      }
      return res;
    } catch (e) {
      lastErr = e;
      if (i < tries - 1) await new Promise(r => setTimeout(r, base * 2 ** i + Math.random() * base));
    }
  }
  throw lastErr || new Error("request failed");
}

// Mr. K weekly synthesis — POST to /api/synthesis with the admin JWT (attached by apiHeaders). Reads the
// recent CoS daily logs + open inbox, writes a synthesis entry back, and returns it.
export async function runSynthesis() {
  try {
    const res = await fetch("/api/synthesis", { method: "POST", headers: apiHeaders("brain") });
    return res.ok ? res.json() : { error: `synthesis ${res.status}` };
  } catch (e) { return { error: e.message }; }
}

export const CLAUDE_SYSTEM = `You are a world-class manga/manhwa story creator with deep expertise in storytelling, character psychology, and visual narrative. You write stories that feel REAL — specific details, unique worlds, characters with contradictions and wounds.

ABSOLUTE RULES:
- Respond with RAW valid JSON only. No markdown. No backticks. No code fences. No explanations.
- Start with { and end with }
- Every field must contain REAL specific creative content — never placeholder text
- Character names must be REAL, specific names that FIT the story's setting and culture — draw from a GLOBAL pool, not just one region. Examples: American ("Maya Coleman", "Jordan Reyes", "Elena Cross"), Indian ("Aarav Mehta", "Priya Nair", "Rohan Kapoor"), Korean ("Seok Jin-ho"), Japanese ("Kaito Mori"), Chinese ("Liang Wei"), Latin ("Mateo Alvarez"), African ("Amara Okafor"), European ("Nikolai Vasiliev"), Arabic ("Layla Hassan"). Never "Protagonist" or "Hero". A cast can be culturally MIXED when the setting is global/modern; keep each character's full name internally consistent with their own background, and match the overall naming to where the story is set (a murim/xianxia world uses Korean/Chinese names; a Mumbai story uses Indian names; a New York story uses diverse American names).
- Dialogue must be 12 words or fewer — real punchy human speech
- Make every story feel completely unique with a specific original hook`;

export function parsePartial(text) {
  const grab = (key) => { const m = text.match(new RegExp(`"${key}"\\s*:\\s*"([^"]{2,})"`)); return m?.[1]; };
  const grabNum = (key) => { const m = text.match(new RegExp(`"${key}"\\s*:\\s*(\\d+)`)); return m ? parseInt(m[1]) : undefined; };
  const grabArr = (key) => { const m = text.match(new RegExp(`"${key}"\\s*:\\s*\\[([^\\]]+)\\]`)); if(!m) return []; return m[1].match(/"([^"]+)"/g)?.map(s=>s.replace(/"/g,''))||[]; };
  return {
    title: grab('title'), tagline: grab('tagline'), logline: grab('logline'),
    genre_tags: grabArr('genre_tags'), themes: grabArr('themes'),
    central_conflict: grab('central_conflict'),
    chapter_one_hook: grab('chapter_one_hook'),
    visual_style_notes: grab('visual_style_notes'),
    protagonist: { name:grab('name'), age:grabNum('age'), appearance:grab('appearance'), personality:grab('personality'), wound:grab('wound'), goal:grab('goal'), need:grab('need') },
    antagonist: { name:undefined, role:grab('role'), motivation:grab('motivation'), mirror:grab('mirror') },
    setting: { world:grab('world'), description:grab('description'), unique_element:grab('unique_element') },
  };
}

// Salvage every COMPLETE top-level object from a (possibly truncated) JSON array.
// A batch panel response that got cut off mid-panel still yields all the finished panels.
export function salvageArray(str) {
  const arrStart = str.indexOf("[");
  if (arrStart === -1) return null;
  const body = str.slice(arrStart + 1);
  const objs = [];
  let depth = 0, inStr = false, esc = false, cur = "";
  for (const ch of body) {
    if (esc) { cur += ch; esc = false; continue; }
    if (ch === "\\") { cur += ch; esc = true; continue; }
    if (ch === '"') { inStr = !inStr; cur += ch; continue; }
    if (!inStr) {
      if (ch === "{") { if (depth === 0) cur = ""; depth++; cur += ch; continue; }
      if (ch === "}") { depth--; cur += ch; if (depth === 0) { try { objs.push(JSON.parse(cur)); } catch {} cur = ""; } continue; }
    }
    if (depth > 0) cur += ch;
  }
  return objs.length ? objs : null;
}

export function fixInnerQuotes(str) {
  let out = "", inStr = false, esc = false;
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (esc) { out += ch; esc = false; continue; }
    if (ch === "\\") { out += ch; esc = true; continue; }
    if (ch === '"') {
      if (!inStr) { inStr = true; out += ch; continue; }
      const rest = str.slice(i + 1).trimStart();
      if (/^[:\,\}\]]/.test(rest) || rest === "") { inStr = false; out += ch; }
      else { out += '\\"'; }
      continue;
    }
    if (inStr && (ch === "\n" || ch === "\r")) { out += " "; continue; }
    out += ch;
  }
  return out;
}

export async function askClaude(prompt, onChunk, retries=2, action="misc") {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const tokenLimit = 8000;

      // Always through our authenticated proxy — the browser never holds the Anthropic key.
      // Abort a stalled request after 90s so a single hung call can't freeze the whole flow forever.
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 90000);
      let res;
      try {
        res = await fetchWithBackoff("/api/claude", {
          method:"POST", headers: apiHeaders(action),
          body:JSON.stringify({ model:"claude-haiku-4-5-20251001", max_tokens:tokenLimit, system:CLAUDE_SYSTEM, messages:[{role:"user",content:prompt}], stream:false }),
          signal: ctrl.signal,
        });
      } finally { clearTimeout(timer); }
      noteBalance(res);
      if (!res.ok) {
        const err = await res.text();
        console.error(`Claude API error (attempt ${attempt+1}):`, err.slice(0,200));
        // Auth/credit/limit failures won't recover on retry — surface once and stop (see _onBalance).
        if (res.status === 429) { try { _onBalance?.("demo_limit"); } catch {} return null; }
        if (res.status === 401 || res.status === 402) { try { _onBalance?.(res.status === 402 ? "out_of_credits" : "auth"); } catch {} return null; }
        if (attempt < retries-1) { await new Promise(r=>setTimeout(r,1000)); continue; }
        return null;
      }
      const data = await res.json();
      const full = data.content?.[0]?.text || "";
      if (!full.trim()) {
        if (attempt < retries-1) { await new Promise(r=>setTimeout(r,500)); continue; }
        return null;
      }
      onChunk(full);
      let clean = full
        .replace(/```json\s*/gi, "").replace(/```\s*/g, "")
        .replace(/['']/g, "'").replace(/[""]/g, '"')
        .replace(/—/g, "--").replace(/–/g, "-")
        .trim();
      // Extract the JSON payload — handle BOTH array ([...]) and object ({...}) responses.
      // (Batch panel calls return arrays; slicing to just braces would strip the [] and corrupt them.)
      const objStart = clean.indexOf("{");
      const arrStart = clean.indexOf("[");
      let start = -1;
      if (arrStart !== -1 && (objStart === -1 || arrStart < objStart)) start = arrStart;
      else start = objStart;
      const end = Math.max(clean.lastIndexOf("}"), clean.lastIndexOf("]"));
      if (start !== -1 && end > start) clean = clean.slice(start, end+1);
      try {
        return JSON.parse(clean);
      } catch(e) {
        console.warn("JSON parse failed, attempting repair... Raw:", full.slice(0, 600));
        try {
          let fixed = fixInnerQuotes(clean)
            .replace(/[\x00-\x08\x0b\x0e-\x1f\x7f]/g, "")
            .replace(/,\s*([}\]])/g, "$1");
          const openBraces = (fixed.match(/{/g)||[]).length;
          const closeBraces = (fixed.match(/}/g)||[]).length;
          const openBrackets = (fixed.match(/\[/g)||[]).length;
          const closeBrackets = (fixed.match(/\]/g)||[]).length;
          const lastMeaningful = fixed.trimEnd();
          if (lastMeaningful && !'"}]'.includes(lastMeaningful[lastMeaningful.length-1])) fixed = fixed.trimEnd() + '"';
          for (let i = 0; i < openBrackets - closeBrackets; i++) fixed += ']';
          for (let i = 0; i < openBraces - closeBraces; i++) fixed += '}';
          return JSON.parse(fixed);
        } catch(e2) {
          // Last resort: if this looks like a truncated array, recover the complete objects
          const salvaged = salvageArray(clean);
          if (salvaged) { console.warn(`Recovered ${salvaged.length} complete items from truncated array`); return salvaged; }
          if (attempt < retries-1) { await new Promise(r=>setTimeout(r,500)); continue; }
          return null;
        }
      }
    } catch(e) {
      console.error("Network error:", e.message);
      if (attempt < retries-1) { await new Promise(r=>setTimeout(r,1000)); continue; }
      return null;
    }
  }
  return null;
}

// Cache-first translation via /api/translate: returns a globally-cached translation if one exists (free,
// instant, same for everyone), else translates once (Haiku), persists it for every future reader, and returns
// it. This is what makes "every manga in every language for every reader" affordable — each (story, language,
// chapter) is paid for once, ever. No sign-in / no credit charge; the server bounds misses by the per-IP cap.
// Returns { cached, data } where data = { language, chapter_title, panels } (or data:null on failure).
export async function translateCached(storyId, language, chapterNum, panels, story) {
  try {
    const r = await fetch("/api/translate", {
      method: "POST",
      headers: apiHeaders("free"),
      body: JSON.stringify({ storyId, language, chapterNum: chapterNum || 1, panels: panels || [], story: { title: story?.title, logline: story?.logline } }),
    });
    if (!r.ok) { const b = await r.json().catch(() => ({})); return { data: null, code: b.code, error: b.error || `HTTP ${r.status}` }; }
    return await r.json();
  } catch (e) { return { data: null, error: e.message }; }
}

// Translate a whole chapter into `lang`, running its 12-panel batches CONCURRENTLY (default 4 at a
// time) instead of one-by-one — a big speedup on long chapters, with panel order preserved. Returns
// { language, chapter_title, panels } or null. onProgress(done, total) reports batch completion.
export async function translateChapter(script, lang, voices, story, onProgress = () => {}, conc = 4) {
  const panels = script?.panels || [];
  if (!panels.length) return null;
  const starts = [];
  for (let i = 0; i < panels.length; i += 12) starts.push(i);
  const results = new Array(starts.length);
  let done = 0, next = 0;
  const worker = async () => {
    while (next < starts.length) {
      const idx = next++;
      const slice = panels.slice(starts[idx], starts[idx] + 12);
      results[idx] = await askClaude(P_TRANSLATE({ ...script, panels: slice }, lang, voices, story), () => {});
      onProgress(++done, starts.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(conc, starts.length) }, worker));
  const merged = []; let title = null;
  for (const r of results) { if (r?.panels?.length) merged.push(...r.panels); if (r?.chapter_title && !title) title = r.chapter_title; }
  return merged.length ? { language: lang, chapter_title: title, panels: merged, _sigs: scriptSigs(script) } : null;
}

// ── Per-panel content signatures — so we only re-translate panels whose DIALOGUE changed ─────────
// A translation depends only on a panel's dialogue text (character + type + text). Redrawing a panel's
// ART doesn't change the words, so its translation is already correct — the sig deliberately ignores
// art and only re-translates a panel when its DIALOGUE is edited, so no tokens are spent redoing
// identical text.
function fnv(str) { let h = 0x811c9dc5; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(36); }
export function panelSig(p) {
  const dia = (p?.dialogue || []).map(d => `${d.character||""}|${d.type||""}|${(d.text ?? d.original ?? "")}`).join("¶");
  return fnv(dia);
}
export function scriptSigs(script) {
  const m = {};
  for (const p of (script?.panels || [])) m[p.number] = panelSig(p);
  return m;
}

// Bring an existing stored translation up to date with the current script, re-translating ONLY the
// panels whose dialogue changed (and dropping panels that were deleted). Returns the merged data with
// fresh `_sigs` and an `_updated` count (number of panels re-translated / removed; 0 = nothing stale).
// With no prevData it does a full translate. Used by the author side after edits/redraws so the store
// always reflects the latest script without re-paying for unchanged panels.
export async function translateUpdated(script, lang, voices, story, prevData, onProgress = () => {}, conc = 4) {
  const sigs = scriptSigs(script);
  const curNums = (script?.panels || []).map(p => p.number);
  if (!prevData || !prevData._sigs || !Array.isArray(prevData.panels)) {
    const full = await translateChapter(script, lang, voices, story, onProgress, conc);
    if (full) full._updated = -1; // -1 = translated from scratch
    return full;
  }
  const prevByNum = {}; prevData.panels.forEach(p => { prevByNum[p.number] = p; });
  const changed = (script?.panels || []).filter(p => prevData._sigs[p.number] !== sigs[p.number] || !prevByNum[p.number]);
  const removed = prevData.panels.filter(p => !curNums.includes(p.number)).length;
  if (!changed.length) {
    if (!removed) return { ...prevData, _sigs: sigs, _updated: 0 }; // fully up to date
    const pruned = prevData.panels.filter(p => curNums.includes(p.number));
    return { ...prevData, panels: pruned, _sigs: sigs, _updated: removed };
  }
  const partial = await translateChapter({ ...script, panels: changed }, lang, voices, story, onProgress, conc);
  const newByNum = {}; (partial?.panels || []).forEach(p => { newByNum[p.number] = p; });
  // Rebuild in current script order: new translation where a panel changed, prior translation otherwise.
  const mergedPanels = (script?.panels || []).map(p => newByNum[p.number] || prevByNum[p.number]).filter(Boolean);
  return {
    language: lang,
    chapter_title: prevData.chapter_title || partial?.chapter_title || null,
    panels: mergedPanels,
    _sigs: sigs,
    _updated: changed.length + removed,
  };
}

// ── ElevenLabs HD voices (served via the /api/eleven proxy) ──────────────
// Voice (ElevenLabs) is served by the /api/eleven proxy (server holds the key). OFF in demo to keep the
// test lean — it turns on at launch (RELEASE_MODE), unless VITE_HAS_ELEVEN="false" keeps it hidden.
export const HAS_ELEVEN = RELEASE_MODE && (((typeof import.meta !== "undefined" && import.meta.env?.VITE_HAS_ELEVEN) ?? "true") !== "false");

// Public ElevenLabs voice IDs, split by timbre so we can cast characters sensibly
const ELEVEN_MALE   = ["pNInz6obpgDQGcFmaJgB","TxGEqnHWrfWFTfGW9XjX","VR6AewLTigWG4xSOukaG","ErXwobaYiN019PkySvjV"]; // Adam, Josh, Arnold, Antoni
const ELEVEN_FEMALE = ["21m00Tcm4TlvDq8ikWAM","EXAVITQu4vr4xnSDxMaL","AZnzlk1XvdvUeBnXmlld","ThT5KcBeYPX3keUQqHPh"]; // Rachel, Bella, Domi, Dorothy
const ELEVEN_DEEP   = "pNInz6obpgDQGcFmaJgB"; // Adam — for antagonists/menace

// Named premade voices the creator can hand-pick per character
export const ELEVEN_VOICE_OPTIONS = [
  { id: "21m00Tcm4TlvDq8ikWAM", name: "Rachel",  gender: "F", desc: "calm narrator" },
  { id: "EXAVITQu4vr4xnSDxMaL", name: "Bella",   gender: "F", desc: "soft, young" },
  { id: "AZnzlk1XvdvUeBnXmlld", name: "Domi",    gender: "F", desc: "strong, confident" },
  { id: "ThT5KcBeYPX3keUQqHPh", name: "Dorothy", gender: "F", desc: "pleasant, British" },
  { id: "MF3mGyEYCl7XYWbV9V6O", name: "Elli",    gender: "F", desc: "emotional, youthful" },
  { id: "pNInz6obpgDQGcFmaJgB", name: "Adam",    gender: "M", desc: "deep, authoritative" },
  { id: "TxGEqnHWrfWFTfGW9XjX", name: "Josh",    gender: "M", desc: "young, warm" },
  { id: "VR6AewLTigWG4xSOukaG", name: "Arnold",  gender: "M", desc: "crisp, firm" },
  { id: "ErXwobaYiN019PkySvjV", name: "Antoni",  gender: "M", desc: "well-rounded" },
  { id: "yoZ06aMxZJJ28mfd3POQ", name: "Sam",     gender: "M", desc: "raspy, edgy" },
  { id: "IKne3meq5aSn9XLyUdCD", name: "Charlie", gender: "M", desc: "casual, Australian" },
];

const strHash = (s) => Math.abs(String(s||"").split("").reduce((a,c)=>((a<<5)-a+c.charCodeAt(0))|0, 0));

// Choose an ElevenLabs voice for a character from their profile (+ optional appearance hint)
export function pickElevenVoice(v, genderHint = "") {
  const text = `${v.character||""} ${v.personality_core||""} ${v.speech_style||""} ${v.emotional_range||""} ${genderHint}`.toLowerCase();
  const role = (v.role||"").toLowerCase();
  const isFemale = /\b(she|her|hers|woman|women|girl|female|lady|queen|mother|sister|daughter|mrs|ms|miss|priestess|goddess)\b/.test(text);
  const isMale   = /\b(he|him|his|man|men|boy|male|lord|king|father|brother|son|mr|sir|prince|god)\b/.test(text);
  if ((role.includes("antagonist") || /cold|menac|ruthless|villain|dark|deep|sinister/.test(text)) && !isFemale) return ELEVEN_DEEP;
  const pool = isFemale && !isMale ? ELEVEN_FEMALE : isMale && !isFemale ? ELEVEN_MALE : (strHash(v.character) % 2 ? ELEVEN_MALE : ELEVEN_FEMALE);
  return pool[strHash(v.character) % pool.length];
}

// Generate speech via ElevenLabs. Returns an object URL for an MP3, or null on failure.
export async function generateElevenAudio(text, voiceId) {
  if (!text) return null;
  try {
    // Through the authenticated /api/eleven proxy — the browser never holds the ElevenLabs key.
    const res = await fetchWithBackoff("/api/eleven", {
      method: "POST",
      headers: apiHeaders("voice_tts", { "Accept": "audio/mpeg" }),
      body: JSON.stringify({ text, voiceId }),
    });
    noteBalance(res);
    if (!res.ok) { console.error("ElevenLabs error:", res.status, (await res.text().catch(()=>'')).slice(0,200)); return null; }
    const blob = await res.blob();
    return URL.createObjectURL(blob);
  } catch (e) { console.warn("ElevenLabs request failed:", e.message); return null; }
}

// Art-style vocabulary + canvas proportions, shared by panel generation and LoRA training.
// Together AI caps each dimension at 1024; keep every value in [64,1024] and a multiple of 64.
const STYLE_PROMPTS = {
  'JP-EN': 'professional Japanese manga-style illustration, monochrome black-and-white, no color, textless artwork, crisp detailed black ink, detailed screen tones, dramatic speed lines, expressive anime faces, high contrast shadows, richly detailed',
  'KR-EN': 'premium Korean manhwa webtoon illustration, textless artwork, lush full color, soft cel shading, cinematic rim lighting, beautiful detailed characters, vertical-scroll composition',
  'CN-EN': 'high-end Chinese manhua illustration, textless artwork, vibrant saturated colors, intricate flowing costumes, dynamic wuxia poses, painterly detail',
  'US-EN': 'polished western comic book illustration, textless artwork, bold confident inks, rich flat colors, dramatic foreshortening, cinematic angles',
  'GL-EN': 'professional manga illustration, detailed clean linework, dynamic composition, expressive anime style, dramatic lighting',
  'PRISMA': 'Prisma house style: premium full-color fusion art — manhwa cel-shaded polish, expressive anime manga faces with speed lines, bold cinematic comic composition, vivid saturated palette, dramatic volumetric lighting, vertical webtoon framing, ultra detailed',
};
const STYLE_DIMS = {
  'JP-EN': { w: 1024, h: 1024 }, // manga — square-ish page panel
  'KR-EN': { w: 704,  h: 1024 }, // manhwa webtoon — tall portrait
  'CN-EN': { w: 768,  h: 1024 }, // manhua — portrait
  'US-EN': { w: 1024, h: 704  }, // western comics — wide landscape
  'GL-EN': { w: 1024, h: 1024 },
  'PRISMA': { w: 704, h: 1024 }, // Prisma house format — tall vertical-scroll webtoon frames
};
const clampDim = (n) => Math.max(64, Math.min(1024, Math.round(n / 64) * 64));
// Fal is reached ONLY through the authenticated /api/fal proxy — the browser never holds the Fal key.
// The client keeps its orchestration (model failover, canvas black-detection, reseed); each request
// goes through falRun/falUpload/falQueue below. `action` drives server credit charging.
async function falRun(endpoint, body, action = "free") {
  // tries:1 — generatePanelImage does its own model failover + Fal circuit breaker, so retrying a
  // throttled account here just triples the 429 noise. Fail fast and let the caller fall through.
  const res = await fetchWithBackoff("/api/fal", { method: "POST", headers: apiHeaders(action), body: JSON.stringify({ op: "run", endpoint, body }) }, { tries: 1 });
  noteBalance(res);
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

// ── Minimal ZIP writer (STORE method, no compression). PNGs are already compressed,
//    so store is valid and keeps us dependency-free. files: [{name, data:Uint8Array}] ──
function makeZip(files) {
  const table = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = (buf) => { let c = 0xFFFFFFFF; for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  const enc = new TextEncoder();
  const u16 = (n) => [n & 0xFF, (n >>> 8) & 0xFF];
  const u32 = (n) => [n & 0xFF, (n >>> 8) & 0xFF, (n >>> 16) & 0xFF, (n >>> 24) & 0xFF];
  const parts = []; const central = []; let offset = 0;
  for (const f of files) {
    const nameB = enc.encode(f.name); const crc = crc32(f.data); const sz = f.data.length;
    const local = [...u32(0x04034b50), ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(crc), ...u32(sz), ...u32(sz), ...u16(nameB.length), ...u16(0)];
    parts.push(new Uint8Array(local), nameB, f.data);
    const cen = [...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(crc), ...u32(sz), ...u32(sz), ...u16(nameB.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(offset)];
    central.push(new Uint8Array(cen), nameB);
    offset += local.length + nameB.length + sz;
  }
  let clen = 0; for (const c of central) clen += c.length;
  const end = [...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length), ...u32(clen), ...u32(offset), ...u16(0)];
  const all = [...parts, ...central, new Uint8Array(end)];
  let total = 0; for (const a of all) total += a.length;
  const out = new Uint8Array(total); let p = 0; for (const a of all) { out.set(a, p); p += a.length; }
  return out;
}

// Upload raw bytes to fal storage via the proxy → returns a public CDN URL. (base64 for JSON transport)
async function falUpload(bytes, contentType, fileName) {
  let bin = ""; const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
  const dataB64 = btoa(bin);
  const res = await fetchWithBackoff("/api/fal", { method: "POST", headers: apiHeaders("free"), body: JSON.stringify({ op: "upload", contentType, fileName, dataB64 }) });
  if (!res.ok) throw new Error(`upload ${res.status}`);
  const { file_url } = await res.json();
  return file_url;
}

// Submit a job to the fal queue (via proxy) and poll until it completes → returns the result JSON.
async function falQueue(endpoint, body, onProgress = () => {}, { pollMs = 4000, maxMs = 480000 } = {}) {
  const sub = await fetchWithBackoff("/api/fal", { method: "POST", headers: apiHeaders("lora"), body: JSON.stringify({ op: "queue_submit", endpoint, body }) });
  noteBalance(sub);
  if (!sub.ok) throw new Error(`queue submit ${sub.status}`);
  const { request_id } = await sub.json();
  const started = Date.now();
  while (Date.now() - started < maxMs) {
    await new Promise(r => setTimeout(r, pollMs));
    const st = await fetch("/api/fal", { method: "POST", headers: apiHeaders("free"), body: JSON.stringify({ op: "queue_status", endpoint, requestId: request_id }) });
    if (st.ok) {
      const s = await st.json();
      if (s.status === 'COMPLETED') break;
      onProgress(s.status || 'IN_PROGRESS');
    }
  }
  const res = await fetch("/api/fal", { method: "POST", headers: apiHeaders("free"), body: JSON.stringify({ op: "queue_result", endpoint, requestId: request_id }) });
  if (!res.ok) throw new Error(`queue result ${res.status}`);
  return res.json();
}

// Generate a set of consistent reference shots of ONE character (for LoRA training).
async function generateCharacterSheet(charBrief, style, name, onProgress = () => {}) {
  const brief = charBrief?.design_brief || {};
  const identity = [brief.body_type, brief.hair, brief.eyes, brief.default_outfit && `wearing ${brief.default_outfit}`, brief.signature_accessory]
    .filter(Boolean).join(', ') || charBrief?.appearance || name;
  const styleMod = STYLE_PROMPTS[style] || STYLE_PROMPTS['GL-EN'];
  const seedBase = 987654321;
  // Varied angles/expressions, SAME character, plain background — ideal LoRA training data.
  const shots = [
    'full body, front view, neutral expression, standing, T-pose reference',
    'upper body portrait, close-up on the face, calm expression',
    'three-quarter view, slight turn, determined expression',
    'side profile view, full face visible',
    'full body, dynamic action pose, mid-motion',
    'upper body, angry/intense expression, close-up',
  ];
  const blobs = [];
  for (let i = 0; i < shots.length; i++) {
    onProgress(`Drawing reference ${i + 1}/${shots.length}…`);
    const prompt = `${styleMod}. character reference sheet, single character, ${identity}. ${shots[i]}. plain neutral grey studio background, even lighting, full character visible, consistent design. No text, no watermark, no speech bubbles, no other people.`;
    const url = await generatePanelImage(prompt, "no characters", style, (seedBase + i) % 2147483647);
    // generatePanelImage returns a URL (or data URI). Fetch to bytes for zipping.
    if (!url) continue;
    try {
      const r = await fetch(url);
      const buf = new Uint8Array(await r.arrayBuffer());
      if (buf.length > 500) blobs.push(buf);
    } catch (e) { console.warn('sheet fetch failed', e.message); }
    await new Promise(r => setTimeout(r, 800));
  }
  return blobs;
}

// Full LoRA pipeline: draw a character sheet → zip → upload → train → return {url, trigger, scale}.
export async function trainCharacterLora(charBrief, style, name, onProgress = () => {}) {
  const trigger = ((name || 'HERO').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12) || 'HERO') + 'CHAR';
  onProgress('Drawing character reference sheet…');
  const blobs = await generateCharacterSheet(charBrief, style, name, onProgress);
  if (blobs.length < 4) throw new Error(`Only ${blobs.length} reference images generated — need at least 4. Try again.`);
  onProgress('Packaging references…');
  const zip = makeZip(blobs.map((b, i) => ({ name: `img_${i}.png`, data: b })));
  onProgress('Uploading to trainer…');
  const zipUrl = await falUpload(zip, 'application/zip', `${trigger}_refs.zip`);
  onProgress('Training character model (this takes a few minutes)…');
  const result = await falQueue('fal-ai/flux-lora-fast-training', {
    images_data_url: zipUrl, trigger_word: trigger, steps: 1000, create_masks: true,
  }, (s) => onProgress(`Training character model… (${s.toLowerCase()})`));
  const loraUrl = result?.diffusers_lora_file?.url;
  if (!loraUrl) throw new Error('Training finished but no weights returned');
  return { url: loraUrl, trigger, scale: 0.95 };
}

// Fal's schnell endpoint runs an INPUT content checker that returns 422 and can't be disabled
// without account authorization. A single mature word in the character sheet (e.g. "blood-red eyes")
// then flags EVERY panel. Soften the image prompt only — the story text is untouched.
function sanitizeForImage(t) {
  if (!t) return t;
  return String(t)
    .replace(/blood[-\s]?red/gi, "crimson")
    .replace(/blood[-\s]?stained|bloodied|bloody|bloodshed|\bblood\b/gi, "crimson")
    .replace(/\bgore\b|gory/gi, "intense")
    .replace(/corpses?|dead bodies|dead body/gi, "fallen figure")
    .replace(/severed|dismember(?:ed|ment)?|mutilat(?:ed|ion)|disembowel(?:ed)?|viscera|entrails/gi, "defeated")
    // violence/weapon terms the checker flags → soften to NON-flagged equivalents (confront/overpower/
    // defeat/standoff all pass Fal's input checker; clash/battle/strike/fight do NOT — never target those).
    .replace(/\bkilling\b|\bmurder(?:ing|ed)?\b/gi, "defeating")
    .replace(/\bkills?\b|\bkilled\b/gi, "overpowers")
    .replace(/\bgunshot\b|\bgunfire\b/gi, "blast")
    .replace(/\bstab(?:bing|bed|s)?\b|\bimpale(?:d|s|ment)?\b|\bpierc(?:e|es|ed|ing)\b/gi, "confronts")
    .replace(/\btorture(?:d|s)?\b|\bgruesome\b|\bgraphic\b|\bbrutal(?:ly)?\b/gi, "intense")
    // injury phrasing → reframe as a tense, non-graphic moment
    .replace(/through (?:his|her|their|the) (?:chest|heart|throat|body|gut|stomach|skull|head|back|neck)/gi, "in a tense confrontation")
    .replace(/\bslash(?:es|ed)? open\b|\btears? through flesh\b|\bguts?\b|\bentrail\w*/gi, "overpowers")
    .replace(/\bdecapitat\w*|\bbeheads?\b|\bbehead(?:ed|ing)\b/gi, "defeats")
    // directed harm ("X attacks the enemy") → a tense, non-graphic face-off (run BEFORE bare verbs below)
    .replace(/\b(?:strikes?|strik\w+|attacks?|hits?|slashes?|cuts?|stabs?|kills?|slays?|cleaves?|swings? at)\s+(?:down\s+|at\s+|into\s+|through\s+)?(?:the |a |an |his |her |their )?(?:enemy|enemies|foe|foes|opponent|opponents|victim|man|woman|target|him|her|them)\b/gi, "faces off against a rival")
    // combat-scene words Fal's INPUT checker flags even when non-graphic → tense-but-safe equivalents
    .replace(/\bclash(?:es|ing|ed)?\b/gi, "tense standoff")
    .replace(/\b(?:sword|gun|fist)\s?fight(?:s|ing)?\b|\bswordplay\b|\bbrawl(?:s|ing)?\b/gi, "tense standoff")
    .replace(/\b(?:fights?|fighting|fought)\b/gi, "faces off")
    .replace(/\bbattl(?:e|es|ing|ed)\b|\bcombat\b|\bwarfare\b/gi, "confrontation")
    .replace(/\bassault(?:s|ing|ed)?\b/gi, "confronts")
    .replace(/\battack(?:s|ing|ed)?\b/gi, "charges at")
    .replace(/\b(?:strikes?|striking|struck)\b/gi, "confronts")
    .replace(/\bslays?\b|\bslain\b|\bcleaves?\b/gi, "defeats")
    // remaining high-frequency flagged nouns → known-safe equivalents (Fal input checker still 422s on these)
    .replace(/\bviolen(?:t|ce|tly)\b/gi, "intense")
    .replace(/\bweapons?\b/gi, "gear")
    .replace(/\bwarfare\b|\bwars?\b/gi, "struggle")
    .replace(/\bdemon(?:s|ic)?\b/gi, "dark figure")
    .replace(/\bslaughter\w*|\bmassacre\w*|\bcarnage\b/gi, "defeat")
    .replace(/\bexecut(?:e|es|ed|ion)\b/gi, "overpowers")
    // sexual/suggestive terms — remove
    .replace(/\bnaked\b|\bnude\b|nudity|topless|explicit|erotic|seductive|sensual|lingerie|cleavage|revealing outfit|sexy/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

// Fal's OUTPUT safety checker (which can't be disabled without account authorization) returns a
// solid BLACK image when it flags a generation — a 200 response with all-black pixels. Detect that
// so we can reject it and fall through to a tamer prompt / new seed instead of showing a black panel.
async function isMostlyBlack(url) {
  try {
    if (typeof document === "undefined" || !url || url.startsWith("data:")) return false;
    const img = await new Promise((res, rej) => {
      const im = new Image();
      im.crossOrigin = "anonymous";
      im.onload = () => res(im);
      im.onerror = rej;
      im.src = url;
    });
    const c = document.createElement("canvas");
    c.width = 24; c.height = 24;
    const ctx = c.getContext("2d");
    ctx.drawImage(img, 0, 0, 24, 24);
    const data = ctx.getImageData(0, 0, 24, 24).data;
    let maxLuma = 0;
    for (let i = 0; i < data.length; i += 4) {
      const luma = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      if (luma > maxLuma) maxLuma = luma;
    }
    return maxLuma < 18; // no pixel brighter than ~18/255 → an all-black safety-blocked image
  } catch { return false; } // CORS/other error → don't block a legit image
}

export async function generatePanelImage(panelDescription, characterContext, style, seed, lora) {
  const styleModifier = STYLE_PROMPTS[style] || STYLE_PROMPTS['GL-EN']; // match the character-sheet + dims fallback
  const dims = STYLE_DIMS[style] || STYLE_DIMS['GL-EN'];
  const desc = sanitizeForImage(panelDescription).slice(0, 450);
  const chars = sanitizeForImage(characterContext).slice(0, 700);
  const hasSeed = Number.isFinite(seed);
  // Art-direction that ALSO steers the generation away from imagery Fal's output checker blacks out —
  // affirmative "clean / tasteful / bloodless" framing (positive prompts handle negation poorly, so we
  // describe the safe look we WANT rather than saying "no blood"). Prepended to every prompt below.
  const isMono = style === 'JP-EN'; // Manga renders black-and-white (grayscale display + color negatives)
  const QUALITY = 'masterpiece, highly detailed, sharp focus, professional illustration, dramatic composition, volumetric lighting, intricate detail, clean stylized art, tasteful and non-graphic, bloodless stylized action, suitable for all audiences';
  // Lead with the SCENE/ACTION (what's happening + where) so the panel tells the story, not just
  // shows a character portrait. Character identity follows as the anchor for consistency.
  const hasChars = chars && !/^no characters/i.test(chars);
  const prompt = hasChars
    ? `${styleModifier}. ${QUALITY}. Storytelling panel — depict the full scene, its setting/environment, and the exact action/emotion of this moment: ${desc}. Characters present — render each with the EXACT SAME face, hairstyle, hair color, and outfit as described, identical in every panel, never altered: ${chars}. Match the picture to what is happening: the right characters, doing the described action, with expressions that fit the moment. Show them interacting with the environment and each other through body language and a varied cinematic camera angle — establishing shot, two-shot, or over-the-shoulder as the moment needs — NOT a plain centered portrait. Only the people described are present. ANATOMY MUST BE CORRECT: each person has exactly two arms, two legs, one head, and hands with exactly five fingers, in natural human proportions — no extra or missing limbs, no extra fingers, no distorted or backwards hands. Clean manga line art with ABSOLUTELY NO written text anywhere in the image — no kanji, no kana, no Japanese or Chinese characters, no letters, no numbers, no captions, no sound-effect text, no speech bubbles, no watermark, no signature.`
    : `${styleModifier}. ${QUALITY}. Establishing shot of the setting with no people — depict the environment, atmosphere, and mood in full: ${desc}. Rich background detail. Clean manga line art with ABSOLUTELY NO written text anywhere in the image — no kanji, no kana, no Japanese or Chinese characters, no letters, no numbers, no captions, no sound-effect text, no speech bubbles, no watermark, no signature.`;
  const NEGATIVE = (isMono ? 'color, colored, vibrant colors, saturated colors, full color, rgb, ' : '') + 'blood, gore, wound, injury, viscera, corpse, dead body, nsfw, nudity, nude, sexual, graphic violence, text, words, letters, japanese text, kanji, kana, chinese characters, hanzi, korean text, hangul, captions, sound effect text, gibberish text, signage, speech bubbles, watermark, signature, blurry, low quality, deformed, disfigured, bad anatomy, extra limbs, extra fingers, mutated hands, poorly drawn face, distorted, ugly, jpeg artifacts, cropped, out of frame';
  // Content-safe last resort: drops the (possibly flagged) scene text and keeps only style + who's
  // present + a generic dramatic direction, so a flagged panel still renders SOMETHING, not a blank.
  const safePrompt = hasChars
    ? `${styleModifier}. ${QUALITY}. Featuring ${chars}. A dramatic, cinematic textless illustration with a dynamic action pose and intense atmosphere. Clean art with NO written text, no kanji, no letters, no captions, no speech bubbles, no watermark.`
    : `${styleModifier}. ${QUALITY}. A dramatic, cinematic textless illustration — atmospheric, detailed environment. Clean art with NO written text, no kanji, no letters, no captions, no watermark.`;

  // One logical panel = one charge: the FIRST Fal call charges 'panel', all retries/failover are 'free'.
  let _charged = false;
  const chargeAction = () => (_charged ? "free" : (_charged = true, "panel"));

  // ── LoRA path: if this character has a trained model, use flux-lora for LOCKED identity. ──
  // Requires Fal (flux-lora has no Together/DeepInfra equivalent), so it's gated behind FAL_ENABLED —
  // with Fal demoted, a LoRA request falls through to the normal Together/DeepInfra chain.
  if (lora?.url && FAL_ENABLED) {
    const trig = lora.trigger || "";
    const loraPrompt = hasChars
      ? `${styleModifier}. ${QUALITY}. Storytelling panel — depict the full scene, its setting/environment, and the action: ${desc}. In this scene: ${trig} (the main character — ${chars}). Show the characters interacting with the environment through body language and a varied cinematic camera angle, NOT a plain centered portrait. Only the described people are present. ANATOMY MUST BE CORRECT: each person has exactly two arms, two legs, one head, and hands with exactly five fingers, in natural proportions — no extra or missing limbs, no extra fingers, no distorted or backwards hands. Clean manga line art with ABSOLUTELY NO written text anywhere in the image — no kanji, no kana, no Japanese or Chinese characters, no letters, no numbers, no captions, no sound-effect text, no speech bubbles, no watermark, no signature.`
      : prompt;
    let loraBlack = 0;
    for (let i = 0; i < 3; i++) {
      try {
        const { ok, status, data } = await falRun('fal-ai/flux-lora', { prompt: loraPrompt, loras: [{ path: lora.url, scale: lora.scale || 0.9 }], image_size: { width: clampDim(dims.w), height: clampDim(dims.h) }, num_inference_steps: 28, guidance_scale: 3.5, num_images: 1, enable_safety_checker: false, ...(hasSeed ? { seed: seed + loraBlack * 7919 } : {}) }, chargeAction());
        if (ok) {
          const url = data.images?.[0]?.url;
          if (url && !(await isMostlyBlack(url))) return url;
          if (url) { // blacked output — reseed the same LoRA model before falling through to plain schnell
            if (++loraBlack < 3) { console.warn(`flux-lora: safety-blocked (black) → reseed retry ${loraBlack}`); await new Promise(r => setTimeout(r, 700)); continue; }
            console.warn('flux-lora: safety-blocked (black) image → falling through'); break;
          }
        }
        else { console.warn(`flux-lora ${status}`); if (status === 401 || status === 422 || status === 429) break; }
      } catch (e) { console.warn(`flux-lora attempt ${i+1} failed:`, e.message); }
      await new Promise(r => setTimeout(r, 1200));
    }
    // fall through to plain schnell if the LoRA path fails
  }

  // ── PROVIDER: Fal.ai via the /api/fal proxy. flux/schnell is fast but runs an INPUT content checker
  //    that 422s on some prompts; fast-sdxl has no such input filter, so it's the reliable fallback. ──
  // Skip Fal entirely while the account is in its rate-limit cooldown (set by a prior 429) — go to Together.
  // Also skipped whenever Fal is demoted (FAL_ENABLED=false, the default) so Together is the primary provider.
  if (FAL_ENABLED && Date.now() >= _falCooldownUntil) {
    const box = { width: clampDim(dims.w), height: clampDim(dims.h) };
    const M_FLUX = { name: 'flux/schnell', endpoint: 'fal-ai/flux/schnell', body: { prompt, image_size: box, num_inference_steps: 6, num_images: 1, enable_safety_checker: false, ...(hasSeed ? { seed } : {}) } };
    const M_SDXL = { name: 'fast-sdxl', endpoint: 'fal-ai/fast-sdxl', body: { prompt, negative_prompt: NEGATIVE, image_size: box, num_inference_steps: 25, num_images: 1, enable_safety_checker: false, ...(hasSeed ? { seed } : {}) } };
    const M_FLUX_SAFE = { name: 'flux/schnell-safe', endpoint: 'fal-ai/flux/schnell', body: { prompt: safePrompt, image_size: box, num_inference_steps: 6, num_images: 1, enable_safety_checker: false, ...(hasSeed ? { seed } : {}) } };
    // flux first (richest look). The account now runs its INPUT content-checker on EVERY model (incl.
    // fast-sdxl), so on a flux 422 retry the SAME fast model with the tamer prompt (which passes the input
    // checker) BEFORE sdxl — sdxl would just 422 too. sdxl stays last as a different-look safety net.
    const FAL_MODELS = [M_FLUX, M_FLUX_SAFE, M_SDXL];
    falModels: for (const m of FAL_MODELS) {
      let blackHits = 0;
      for (let i = 0; i < 3; i++) {
        // Reseed on a black (safety-blocked) image: the OUTPUT checker is stochastic, so the SAME prompt
        // with a shifted seed usually passes — keeping this fast/high-quality model.
        const body = hasSeed ? { ...m.body, seed: seed + blackHits * 7919 } : m.body;
        try {
          const { ok, status, data } = await falRun(m.endpoint, body, chargeAction());
          if (ok) {
            const url = data.images?.[0]?.url;
            if (url && !(await isMostlyBlack(url))) return url;
            if (url) { // blacked output — reseed the SAME model up to twice, then fall to the tamer one
              if (++blackHits < 3) { console.warn(`Fal ${m.name}: safety-blocked (black) → reseed retry ${blackHits}`); await new Promise(r => setTimeout(r, 600)); continue; }
              console.warn(`Fal ${m.name}: safety-blocked (black) image → next model`); break;
            }
          } else {
            console.warn(`Fal ${m.name} ${status}`);
            if (status === 429) {
              if (data?.code === "demo_limit") { try { _onBalance?.("demo_limit"); } catch {} return null; } // OUR per-IP daily cap
              // Fal's OWN rate limit (account throttled). Trip the circuit breaker so every remaining panel
              // in this run skips Fal and goes straight to Together — no 429 flood.
              _falCooldownUntil = Date.now() + 60000;
              console.warn(`Fal ${m.name}: account rate-limited (429) → Fal paused 60s, using Together`);
              break falModels;
            }
            if (status === 401) return null;  // proxy/key problem — nothing will work
            if (status === 422) break;        // this model's input checker rejected the prompt — try the next
          }
        } catch (e) { console.warn(`Fal ${m.name} attempt ${i + 1} failed:`, e.message); }
        await new Promise(r => setTimeout(r, 1000));
      }
    }
    // fall through to the Together (/api/image) last resort below
  }

  // Together is reached only through the authenticated /api/image proxy (it picks the model server-side).
  // Fallback order: FLUX first so a chapter that started on Fal-FLUX keeps the SAME model's look
  // when some panels fall through here — mixing SDXL mid-chapter gives one character two faces.
  // SDXL is the last resort (different latent space; same seed produces an unrelated image).
  const MODELS = [
    { id: 'black-forest-labs/FLUX.1-schnell-Free',     steps: 4,  neg: false }, // serverless (plain FLUX.1-schnell now needs a dedicated endpoint)
    { id: 'stabilityai/stable-diffusion-xl-base-1.0', steps: 24, neg: true },
  ];

  const MAX_ATTEMPTS = 5;
  const TIMEOUT_MS = 30000; // abort a hung request instead of waiting forever (image service can stall)
  let modelIdx = 0;
  let timeouts = 0;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      // Together is now the PRIMARY provider (Fal demoted), so the first call charges 'panel' (deducts the
      // credit + counts the per-IP demo cap); retries/failover run 'free'. chargeAction() flips after the
      // first call, so a logical panel is charged/counted exactly once across all providers.
      const res = await fetch('/api/image', { method: 'POST', headers: apiHeaders(chargeAction()), body: JSON.stringify({ prompt, style }), signal: ctrl.signal });
      clearTimeout(timer);
      if (res.ok) {
        const data = await res.json();
        if (data.b64) return `data:image/png;base64,${data.b64}`;
        if (data.url) return data.url;
        if (data.data?.[0]?.b64_json) return `data:image/png;base64,${data.data[0].b64_json}`;
        if (data.data?.[0]?.url) return data.data[0].url;
        return null;
      }

      const errBody = await res.text().catch(() => '');
      // Together sends x-ratelimit-reset (seconds until the window resets)
      const resetHdr = res.headers.get('x-ratelimit-reset') || res.headers.get('retry-after');
      const resetSec = parseFloat(resetHdr || '0');

      if (res.status === 429) {
        // OUR per-IP demo cap (not a provider throttle) — surface the "demo limit" toast, don't retry into blanks.
        if (errBody.includes('demo_limit')) { try { _onBalance?.("demo_limit"); } catch {} return null; }
        // Provider rate limit — honor the reset header, add jitter, stay on the same model
        const wait = Math.max(resetSec > 0 ? resetSec * 1000 : 3000, 2000) + Math.floor(Math.random() * 1500);
        console.warn(`Image API 429 — backing off ${Math.round(wait)}ms (attempt ${attempt+1}/${MAX_ATTEMPTS})`);
        await new Promise(r => setTimeout(r, wait));
        continue;
      }
      if (res.status >= 500) {
        // Server error — try the fallback model, short backoff
        console.error(`Image API ${res.status} body:`, errBody.slice(0, 200));
        modelIdx++;
        await new Promise(r => setTimeout(r, 4000));
        continue;
      }
      // Other client error (400/401/422/etc): this model won't serve this request
      // (unavailable model, or prompt flagged). Try the next model before giving up.
      console.error(`Image API ${res.status} body:`, errBody.slice(0, 300));
      if (modelIdx < MODELS.length - 1) { modelIdx++; await new Promise(r => setTimeout(r, 1200)); continue; }
      break; // Together models exhausted → try the DeepInfra fallback below
    } catch(e) {
      clearTimeout(timer);
      const timedOut = e.name === "AbortError";
      console.warn(`Image generation attempt ${attempt+1} ${timedOut ? "timed out" : "failed"}:`, e.message);
      if (timedOut) {
        // The service is hanging. Try the fallback model once; if it also hangs, give up fast
        // so the UI can surface "service unavailable" instead of stalling for minutes.
        timeouts++;
        modelIdx++;
        if (timeouts >= 2) break; // Together hanging → try the DeepInfra fallback below
      }
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  // ── FALLBACK: DeepInfra FLUX-schnell (/api/deepinfra) — cheap, no aggressive input filter. Last resort
  //    once Together is exhausted/unavailable. Best-effort: no-ops cleanly if DEEPINFRA_API_KEY isn't set.
  //    chargeAction() runs 'free' if Together already charged this panel, or 'panel' if it never did
  //    (e.g. Together was fully unreachable) — so the panel is still charged/counted exactly once.
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    const res = await fetch('/api/deepinfra', { method: 'POST', headers: apiHeaders(chargeAction()), body: JSON.stringify({ prompt, style }), signal: ctrl.signal });
    clearTimeout(timer);
    if (res.ok) {
      const data = await res.json();
      if (data.b64) return `data:image/png;base64,${data.b64}`;
      if (data.url) return data.url;
    } else {
      console.warn(`DeepInfra fallback ${res.status}`);
    }
  } catch (e) { console.warn('DeepInfra fallback failed:', e.message); }

  return null;
}

export const P_STORY = (seed, genre, tone, style) => {
  const styleDesc = STYLE_GUIDE[style] || STYLE_GUIDE["JP-EN"];
  return `Create a manga story concept. Respond ONLY with valid JSON, no other text.

Seed: "${seed}"
Genre: ${genre}
Tone: ${tone}
Art & language style: ${styleDesc}

Return this exact JSON structure with all fields filled in:
{"title":"string","tagline":"string","logline":"string","genre_tags":["string","string"],"protagonist":{"name":"string","appearance":"string","personality":"string","goal":"string"},"antagonist":{"name":"string","motivation":"string"},"central_conflict":"string","chapter_one_hook":"string","visual_style":"string"}`;
};

// Target-audience conventions. A demographic shapes TONE and content, not genre — any genre can be any demographic.
export const DEMOGRAPHIC_GUIDE = {
  "Shōnen": "young teen boys (12-18) — energetic action, friendship and rivalry, a determined underdog hero who grows stronger, hot-blooded fights, momentum and hope. Keep violence non-graphic and the spirit optimistic.",
  "Shōjo": "teen girls — emotional interiority and relationships, romance and tender feelings, expressive reactions, delicate character-driven drama, beautiful atmosphere.",
  "Seinen": "adult men — mature, complex, morally grey; grounded high stakes, psychological depth, sharper edges. Violence and themes can be darker and more realistic.",
  "Josei": "adult women — realistic romance and adult life, careers and relationships, nuanced emotions, grounded and character-forward, less fantasy wish-fulfillment.",
  "Kodomo": "young children — gentle, wholesome, simple and clear morals, warm and playful, absolutely no scary, violent, or mature content.",
};
const demoLine = (d) => (d && DEMOGRAPHIC_GUIDE[d]) ? `\nTARGET AUDIENCE — ${d}: write for ${DEMOGRAPHIC_GUIDE[d]} Let this shape the tone, content, and what happens on the page.` : "";

const scriptCraft = (useNarrator = false) => `
CRAFT RULES — write like a professional manga (One Piece, Chainsaw Man, Solo Leveling):
- Each "scene" is 2-3 vivid CINEMATIC sentences: the camera angle, the character's exact expression and body language, the environment, the lighting, motion. An artist must be able to draw it exactly.
- Keep all character NAMES in English/romanized and spelled IDENTICALLY everywhere (the casting system matches on them). Dialogue is in English.

SHOW THE STORY, NOT A SOLO PORTRAIT — this is the most important rule:
- MOST panels must contain a STORY EVENT — something HAPPENING: characters meeting, talking, reacting, clashing, moving through the world. A chapter of one lonely character thinking on a blank background is a FAILURE.
- The protagonist is alone for at most the first 2-3 panels. Bring in OTHER characters early (allies, rivals, the antagonist, a crowd, a stranger) and keep people on-screen together for the rest of the chapter.
- Every "scene" states WHO is present, WHAT they are physically doing, and the SETTING around them — a full moment in a real place, never a face floating in empty space. Populate the world with background life and the named supporting cast.
- Vary the framing panel to panel: wide establishing shots of the setting, two-shots when people talk, action shots, reaction close-ups. Never the same framing twice in a row, and never an unbroken run of protagonist close-ups.
- Fill each "cast" array with EVERYONE actually in that frame, not just the protagonist.
- PICTURE MATCHES THE WORDS: each panel's "scene" must depict THAT panel's dialogue — the speaking character shown mid-line with an expression and gesture that match what they say (angry line → angry face; a confession → vulnerable posture), and the listeners visibly reacting. Whoever speaks in a panel must appear in its "scene" and "cast". The image and the words are the SAME moment.
- READING ORDER is LEFT-TO-RIGHT, top-to-bottom (a Western format — NOT right-to-left manga). Order the "dialogue" array in the exact sequence it should be read; when two characters speak in one panel, list the left-hand speaker's line first.
- DENSITY on action/climax beats: make the "scene" rich and cinematic — multiple figures mid-motion, dynamic foreshortening, speed and impact lines, flying debris, a detailed background. A big moment is a PACKED frame, not a sparse one.
- STYLIZED, BLOODLESS action in the "scene" text: describe combat as dynamic poses, clashing weapons, energy, and impact — NOT graphic injury. Do NOT write blood, gore, wounds, impaling, stabbing through the body, dismemberment, or corpses in the visual description (the image generator hard-rejects graphic content and the panel fails to render). Convey brutality through motion, stance, and expression, not viscera. Dialogue/thoughts can still be dark — this rule is only about the drawn "scene"/"shots".
- SPREADS (multi-scene panels): for 1-3 of the chapter's biggest beats, replace the single "scene" with a "shots" array of 2-4 sub-scenes that together form ONE detailed spread — e.g. a wide establishing shot, a tight close-up on a telling detail (a hand gripping a hilt, narrowed eyes), and a reaction shot. Each entry is a short vivid visual description, ordered left-to-right / top-to-bottom. Give a spread panel a "scene" too (a one-line summary) as a fallback. Use "shots" ONLY for major beats; every other panel keeps a single "scene" and no "shots".

PLOT DEPTH — a chapter is a MINI-ARC, not one stretched scene. Real STORY must happen:
- Hit MULTIPLE distinct beats: a goal pursued → an obstacle → new information or a reveal → a reversal or twist → a choice made under pressure → a cliffhanger. The situation at the END of the chapter must be meaningfully different from the start.
- MOVE THROUGH TIME AND PLACE when it serves the story: use 1-3 scene cuts (set "scene_heading") to cover 2-3 story beats rather than lingering in a single room. Don't cram the whole chapter into one conversation.
- ADVANCE THE OVERALL STORY: reveal something about the world, a faction, or the antagonist's plan; shift a relationship; plant or pay off a subplot thread. Give at least one supporting character a real moment that serves their OWN want.
- LAND A TWIST: one genuine surprise per chapter — a lie exposed, an ally's hidden motive, the stakes turning out bigger than they seemed.
- CHARACTER GROWTH: the protagonist should end the chapter having learned, lost, or decided something that changes them.

CONNECT THE PANELS — even across those beats and cuts, the chapter must FLOW, not read as a slideshow of disconnected images:
- Each panel continues DIRECTLY from the one before it. Begin every scene by anchoring to the previous moment — the same location, the same characters, a beat later in time. Only change location when the story truly cuts away, and make that cut obvious.
- SCENE CUTS: when the story jumps to a new location or time, set "scene_heading" on the FIRST panel of that new scene — a short caption of place + time (e.g. "The Cheonma Sect Courtyard — Dusk", "Three Days Later — The Capital"). Leave "scene_heading" out on panel 1 and on every panel that continues the current scene. A chapter typically has 1-3 such cuts.
- Use camera language to link panels: "cut in close on…", "pull back to reveal…", "over her shoulder…", "the camera holds as…". Consecutive panels should feel like frames of the same shot sequence.
- Keep the setting, time of day, weather, and lighting consistent across a scene so the art connects. Note recurring background elements (the flickering sign, the rain, the shrine) so they persist panel to panel.
- Physical continuity: if a character drew a sword in panel 3, it's still drawn in panel 4. Track positions, injuries, and objects.

THE POV THREAD (the #1 flow device in pro webtoons like The Beginning After the End) — a single continuous first-person INNER VOICE ties the whole sequence together:
- Thread the protagonist's first-person inner voice through the panels as "${useNarrator ? "narration" : "thought"}" beats. It is unbroken — it carries the reader across black gaps, quiet establishing panels, and even time/scene jumps, so nothing feels disconnected.
- Break that voice into SHORT caption beats (4-9 words each), spread across consecutive panels, with rhythm and breathing room — "I never believed…" / "…the light at the end of the tunnel." / "Yet here I am." NOT one dense block.
- The voice is PERSONAL and specific — dry, wry, wounded, whatever fits this character. It reveals who they are through how they react, not through exposition.
- Use it in the OPENING and at transitions to keep momentum — keep it BRIEF. The moment characters are together, spoken dialogue takes over and drives the scene. Do not narrate a whole chapter in inner voice.

REVEAL THE SETTING GRADUALLY in the OPENING, through the character's gaze — don't dump the world in one panel. Show one telling detail, then pull back to another (a throne, then the empty hall, then the city far below). Once the story is in motion, stop lingering — show full scenes with people, action, and conversation.

DIALOGUE — the ENGINE of the chapter, not a garnish. Once characters are together (by panel 3), the majority of panels carry spoken dialogue. Make conversations FLOW naturally:
- Characters must RESPOND to each other. A line answers, deflects, or escalates the line before it — never two disconnected statements.
- Let exchanges cross panels: a question in one panel, the answer (or a loaded silence) in the next. Conversations have rhythm — beats, interruptions, a pause held one panel too long.
- Real speech: contractions, fragments, people talking past each other. Each character has a distinct voice — word choice, cadence, what they refuse to say.
- Keep each "speech" bubble punchy (max 12 words) — but pack MANY of them in. A conversation panel commonly carries 2-4 short lines (a rapid back-and-forth). Density comes from lots of short bubbles, not long ones.
- STORY DENSITY — fill the chapter with real STORY. Reveal the world's history, the stakes, plans, secrets, rules, factions, and character backstory THROUGH the dialogue and thoughts — a talky page of a pro manga conveys a LOT (like a character explaining the plan, another questioning it, a third reacting). Every few panels the reader should learn something new. Don't be sparse or vague; a chapter should feel FULL of information and plot, not a handful of moody lines.
- When a scene has a lot to convey (an explanation, a plan, a reveal, an argument), BREAK IT UP into a SPREAD (use "shots") or several quick panels each carrying dialogue, so a dense beat reads as multiple small frames — that is how a manga fits so much story onto one page.
- "thought" vs "speech" — CRITICAL: if a line is SPOKEN ALOUD to another character, it MUST be type "speech" (it gets a speech bubble with a tail). Use "thought" ONLY for a character's PRIVATE inner voice that the others cannot hear (it gets a thought cloud). In a conversation where characters are talking to each other, nearly every line is "speech". Do not label spoken dialogue as "thought".
${useNarrator
  ? `- "narration" boxes are ENABLED: use them sparingly for a time/place jump or a single stark line of stakes. Never narrate what the art or dialogue already shows.`
  : `- DO NOT use "narration" at all. There is NO narrator. Tell the ENTIRE story through dialogue, thoughts, sound effects, and the visual scene. If you need to convey information, put it in a character's mouth or show it in the scene — never in a narration box.`}
- "sfx" entries add impact (DOOM, KRAK, thud, SHNK) — punchy sound words, used only at real beats, not every panel.
- Build genuine escalation: a want, an obstacle, a cost, a reversal, a gut-punch. Let the protagonist's wound show through behavior.
- Allowed "type" values: ${useNarrator ? `"speech", "thought", "narration", "sfx"` : `"speech", "thought", "sfx"  (NO "narration")`}.

CAST — every panel MUST include a "cast" array: the EXACT names (as defined above) of the characters physically visible in that panel's frame, in order of prominence (lead first). This is what the artist draws, so it must match the scene:
- If the protagonist is alone looking at a city, cast is just the protagonist. If two characters talk, both are in cast. If it's an empty landscape or an object, cast is [] (no people).
- Use the canonical full names exactly as given (protagonist/antagonist/support names) — not "the boy", not pronouns, not nicknames. A character who only speaks off-panel is NOT in cast.
- CRITICAL: "cast" and every dialogue "character" MUST be a name from the roster provided above (protagonist, antagonist, supporting cast). NEVER invent a new character name that is not on that roster, and always spell each name IDENTICALLY every time (character to character, panel to panel). If a scene needs an unnamed background person, describe them in "scene" but leave them out of "cast".
- A thought or narration beat does not put its speaker in frame unless they are actually shown — match cast to what the eye sees, not who talks.`;

export const P_SCRIPT = (s, panelCount = 10, useNarrator = false, demographic) =>
  `You are an elite manga script writer. Write Chapter 1 of "${s.title}" — make it feel like a real published chapter with a genuine story, not a slideshow.
Story: ${s.protagonist?.name} — ${s.protagonist?.personality}. Wound: ${s.protagonist?.wound || "hidden"}. Wants: ${s.protagonist?.goal || "?"}.
Antagonist: ${s.antagonist?.name || "?"} — ${s.antagonist?.motivation || "?"}.
Supporting cast (use these EXACT names in "cast" when they appear): ${(s.support_characters||[]).map(c=>`${c.name} — ${c.role||""}`).join('; ') || "none"}.
World: ${s.setting?.world} — ${s.setting?.description || ""}. Central conflict: ${s.central_conflict || ""}.
Hook: ${s.chapter_one_hook}. Tone: ${s.visual_style_notes || "dramatic and vivid"}.${demoLine(demographic)}
Act 1 direction: ${s.story_arc?.[0]?.beats || "establish the world, expose the wound, ignite the inciting incident"}.
Subplots you may weave in: ${(s.subplots||[]).join(' | ') || "none yet — plant one"}.
Factions in play: ${(s.factions||[]).map(f=>`${f.name} (${f.stance||"?"})`).join('; ') || "none named"}.
PLOT TO DRAMATIZE THIS CHAPTER — turn these beats into on-page EVENTS, roughly in order: ${(s.chapter_one_beats||[]).map((b,i)=>`${i+1}) ${b}`).join('   ') || "open with the hook, escalate through a real event, end on a cliffhanger"}.
${scriptCraft(useNarrator)}
Inside every JSON string use plain text and single quotes only — never a raw double-quote (") or inch/foot mark. Quote any speech-within-speech with single quotes.
Write exactly ${panelCount} panels.
OPENING — COLD OPEN, hook HARD and fast (panels 1-2): drop the reader straight into a charged moment — a dramatic event already in motion, a threat, a shocking image, a mystery, or a line that raises a huge question. NOT a slow scenic warm-up or a character quietly musing. Panel 1 is a striking image with ONE punchy beat (a gut-punch thought or a spoken line) that makes the reader NEED to know what happens next. Put the biggest hook of the chapter's opening right here, and make the stakes clear within the first few panels — do not save them for the end.
BY PANEL 3: the plot is already MOVING — a real event, confrontation, or turn is underway, with another character on-screen. From here the chapter is driven by CONVERSATION and EVENTS between characters — they meet, clash, reveal information, make choices. Show the world and its people, not the protagonist alone. Most panels carry spoken dialogue.
MIDDLE: keep escalating — each beat raises the stakes through what characters DO and SAY: a want, an obstacle, a reveal, a cost, a reversal. Front-load the drama; never let the first third drift.
FINAL panel: a cliffhanger that demands Chapter 2.
Return ONLY valid JSON, no markdown.
Schema: {"chapter_title":"...","chapter_summary":"2-3 sentences","panels":[{"number":1,"panel_type":"full_page","scene":"vivid cinematic description","mood":"dramatic","scene_heading":"OPTIONAL place + time caption, ONLY on the first panel of a new scene","shots":["OPTIONAL 2-4 sub-scene descriptions for a big multi-scene SPREAD panel; omit entirely on normal panels","..."],"cast":["exact character name visible in frame"],"dialogue":[{"character":"name","type":"${useNarrator ? "speech|thought|narration|sfx" : "speech|thought|sfx"}","text":"words"}]}],"chapter_end_hook":"..."}`;

export const P_SCRIPT_BATCH = (s, startPanel, endPanel, totalPanels, prevSummary, useNarrator = false, demographic) =>
  `You are an elite manga script writer continuing Chapter 1 of "${s.title}" (${totalPanels}-panel chapter).
Story: ${s.protagonist?.name} — ${s.protagonist?.personality}. Wound: ${s.protagonist?.wound || "hidden"}.
Antagonist: ${s.antagonist?.name || "?"} — ${s.antagonist?.motivation || "?"}. World: ${s.setting?.world}. Conflict: ${s.central_conflict || ""}. Tone: ${s.visual_style_notes || "dramatic"}.${demoLine(demographic)}
Supporting cast (use these EXACT names in "cast" when they appear): ${(s.support_characters||[]).map(c=>`${c.name} — ${c.role||""}`).join('; ') || "none"}.
Subplots to weave/pay off: ${(s.subplots||[]).join(' | ') || "none"}. Factions in play: ${(s.factions||[]).map(f=>`${f.name} (${f.stance||"?"})`).join('; ') || "none"}.
Chapter plot beats (keep MOVING through them — introduce a new event/reveal/reversal in this batch, don't stall in one scene): ${(s.chapter_one_beats||[]).map((b,i)=>`${i+1}) ${b}`).join('   ') || "escalate toward the cliffhanger"}.
STORY SO FAR: ${prevSummary}
${scriptCraft(useNarrator)}
Number panels EXACTLY ${startPanel} through ${endPanel} — do not restart at 1. Inside every JSON string use plain text and single quotes only — never a raw double-quote (") or inch/foot mark.
Write panels ${startPanel} through ${endPanel} (${endPanel - startPanel + 1} panels). Continue the EXACT conversation and thread above — pick up mid-scene, do not restart. ${endPanel === totalPanels ? "This is the final batch — build to a real cliffhanger." : "Escalate the tension and deepen the conflict."}
Return ONLY a valid JSON array of panel objects, no wrapper, no markdown.
Schema: [{"number":${startPanel},"panel_type":"half_page","scene":"vivid cinematic description","mood":"...","scene_heading":"OPTIONAL place + time caption, ONLY on the first panel of a new scene","shots":["OPTIONAL 2-4 sub-scene descriptions for a big multi-scene SPREAD panel; omit on normal panels","..."],"cast":["exact character name visible in frame"],"dialogue":[{"character":"name","type":"${useNarrator ? "speech|thought|narration|sfx" : "speech|thought|sfx"}","text":"words"}]}]`;

// Write Chapter N (N>1) — CONTINUES the ongoing series from the previous chapter's recap (and, later,
// the story bible). Same schema as P_SCRIPT so the panel pipeline consumes it identically.
export const P_CHAPTER = (s, chapterNumber = 2, panelCount = 10, prevRecap = "", useNarrator = false, demographic, bible = "") =>
  `You are an elite manga script writer. Write Chapter ${chapterNumber} of "${s.title}" — a real published chapter that CONTINUES the ongoing series, never a reset.
Protagonist: ${s.protagonist?.name} — ${s.protagonist?.personality}. Wound: ${s.protagonist?.wound || "hidden"}. Wants: ${s.protagonist?.goal || "?"}.
Antagonist: ${s.antagonist?.name || "?"} — ${s.antagonist?.motivation || "?"}.
Supporting cast (use these EXACT names in "cast" when they appear): ${(s.support_characters||[]).map(c=>`${c.name} — ${c.role||""}`).join('; ') || "none"}.
World: ${s.setting?.world} — ${s.setting?.description || ""}. Central conflict: ${s.central_conflict || ""}. Tone: ${s.visual_style_notes || "dramatic and vivid"}.${demoLine(demographic)}
${bible ? `STORY BIBLE (canon so far — honor it; keep characters, relationships, and open threads consistent):\n${bible}\n` : ""}STORY SO FAR (continue DIRECTLY from here and pay off the previous chapter's cliffhanger):
${prevRecap || "Continue the story from where the last chapter left off."}
${scriptCraft(useNarrator)}
Inside every JSON string use plain text and single quotes only — never a raw double-quote (") or inch/foot mark.
Write exactly ${panelCount} panels for Chapter ${chapterNumber}.
OPENING (panels 1-2): pick up the thread — resolve or escalate the previous cliffhanger FAST. Do NOT re-introduce the world or slowly recap; drop straight into a charged moment.
MIDDLE: advance the series through what characters DO and SAY — a new event, reveal, cost, or reversal. Most panels carry spoken dialogue; keep the cast on-screen.
FINAL panel: a fresh cliffhanger that demands the next chapter.
Return ONLY valid JSON, no markdown.
Schema: {"chapter_title":"...","chapter_summary":"2-3 sentences","panels":[{"number":1,"panel_type":"full_page","scene":"vivid cinematic description","mood":"dramatic","scene_heading":"OPTIONAL place + time caption, ONLY on the first panel of a new scene","shots":["OPTIONAL 2-4 sub-scene descriptions for a big multi-scene SPREAD panel; omit on normal panels","..."],"cast":["exact character name visible in frame"],"dialogue":[{"character":"name","type":"${useNarrator ? "speech|thought|narration|sfx" : "speech|thought|sfx"}","text":"words"}]}],"chapter_end_hook":"..."}`;

// Story Brain: merge a newly written chapter into the story's living bible — update canon, resolve/add
// plot threads and open hooks, extend the timeline, refresh the recap, and propose next-chapter directions.
export const P_BIBLE_UPDATE = (story, prevBible, chapterNumber, chapterDigest) =>
  `You maintain the STORY BIBLE for the ongoing manga "${story?.title}". Merge the new chapter into the existing bible: update/add characters, locations, world rules, and plot threads; mark threads "resolved" when this chapter pays them off; add any new open hooks (unresolved questions or cliffhangers); append ONE timeline entry for this chapter; refresh a short running recap; and propose 2-3 fresh directions the NEXT chapter could take. Carry forward all prior canon that's still true — never drop it. Use ONLY facts established in the story. Respond ONLY with valid JSON, no markdown.

Existing bible (may be empty on Chapter 1):
${JSON.stringify(prevBible || {}, null, 2)}

New — Chapter ${chapterNumber}:
${chapterDigest}

Return this exact JSON:
{
  "characters": [{"name":"","role":"protagonist|antagonist|support","status":"one-line current state","notes":"key traits, relationships, and arc so far"}],
  "locations": [{"name":"","notes":""}],
  "world_rules": ["a concrete rule / system / lore fact"],
  "plot_threads": [{"thread":"","status":"open|resolved","notes":""}],
  "open_hooks": ["an unresolved question or cliffhanger to pay off later"],
  "timeline": ["Ch1: what happened","Ch2: ..."],
  "running_recap": "2-4 sentences on where the story stands right now",
  "next_directions": [{"title":"short label","pitch":"one sentence — a direction the next chapter could take"}]
}`;

// Bonus non-canon "cover request" gag (One Piece SBS style) for the chapter intro / cut-scene extras.
export const P_EASTER_EGG = (s) =>
  `You are the manga's author drawing a fun BONUS cover illustration — a One Piece SBS "cover request" style extra. It is strictly NON-CANON: the story's characters doing something whimsical, silly, cozy, or heartwarming that NEVER happens in the actual plot (a beach day, a baking disaster, a modern coffee-shop AU, karaoke night, sharing one umbrella in the rain, the villain babysitting a kitten…). Keep it light and charming, in-character but out of context.
Story: "${s.title}". Characters: ${s.protagonist?.name || "the hero"}${s.protagonist?.personality ? ` (${s.protagonist.personality})` : ""}${s.antagonist?.name ? `, ${s.antagonist.name}` : ""}${(s.support_characters||[]).map(c=>`, ${c.name}`).join("")}.
Return ONLY raw JSON, no markdown: {"caption":"a playful one-line caption in SBS voice, e.g. 'Loki covertly drawing Ida, who is secretly amused by it'","scene":"a vivid visual description of the whimsical non-canon illustration for the artist: who is doing what, the setting, the light-hearted mood"}
Inside every string use plain text and single quotes only — never a raw double-quote.`;

export const P_CHAR = (s) =>
  `You are a manga character designer. Create a detailed visual design sheet for this character.
Return ONLY a raw JSON object. No markdown. No code fences. Start with { end with }.
CRITICAL: Do NOT use inch marks, foot marks, or quote characters inside string values. Write heights as "tall lean build" not 5'10". Use plain text descriptions only.

Character: ${s.protagonist?.name}
Story: "${s.title}"
Appearance hint: ${s.protagonist?.appearance || "design from scratch"}
Personality: ${s.protagonist?.personality || "determined"}

Return this exact JSON:
{"design_brief":{"body_type":"describe height and build in plain words only","face":"face shape and features","eyes":"eye shape color and expression","hair":"style color and length","default_outfit":"main outfit with colors","battle_outfit":"action variant","signature_accessory":"one item always on them","color_palette":["#hex1 — primary use","#hex2 — secondary","#hex3 — accent"],"expression_range":{"happy":"how happiness shows","angry":"how anger looks","sad":"sorrow expression","determined":"battle ready look"},"consistency_rules":["rule 1 to stay on-model","rule 2","rule 3"],"do_not":["mistake to avoid","another mistake"],"how_they_move":"movement style description"},"visual_arc":"how appearance changes by story end","relationship_dynamic":"how they interact with antagonist visually"}`;

export const AGENT_STEP1 = (seed, genre, tone, style, demographic) => {
  const styleDesc = STYLE_GUIDE[style] || STYLE_GUIDE["JP-EN"];
  return `You are a world-class manga creator. Create a SPECIFIC, vivid, emotionally gripping story concept. Avoid generic tropes — give this story a unique identity.
Return ONLY a raw JSON object. No markdown. No explanation. No code fences. Start with { end with }.

Seed: "${seed}"
Genre: ${genre} | Tone: ${tone} | Style: ${styleDesc}${demoLine(demographic)}
If Genre lists MULTIPLE genres (joined by "+"), FUSE them into one cohesive concept that delivers what fans of EACH genre want — blend their conventions, don't just pick one. Reflect all of them in genre_tags.

{"title":"dramatic memorable title","tagline":"one unforgettable hook — max 12 words that make someone stop scrolling","genre_tags":["tag1","tag2","tag3"],"logline":"Two sentences. Sentence 1: who the protagonist is and what their world is. Sentence 2: what shatters that world and what impossible choice they face."}`;
};

export const AGENT_STEP2 = (step1) =>
  `You are a manga character psychologist. Create deeply human, contradictory, unforgettable characters.
Return ONLY a raw JSON object. No markdown. No code fences. Start with { end with }.

Story: "${step1.title}" — ${step1.logline}

Make characters feel REAL. Give them contradictions, a wound that drives everything, and a voice unlike anyone else.
NAMING: give the cast names from a GLOBAL range that fit this story's world — American, Indian, Korean, Japanese, Chinese, Latin American, African, European, Arabic, etc. Do NOT default every character to one culture unless the setting demands it (a murim/xianxia world is Korean/Chinese; a story set in India uses Indian names; a modern global city has a MIXED cast). Each character's full name should be authentic to their own background, and the cast overall should reflect the setting — varied and grounded, never generic. Every character MUST have a DISTINCT full name — no two characters share a first name or last name, and no near-duplicates or spelling variants (never "Soren Blackthorne" and "Soren Blackthorn" in the same cast). Names must be easy to tell apart.
Also create 3–5 SUPPORTING characters who will share scenes with the protagonist. Give the cast RANGE: include at least one loyal ally, one rival or wildcard whose loyalty is genuinely unclear, and one who is hiding something. Each needs a distinct, concrete look, a want of their OWN (not just serving the hero), and a secret or hidden agenda that can drive future scenes.

{"protagonist":{"name":"full name","epithet":"a short manga-style alias or title, 1-3 words like 'The Hammer' or 'Crimson Fang' — or empty if none fits","age":0,"appearance":"specific visual — hair color and style, eye color, build, clothing, one distinctive scar or mark","personality":"3 traits that CREATE CONFLICT with each other","wound":"the specific past trauma or loss that shapes every decision they make","goal":"what they desperately want RIGHT NOW on the surface","need":"what they actually need to heal and grow — they don't know this yet","voice":"how they speak — are they blunt? poetic? sarcastic? what do they NEVER say?"},"antagonist":{"name":"full name","epithet":"a short manga-style alias or title, 1-3 words, or empty if none fits","role":"their title or position","appearance":"visual description","motivation":"why they genuinely believe they are RIGHT — not just evil for evil's sake","mirror":"the specific way they show the protagonist their worst possible future","relationship":"their exact history with the protagonist — do they know each other?"},"support_characters":[{"name":"full name","epithet":"a short manga-style alias or title, 1-3 words, or empty if none fits","role":"relationship to the protagonist (mentor, rival, best friend, sibling, handler…)","appearance":"specific visual — hair color and style, eye color, build, clothing, one distinctive mark","want":"what THEY are chasing for their own reasons","secret":"something they hide that could complicate the story","hook":"the one thing that makes them memorable"}]}`;

export const AGENT_STEP3 = (step1, step2) =>
  `You are a manga world architect. Build a world so specific and vivid the reader can smell it.
Return ONLY a raw JSON object. No markdown. No code fences. Start with { end with }.

Story: "${step1.title}"
Protagonist: ${step2.protagonist?.name} — wound: ${step2.protagonist?.wound}

One detail must be COMPLETELY ORIGINAL — something no other story has.
Build a world with MOVING PARTS: rival factions with competing goals, and secondary story threads that can run alongside the main conflict — this is what gives later chapters more to pull from.

{"setting":{"world":"world name","description":"Two punchy sensory sentences — what it looks like, what the air feels like, what the constant background sound is","unique_element":"the one thing that makes this world unlike any other — a rule, a phenomenon, a contradiction","rules":"2 specific rules of this world that DIRECTLY create story conflict","atmosphere":"the emotional undertone of the world — is it oppressive? electric? mournful?"},"central_conflict":"The core dramatic question — not just what happens but what is TRULY at stake emotionally","factions":[{"name":"group/power name","goal":"what they want","stance":"how they relate to the protagonist — ally, threat, rival, wildcard"}],"subplots":["a secondary thread with its own mini-question that can weave through chapters","a second secondary thread — a relationship, a mystery, a debt, a rivalry"],"themes":["theme one — stated as a question this story asks","theme two — the contradiction at the story's heart"],"chapter_one_hook":"Exactly what the reader sees and feels in chapter 1 — the image, the action, the gut punch that makes them unable to stop"}`;

export const AGENT_STEP4 = (step1, step2, step3) =>
  `You are a manga story architect. Build a 3-act arc where the protagonist is TRANSFORMED — not just victorious.
Return ONLY a raw JSON object. No markdown. No code fences. Start with { end with }.

Story: "${step1.title}"
Protagonist wants: ${step2.protagonist?.goal} — actually needs: ${step2.protagonist?.need}
World: ${step3.setting?.world} — ${step3.central_conflict}

Each act must escalate EMOTIONAL STAKES, not just plot.
Also break Chapter 1 into CONCRETE PLOT EVENTS — specific things that HAPPEN (a meeting, a discovery, a confrontation, a betrayal, a decision, a cliffhanger reveal), not vibes. This is the spine the chapter script will follow so it has real story, not one stretched scene.

{"story_arc":[{"act":"Act 1 — The Wound Exposed","beats":"Establish the protagonist's ordinary world and what they desperately want. Show their wound through behavior, not backstory. The inciting incident doesn't just disrupt their plan — it forces them to confront the very thing they've been running from."},{"act":"Act 2 — The Walls Close In","beats":"Each attempt to solve the problem reveals a deeper problem. The protagonist gains something (allies, power, understanding) but loses something more important. The midpoint: they seem to win but the victory costs them their old identity. The darkest moment: they hit rock bottom and must choose to stay broken or change."},{"act":"Act 3 — Reborn","beats":"The protagonist faces the final conflict as the person they've BECOME. The antagonist forces a mirror moment — the protagonist sees what they could have been. Resolution addresses the wound, not just the plot. The ending earns its emotion."}],"chapter_one_beats":["opening image + inciting spark","the protagonist meets/clashes with another character","a discovery or reveal that raises the stakes","a complication or reversal that makes it worse","a choice the protagonist makes under pressure","the cliffhanger that ends the chapter"],"visual_style_notes":"Specific art direction for an artist: panel density (tight and claustrophobic or wide and epic?), color temperature, line weight, key visual motifs that recur, any specific manhwa/manga this resembles in feel","comparable_works":["Title — specifically why fans of this would love this story","Title — the specific element they share"]}`;

export const P_MORE_LIKE_THIS = (story) =>
  `You are a manga story recommender. Generate 3 similar story concepts based on this story.
Return ONLY a raw JSON object starting with { and ending with }.
Story: "${story.title}" — ${story.logline}
Genre: ${(story.genre_tags||[]).join(', ')}
{"recommendations":[{"seed":"one sentence story idea","why":"why fans of this story would like it","genre":"genre","emoji":"one emoji"},{"seed":"","why":"","genre":"","emoji":""},{"seed":"","why":"","genre":"","emoji":""}]}`;

// Genre DNA — the conventions readers of each genre actually want. A great seed gives a
// FRESH SPIN on these core beats, not a story that avoids them.
const GENRE_CONVENTIONS = {
  "murim martial arts": "the murim (jianghu) world of rival sects, martial clans, qi/internal energy, secret manuals, blood feuds, and a power hierarchy from outer disciple to grandmaster. Fresh spin: an unexpected protagonist (crippled, lowest-ranked, an outsider, a returner) who upends the hierarchy.",
  "isekai portal": "an ordinary person summoned or transported to a fantasy/game world — the summoning, the appraisal of their 'useless' or hidden power, guilds, demon kings, and status windows. Fresh spin: subvert the hero's welcome — betrayed, ranked useless, or arriving on the wrong side.",
  "reincarnation": "a character reborn — as a baby with past-life memory, a villainess in a novel they read, a monster, or an inanimate object (a sword, a slime, a vending machine). Fresh spin: an ironic or constraining new form, and knowing how the story is 'supposed' to go.",
  "cultivation xianxia": "immortal cultivators climbing realms of power, sects, pill refining, heavenly tribulations, and face/honor duels. Fresh spin: a cynical or modern mind in a cultivation world, or a broken talent forging an unorthodox path.",
  "dungeon system": "a modern world where dungeons, gates, hunters, and RPG 'systems' with levels and stats appear. Fresh spin: the only one who sees the true system, a solo leveler, or a regressor who knows what's coming.",
  "regression": "a character who dies at the peak (or the end) and returns to their weakest, earliest point — carrying full memory of the future. Fresh spin: what they choose to change first, and who they save or destroy.",
  "horror": "mounting dread and the wrongness of the everyday — cursed objects, isolation, body horror, cosmic/unknowable threats, survival with dwindling safety, and a truth worse than the monster. Fresh spin: an unexpected victim or a twist on WHO the real monster is. Build fear through what's implied, not gore for its own sake.",
  "ecchi romcom": "a comedic romance built on flustered tension, awkward misunderstandings, and playful fanservice — accidental encounters, forced-proximity setups (fake dating, contract, one-roof living), teasing rivals, and a blushing will-they-won't-they. Keep it SUGGESTIVE and comedic, never explicit — the heart is the romance and the laughs. Fresh spin: a genuine emotional wound under the comedy that makes the romance land.",
};

export const P_TRENDING_SEEDS = (genre, style) => {
  const key = String(genre||"").toLowerCase();
  const convention = GENRE_CONVENTIONS[key];
  return `You are a manga/manhwa trend analyst. Generate 6 unique, immediately gripping story seed ideas for ${genre} in ${style} style. Each call must produce totally DIFFERENT ideas — vary the protagonist, the world, the conflict, and the twist.
${convention
  ? `This is a ${genre} story. Lean INTO the genre — readers want these conventions: ${convention} Every seed must clearly belong to this genre, each with a distinct fresh hook. Do not drift into unrelated genres.`
  : `Give each seed a specific, original hook. Avoid tired clichés.`}
Return ONLY a raw JSON object starting with { and ending with }.
{"seeds":[{"seed":"compelling one-sentence story idea","emoji":"one emoji","vibe":"2 word mood"},{"seed":"","emoji":"","vibe":""},{"seed":"","emoji":"","vibe":""},{"seed":"","emoji":"","vibe":""},{"seed":"","emoji":"","vibe":""},{"seed":"","emoji":"","vibe":""}]}`;
};

export const P_WIZARD_BUILD = (answers) =>
  `You are a manga story architect. Build a compelling story seed from these answers.
Return ONLY a raw JSON object starting with { and ending with }.
Hero: ${answers.hero}
Want: ${answers.want}
Obstacle: ${answers.obstacle}
World: ${answers.world}
Twist: ${answers.twist || "none"}
{"seed":"one punchy sentence combining all elements","enhanced":"expanded 2-sentence version with more detail","hooks":["alternative angle 1","alternative angle 2"]}`;

export const P_PERSONAL_SEEDS = (history) =>
  `You are a manga story recommender. Based on this creator's history, suggest 4 personalized story seeds.
Return ONLY a raw JSON object starting with { and ending with }.
Creator history: ${history}
{"seeds":[{"seed":"personalized story idea","reason":"why this fits their taste","emoji":""},{"seed":"","reason":"","emoji":""},{"seed":"","reason":"","emoji":""},{"seed":"","reason":"","emoji":""}]}`;

export const P_VOICES = (story) =>
  `Create distinct voice profiles for every character in this manga story so they sound completely different from each other. Respond ONLY with valid JSON.

Story: "${story.title}"
Protagonist: ${story.protagonist?.name} — ${story.protagonist?.personality}
Antagonist: ${story.antagonist?.name} — ${story.antagonist?.motivation}
Genre: ${(story.genre_tags||[]).join(', ')}

Return this exact JSON:
{
  "voices": [
    {
      "character": "name",
      "role": "protagonist|antagonist|support|narrator",
      "personality_core": "2-3 words that define them",
      "speech_style": "How they talk — formal/casual/aggressive/poetic/etc",
      "vocabulary": "Simple/complex/street slang/archaic/technical",
      "speech_patterns": "Specific habits — short sentences, rhetorical questions, never uses contractions, etc",
      "emotional_range": "How they express anger, joy, fear differently from others",
      "catchphrase": "A signature phrase or word they use often",
      "never_says": "Words or phrases totally out of character for them",
      "example_lines": ["Sample line 1", "Sample line 2", "Sample line 3"]
    }
  ]
}`;

export const P_TRANSLATE = (script, targetLang, voices, story) => {
  const voiceGuide = voices?.voices?.map(v =>
    `${v.character}: ${v.speech_style}. Patterns: ${v.speech_patterns}. Catchphrase: ${v.catchphrase}`
  ).join('\n') || '';
  return `Translate this manga script to ${targetLang}. Respond ONLY with valid JSON.

CRITICAL: Translate EVERY dialogue line into ${targetLang} — including quoted text, flashbacks, whispers, and short exclamations. Nothing stays in the source language except sound effects.
CRITICAL: Return the EXACT same number of dialogue entries per panel, in the SAME order as the input — never omit, merge, split, or reorder a line. Every entry MUST have a non-empty "translated" field written in ${targetLang}.
Each character must sound completely different. Use the voice guide below.
Preserve sound effects (SFX type only) as-is or adapt culturally; translate everything else.
Make dialogue feel natural in ${targetLang} — not word-for-word.

Story: "${story.title}" — ${story.logline}

Voice guide:
${voiceGuide}

Script to translate:
${JSON.stringify(script?.panels || [], null, 2)}

Return this exact JSON:
{
  "language": "${targetLang}",
  "chapter_title": "translated title",
  "panels": [
    {
      "number": 1,
      "dialogue": [{"character": "name", "type": "speech|thought|narration|sfx", "original": "original text", "translated": "translated text", "voice_note": "how this sounds in character"}]
    }
  ]
}`;
};

export const P_PARSE_UPLOAD = (text, type) =>
  `You are reading an uploaded ${type} from a manga/manhwa creator. Extract structured data and return ONLY valid JSON.

Content:
${text.slice(0, 3000)}

Return this exact JSON:
{
  "title": "series title or best guess",
  "author": "author name if found",
  "logline": "1-2 sentence story summary",
  "genre_tags": ["genre1", "genre2"],
  "chapter_number": 1,
  "chapter_title": "chapter title if found",
  "characters": [{"name": "character name", "role": "protagonist|antagonist|support", "description": "brief description"}],
  "panels": [{"number": 1, "scene": "what happens visually", "dialogue": [{"character": "name", "type": "speech|thought|narration|sfx", "text": "dialogue text"}]}],
  "content_warning": "none|mild|moderate|mature",
  "upload_notes": "anything the platform should know about this upload"
}`;

// ── Admin Brain prompts ──────────────────────────────────────────────────────
// Ops Synthesizer: turn a live platform snapshot into a few short Obsidian-style notes. Bodies are
// markdown and may cross-link other notes with [[Title]]. Keep it factual — only use the snapshot.
export const P_BRAIN_OPS = (snapshot) =>
  `You are the ops analyst for a manga-publishing platform. Below is a live snapshot of platform state.
Write a small set of concise admin notes summarizing it. Respond ONLY with valid JSON.

Rules:
- Use ONLY facts from the snapshot — never invent numbers or titles.
- Each note body is markdown. Cross-link the other ops notes and any doc notes with [[Title]] when relevant (e.g. [[Health & Broken]], [[Known Scale Cliffs]]).
- Be terse and scannable: short sentences, bullet lists. Surface what needs attention first.

Snapshot:
${JSON.stringify(snapshot, null, 2)}

Return this exact JSON:
{
  "notes": [
    {"title": "Platform Pulse", "body": "markdown — totals, newest, genre mix, top authors"},
    {"title": "Health & Broken", "body": "markdown — stories with missing panel art or other issues, by title"},
    {"title": "Moderation Watch", "body": "markdown — anything to review: mature content_warning, spikes, odd authors; say 'nothing flagged' if clean"},
    {"title": "Translation Coverage", "body": "markdown — how many stories are pre-translated and into how many languages"}
  ]
}`;

// Ask-the-Brain: answer a question using ONLY the supplied notes, and report which titles were used.
export const P_BRAIN_ASK = (question, notes) =>
  `You are the founder's assistant answering questions about their manga platform, using ONLY the notes below.
Respond ONLY with valid JSON.

Rules:
- Answer from the notes only. If the notes don't cover it, say so plainly in "answer" and leave "used" empty.
- "answer" is markdown; you may reference notes inline with [[Title]].
- "used" lists the exact titles of the notes you actually relied on.

Question: ${question}

Notes:
${notes.map(n => `### ${n.title} (${n.kind})\n${n.body}`).join("\n\n---\n\n")}

Return this exact JSON:
{"answer": "markdown answer", "used": ["Note Title", "Another Title"]}`;



