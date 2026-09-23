import { guard, corsHeaders } from "./_guard.js";

// DeepInfra FLUX-schnell proxy — the cheap fallback under the Together primary. ~$0.0005/MP·step
// (well under a cent per panel) and, unlike Fal, no aggressive INPUT content-filter, so combat/dark
// prompts render instead of 422-ing. The browser never holds the DeepInfra key.
// Best-effort: if DEEPINFRA_API_KEY isn't set, this returns a clean 500 and the caller falls through.
export default async function handler(req, res) {
  const cors = corsHeaders(req);
  for (const [k, v] of Object.entries(cors)) res.setHeader(k, v);

  if (req.method === 'OPTIONS') { return res.status(200).end(); }
  if (req.method !== 'POST') { return res.status(405).json({ error: 'Method not allowed' }); }

  const apiKey = process.env.DEEPINFRA_API_KEY;
  if (!apiKey) { return res.status(500).json({ error: 'DEEPINFRA_API_KEY not configured' }); }

  // Auth + atomic credit charge (skipped while the launch gate is off). Retries pass x-mv-action:free.
  const g = await guard(req, req.headers['x-mv-action'] || 'panel', 'deepinfra');
  if (!g.ok) { return res.status(g.status).json({ error: g.error, code: g.code }); }
  if (g.balance != null) res.setHeader('x-mv-balance', String(g.balance));

  const { prompt, style } = req.body || {};
  if (!prompt) { return res.status(400).json({ error: 'No prompt provided' }); }

  const STYLE_PROMPTS = {
    'JP-EN': 'manga illustration, ink linework, screen tones, anime style',
    'KR-EN': 'manhwa illustration, full color, cel shading, webtoon style',
    'CN-EN': 'manhua illustration, vibrant colors, detailed costumes',
    'US-EN': 'comic book illustration, bold outlines, dynamic composition',
    'GL-EN': 'manga illustration, detailed linework, anime style',
  };
  const styleModifier = STYLE_PROMPTS[style] || STYLE_PROMPTS['JP-EN'];

  // Same light cleanup the Together proxy uses. 300 chars was cutting the incoming prompt down to
  // just its opening style preamble before it ever reached the actual scene/character description
  // (see claude.js's generatePanelImage ordering note) — every panel rendered as a generic face
  // close-up as a result. 900 chars comfortably covers scene+characters.
  const cleanPrompt = (prompt || '')
    .replace(/blood(y|ied)?/gi, 'dramatic')
    .replace(/gore|gory/gi, 'intense')
    .replace(/corpse|dead\s+body/gi, 'fallen warrior')
    .replace(/murder|kill(ing|ed)?/gi, 'battle')
    .replace(/nude|naked/gi, 'clothed')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 900);
  const fullPrompt = `${cleanPrompt}, ${styleModifier}, high quality, no text`;

  const TIMEOUT_MS = 30000;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const response = await fetch('https://api.deepinfra.com/v1/inference/black-forest-labs/FLUX-1-schnell', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: fullPrompt, width: 512, height: 768, num_inference_steps: 4 }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);

    if (!response.ok) {
      const errBody = await response.text().catch(() => '');
      return res.status(response.status).json({ error: `DeepInfra ${response.status}`, detail: errBody.slice(0, 200) });
    }

    const data = await response.json();
    // DeepInfra's FLUX-schnell returns `images` (array of data:image/... URIs). Be defensive about shape:
    // also accept image_url / OpenAI-style data[].b64_json|url.
    const first = data.images?.[0] || data.image_url || data.data?.[0]?.url || null;
    const b64 = data.data?.[0]?.b64_json || null;

    if (b64) return res.status(200).json({ b64 });
    if (first && typeof first === 'string') {
      if (first.startsWith('data:')) return res.status(200).json({ url: first });   // data URI — usable directly as <img src>
      // Remote URL — fetch to bytes so the client gets a stable data payload (matches the Together proxy).
      try {
        const imgRes = await fetch(first);
        if (imgRes.ok) {
          const buffer = await imgRes.arrayBuffer();
          return res.status(200).json({ b64: Buffer.from(buffer).toString('base64') });
        }
      } catch {}
      return res.status(200).json({ url: first });
    }
    // Nothing usable — let the caller show a placeholder silently.
    return res.status(200).json({ filtered: true, url: null });
  } catch (e) {
    clearTimeout(timer);
    return res.status(502).json({ error: e.name === 'AbortError' ? 'DeepInfra timeout' : ('DeepInfra error: ' + e.message) });
  }
}

export const config = { api: { bodyParser: true } };
