import { STYLE_GUIDE } from "../constants.js";

export const CLAUDE_SYSTEM = `You are a world-class manga/manhwa story creator with deep expertise in storytelling, character psychology, and visual narrative. You write stories that feel REAL — specific details, unique worlds, characters with contradictions and wounds.

ABSOLUTE RULES:
- Respond with RAW valid JSON only. No markdown. No backticks. No code fences. No explanations.
- Start with { and end with }
- Every field must contain REAL specific creative content — never placeholder text
- Character names must be actual names (like "Kira Mahn" or "Seok Jin-ho"), never "Protagonist" or "Hero"
- Dialogue must be 8 words or fewer — real punchy human speech
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

export async function askClaude(prompt, onChunk, retries=2) {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const tokenLimit = 8000;

      const url = "/api/claude";
      const headers = {"Content-Type":"application/json"};

      const res = await fetch(url, {
        method:"POST", headers,
        body:JSON.stringify({ model:"claude-haiku-4-5-20251001", max_tokens:tokenLimit, system:CLAUDE_SYSTEM, messages:[{role:"user",content:prompt}], stream:false }),
      });
      if (!res.ok) {
        const err = await res.text();
        console.error(`Claude API error (attempt ${attempt+1}):`, err.slice(0,200));
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

// ── ElevenLabs HD voices — served via the secure /api/eleven proxy ──────────────
export const HAS_ELEVEN = true;

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

// Generate speech via the secure /api/eleven proxy. Returns an object URL for an MP3, or null on failure.
export async function generateElevenAudio(text, voiceId) {
  if (!text || !voiceId) return null;
  try {
    const res = await fetch("/api/eleven", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, voiceId }),
    });
    if (!res.ok) { console.error("ElevenLabs error:", res.status, (await res.text().catch(()=>'')).slice(0,200)); return null; }
    const blob = await res.blob();
    return URL.createObjectURL(blob);
  } catch (e) { console.warn("ElevenLabs request failed:", e.message); return null; }
}

export async function generatePanelImage(panelDescription, characterContext, style) {
  const STYLE_PROMPTS = {
    'JP-EN': 'professional Japanese manga panel, crisp black-and-white ink, detailed screen tones, dramatic speed lines, expressive anime faces, high contrast shadows',
    'KR-EN': 'premium Korean manhwa webtoon panel, lush full color, soft cel shading, cinematic rim lighting, beautiful detailed characters, vertical-scroll composition',
    'CN-EN': 'high-end Chinese manhua panel, vibrant saturated colors, intricate flowing costumes, dynamic wuxia poses, painterly detail',
    'US-EN': 'polished western comic book panel, bold confident inks, rich flat colors, dramatic foreshortening, cinematic angles',
    'GL-EN': 'professional manga illustration, detailed clean linework, dynamic composition, expressive anime style, dramatic lighting',
    'PRISMA': 'Prisma house style: premium full-color fusion art — manhwa cel-shaded polish, expressive anime manga faces with speed lines, bold cinematic comic composition, vivid saturated palette, dramatic volumetric lighting, vertical webtoon framing, ultra detailed',
  };
  const styleModifier = STYLE_PROMPTS[style] || STYLE_PROMPTS['JP-EN'];
  // Panel proportions match each format's real canvas: webtoon/manhwa is tall portrait,
  // comics are wide landscape, manga panels are squarish (page cells).
  // Together AI caps each dimension at 1024; keep every value in [64,1024] and a multiple of 64.
  const STYLE_DIMS = {
    'JP-EN': { w: 1024, h: 1024 }, // manga — square-ish page panel
    'KR-EN': { w: 704,  h: 1024 }, // manhwa webtoon — tall portrait
    'CN-EN': { w: 768,  h: 1024 }, // manhua — portrait
    'US-EN': { w: 1024, h: 704  }, // western comics — wide landscape
    'GL-EN': { w: 1024, h: 1024 },
    'PRISMA': { w: 704, h: 1024 }, // Prisma house format — tall vertical-scroll webtoon frames
  };
  const dims = STYLE_DIMS[style] || STYLE_DIMS['GL-EN'];
  const desc = panelDescription.slice(0, 450);
  const chars = characterContext.slice(0, 350);
  const QUALITY = 'masterpiece, highly detailed, sharp focus, professional illustration, dramatic composition, volumetric lighting, intricate detail';
  const prompt = `${styleModifier}. Scene: ${desc}. Characters: ${chars}. ${QUALITY}. No text, no speech bubbles, no watermark, no captions.`;
  const NEGATIVE = 'text, words, letters, speech bubbles, watermark, signature, blurry, low quality, deformed, disfigured, bad anatomy, extra limbs, extra fingers, mutated hands, poorly drawn face, distorted, ugly, jpeg artifacts, cropped, out of frame';

  const clampDim = (n) => Math.max(64, Math.min(1024, Math.round(n / 64) * 64));

  // ── PRIMARY: Fal.ai via the secure /api/fal proxy. Falls through to Together on failure. ──
  for (let i = 0; i < 2; i++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 30000);
    try {
      const res = await fetch('/api/fal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, width: clampDim(dims.w), height: clampDim(dims.h) }),
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      if (res.ok) {
        const data = await res.json();
        if (data.url) return data.url;
      } else {
        console.warn(`Fal.ai ${res.status}:`, (await res.text().catch(() => '')).slice(0, 150));
        if (res.status === 401 || res.status === 500) break; // key bad/missing — skip to Together
      }
    } catch (e) { clearTimeout(timer); console.warn(`Fal.ai attempt ${i+1} failed:`, e.message); }
    await new Promise(r => setTimeout(r, 1200));
  }
  // fall through to Together below

  // Together (image gen) is reached only through the secure /api/image proxy (it picks the model server-side).
  // Fallback: SDXL (reliably available, takes a negative prompt); FLUX after it.
  const MODELS = [
    { id: 'stabilityai/stable-diffusion-xl-base-1.0', steps: 24, neg: true },
    { id: 'black-forest-labs/FLUX.1-schnell',          steps: 4,  neg: false },
  ];

  const MAX_ATTEMPTS = 5;
  const TIMEOUT_MS = 30000; // abort a hung request instead of waiting forever (image service can stall)
  let modelIdx = 0;
  let timeouts = 0;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch('/api/image', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt, style }), signal: ctrl.signal });
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
        // Rate limited — honor the reset header, add jitter, stay on the same model
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
      // Other client error (400/401/etc) — not retryable
      console.error(`Image API ${res.status} body:`, errBody.slice(0, 300));
      return null;
    } catch(e) {
      clearTimeout(timer);
      const timedOut = e.name === "AbortError";
      console.warn(`Image generation attempt ${attempt+1} ${timedOut ? "timed out" : "failed"}:`, e.message);
      if (timedOut) {
        // The service is hanging. Try the fallback model once; if it also hangs, give up fast
        // so the UI can surface "service unavailable" instead of stalling for minutes.
        timeouts++;
        modelIdx++;
        if (timeouts >= 2) return null;
      }
      await new Promise(r => setTimeout(r, 2000));
    }
  }
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

CONNECT THE PANELS — the chapter must read as ONE continuous flowing scene, not a slideshow of disconnected images:
- Each panel continues DIRECTLY from the one before it. Begin every scene by anchoring to the previous moment — the same location, the same characters, a beat later in time. Only change location when the story truly cuts away, and make that cut obvious.
- Use camera language to link panels: "cut in close on…", "pull back to reveal…", "over her shoulder…", "the camera holds as…". Consecutive panels should feel like frames of the same shot sequence.
- Keep the setting, time of day, weather, and lighting consistent across a scene so the art connects. Note recurring background elements (the flickering sign, the rain, the shrine) so they persist panel to panel.
- Physical continuity: if a character drew a sword in panel 3, it's still drawn in panel 4. Track positions, injuries, and objects.

THE POV THREAD (the #1 flow device in pro webtoons like The Beginning After the End) — a single continuous first-person INNER VOICE ties the whole sequence together:
- Thread the protagonist's first-person inner voice through the panels as "${useNarrator ? "narration" : "thought"}" beats. It is unbroken — it carries the reader across black gaps, quiet establishing panels, and even time/scene jumps, so nothing feels disconnected.
- Break that voice into SHORT caption beats (4-9 words each), spread across consecutive panels, with rhythm and breathing room — "I never believed…" / "…the light at the end of the tunnel." / "Yet here I am." NOT one dense block.
- The voice is PERSONAL and specific — dry, wry, wounded, whatever fits this character. It reveals who they are through how they react, not through exposition.
- Use it especially in the OPENING and at every transition to keep momentum; hand off to spoken dialogue once characters are together in a scene.

REVEAL THE SETTING GRADUALLY, through the character's gaze — don't dump the world in one panel. Show one telling detail, then pull back to another, synced to the inner voice (a throne, then the empty hall, then the city far below). The reader assembles the place piece by piece.

DIALOGUE — the heart of scenes where characters are together. Make conversations FLOW naturally:
- Characters must RESPOND to each other. A line answers, deflects, or escalates the line before it — never two disconnected statements.
- Let exchanges cross panels: a question in one panel, the answer (or a loaded silence) in the next. Conversations have rhythm — beats, interruptions, a pause held one panel too long.
- Real speech: contractions, fragments, people talking past each other. Each character has a distinct voice — word choice, cadence, what they refuse to say.
- Keep each "speech" bubble punchy (max 12 words). Two short bubbles beat one long one. A panel can hold a quick back-and-forth (2-3 lines) when the moment is fast.
- "thought" reveals what a character hides from the others — use it for subtext, not narration.
${useNarrator
  ? `- "narration" boxes are ENABLED: use them sparingly for a time/place jump or a single stark line of stakes. Never narrate what the art or dialogue already shows.`
  : `- DO NOT use "narration" at all. There is NO narrator. Tell the ENTIRE story through dialogue, thoughts, sound effects, and the visual scene. If you need to convey information, put it in a character's mouth or show it in the scene — never in a narration box.`}
- "sfx" entries add impact (DOOM, KRAK, thud, SHNK) — punchy sound words, used only at real beats, not every panel.
- Build genuine escalation: a want, an obstacle, a cost, a reversal, a gut-punch. Let the protagonist's wound show through behavior.
- Allowed "type" values: ${useNarrator ? `"speech", "thought", "narration", "sfx"` : `"speech", "thought", "sfx"  (NO "narration")`}.`;

export const P_SCRIPT = (s, panelCount = 10, useNarrator = false, demographic) =>
  `You are an elite manga script writer. Write Chapter 1 of "${s.title}" — make it feel like a real published chapter with a genuine story, not a slideshow.
Story: ${s.protagonist?.name} — ${s.protagonist?.personality}. Wound: ${s.protagonist?.wound || "hidden"}. Wants: ${s.protagonist?.goal || "?"}.
Antagonist: ${s.antagonist?.name || "?"} — ${s.antagonist?.motivation || "?"}.
World: ${s.setting?.world} — ${s.setting?.description || ""}. Central conflict: ${s.central_conflict || ""}.
Hook: ${s.chapter_one_hook}. Tone: ${s.visual_style_notes || "dramatic and vivid"}.${demoLine(demographic)}
${scriptCraft(useNarrator)}
Write exactly ${panelCount} panels.
OPENING (panels 1-3): open the way a pro webtoon does — an atmospheric establishing image carried by the protagonist's first-person inner voice in SHORT ${useNarrator ? "narration" : "thought"} beats that flow one into the next, revealing the setting gradually and hooking the reader before any spoken dialogue. Panel 1 has no speech — image + one short inner-voice beat.
MIDDLE: characters meet and the conversation drives the scene; escalate the stakes.
FINAL panel: a cliffhanger that demands Chapter 2.
Return ONLY valid JSON, no markdown.
Schema: {"chapter_title":"...","chapter_summary":"2-3 sentences","panels":[{"number":1,"panel_type":"full_page","scene":"vivid cinematic description","mood":"dramatic","dialogue":[{"character":"name","type":"${useNarrator ? "speech|thought|narration|sfx" : "speech|thought|sfx"}","text":"words"}]}],"chapter_end_hook":"..."}`;

export const P_SCRIPT_BATCH = (s, startPanel, endPanel, totalPanels, prevSummary, useNarrator = false, demographic) =>
  `You are an elite manga script writer continuing Chapter 1 of "${s.title}" (${totalPanels}-panel chapter).
Story: ${s.protagonist?.name} — ${s.protagonist?.personality}. Wound: ${s.protagonist?.wound || "hidden"}.
Antagonist: ${s.antagonist?.name || "?"} — ${s.antagonist?.motivation || "?"}. World: ${s.setting?.world}. Conflict: ${s.central_conflict || ""}. Tone: ${s.visual_style_notes || "dramatic"}.${demoLine(demographic)}
STORY SO FAR: ${prevSummary}
${scriptCraft(useNarrator)}
Write panels ${startPanel} through ${endPanel} (${endPanel - startPanel + 1} panels). Continue the EXACT conversation and thread above — pick up mid-scene, do not restart. ${endPanel === totalPanels ? "This is the final batch — build to a real cliffhanger." : "Escalate the tension and deepen the conflict."}
Return ONLY a valid JSON array of panel objects, no wrapper, no markdown.
Schema: [{"number":${startPanel},"panel_type":"half_page","scene":"vivid cinematic description","mood":"...","dialogue":[{"character":"name","type":"${useNarrator ? "speech|thought|narration|sfx" : "speech|thought|sfx"}","text":"words"}]}]`;

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

{"title":"dramatic memorable title","tagline":"one unforgettable hook — max 12 words that make someone stop scrolling","genre_tags":["tag1","tag2","tag3"],"logline":"Two sentences. Sentence 1: who the protagonist is and what their world is. Sentence 2: what shatters that world and what impossible choice they face."}`;
};

export const AGENT_STEP2 = (step1) =>
  `You are a manga character psychologist. Create deeply human, contradictory, unforgettable characters.
Return ONLY a raw JSON object. No markdown. No code fences. Start with { end with }.

Story: "${step1.title}" — ${step1.logline}

Make characters feel REAL. Give them contradictions, a wound that drives everything, and a voice unlike anyone else.

{"protagonist":{"name":"full name","age":0,"appearance":"specific visual — hair color and style, eye color, build, clothing, one distinctive scar or mark","personality":"3 traits that CREATE CONFLICT with each other","wound":"the specific past trauma or loss that shapes every decision they make","goal":"what they desperately want RIGHT NOW on the surface","need":"what they actually need to heal and grow — they don't know this yet","voice":"how they speak — are they blunt? poetic? sarcastic? what do they NEVER say?"},"antagonist":{"name":"full name","role":"their title or position","appearance":"visual description","motivation":"why they genuinely believe they are RIGHT — not just evil for evil's sake","mirror":"the specific way they show the protagonist their worst possible future","relationship":"their exact history with the protagonist — do they know each other?"}}`;

export const AGENT_STEP3 = (step1, step2) =>
  `You are a manga world architect. Build a world so specific and vivid the reader can smell it.
Return ONLY a raw JSON object. No markdown. No code fences. Start with { end with }.

Story: "${step1.title}"
Protagonist: ${step2.protagonist?.name} — wound: ${step2.protagonist?.wound}

One detail must be COMPLETELY ORIGINAL — something no other story has.

{"setting":{"world":"world name","description":"Two punchy sensory sentences — what it looks like, what the air feels like, what the constant background sound is","unique_element":"the one thing that makes this world unlike any other — a rule, a phenomenon, a contradiction","rules":"2 specific rules of this world that DIRECTLY create story conflict","atmosphere":"the emotional undertone of the world — is it oppressive? electric? mournful?"},"central_conflict":"The core dramatic question — not just what happens but what is TRULY at stake emotionally","themes":["theme one — stated as a question this story asks","theme two — the contradiction at the story's heart"],"chapter_one_hook":"Exactly what the reader sees and feels in chapter 1 — the image, the action, the gut punch that makes them unable to stop"}`;

export const AGENT_STEP4 = (step1, step2, step3) =>
  `You are a manga story architect. Build a 3-act arc where the protagonist is TRANSFORMED — not just victorious.
Return ONLY a raw JSON object. No markdown. No code fences. Start with { end with }.

Story: "${step1.title}"
Protagonist wants: ${step2.protagonist?.goal} — actually needs: ${step2.protagonist?.need}
World: ${step3.setting?.world} — ${step3.central_conflict}

Each act must escalate EMOTIONAL STAKES, not just plot.

{"story_arc":[{"act":"Act 1 — The Wound Exposed","beats":"Establish the protagonist's ordinary world and what they desperately want. Show their wound through behavior, not backstory. The inciting incident doesn't just disrupt their plan — it forces them to confront the very thing they've been running from."},{"act":"Act 2 — The Walls Close In","beats":"Each attempt to solve the problem reveals a deeper problem. The protagonist gains something (allies, power, understanding) but loses something more important. The midpoint: they seem to win but the victory costs them their old identity. The darkest moment: they hit rock bottom and must choose to stay broken or change."},{"act":"Act 3 — Reborn","beats":"The protagonist faces the final conflict as the person they've BECOME. The antagonist forces a mirror moment — the protagonist sees what they could have been. Resolution addresses the wound, not just the plot. The ending earns its emotion."}],"visual_style_notes":"Specific art direction for an artist: panel density (tight and claustrophobic or wide and epic?), color temperature, line weight, key visual motifs that recur, any specific manhwa/manga this resembles in feel","comparable_works":["Title — specifically why fans of this would love this story","Title — the specific element they share"]}`;

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

CRITICAL: Each character must sound completely different. Use the voice guide below.
Preserve sound effects (SFX) as-is or adapt culturally.
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



