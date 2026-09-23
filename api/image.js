import { guard, corsHeaders, getToken } from "./_guard.js";
import { RELEASE_MODE } from "./_pricing.js";
import { planAllows } from "./_supa.js";

export default async function handler(req, res) {
  const cors = corsHeaders(req);
  for (const [k, v] of Object.entries(cors)) res.setHeader(k, v);

  if (req.method === 'OPTIONS') { return res.status(200).end(); }
  if (req.method !== 'POST') { return res.status(405).json({ error: 'Method not allowed' }); }

  const apiKey = process.env.TOGETHER_API_KEY;
  if (!apiKey) { return res.status(500).json({ error: 'TOGETHER_API_KEY not configured' }); }

  // Auth + atomic credit charge (skipped while the launch gate is off).
  const g = await guard(req, req.headers['x-mv-action'] || 'panel', 'together');
  if (!g.ok) { return res.status(g.status).json({ error: g.error, code: g.code }); }
  if (g.balance != null) res.setHeader('x-mv-balance', String(g.balance));

  const { prompt, style } = req.body;
  if (!prompt) { return res.status(400).json({ error: 'No prompt provided' }); }

  const STYLE_PROMPTS = {
    'JP-EN': 'manga illustration, ink linework, screen tones, anime style',
    'KR-EN': 'manhwa illustration, full color, cel shading, webtoon style',
    'CN-EN': 'manhua illustration, vibrant colors, detailed costumes',
    'US-EN': 'comic book illustration, bold outlines, dynamic composition',
    'GL-EN': 'manga illustration, detailed linework, anime style',
  };

  const styleModifier = STYLE_PROMPTS[style] || STYLE_PROMPTS['JP-EN'];

  // Keep prompt clean — 200 chars was cutting the incoming prompt down to just its opening style
  // preamble, before it ever reached the actual scene/character description (see claude.js's
  // generatePanelImage ordering note). 900 chars comfortably covers scene+characters and is still
  // well under limits that trigger Together 400s.
  const cleanPrompt = (prompt || '')
    .replace(/blood(y|ied)?/gi, 'dramatic')
    .replace(/gore|gory/gi, 'intense')
    .replace(/corpse|dead\s+body/gi, 'fallen warrior')
    .replace(/murder|kill(ing|ed)?/gi, 'battle')
    .replace(/nude|naked/gi, 'clothed')
    .replace(/demon(?!ic)/gi, 'warrior')
    .replace(/hell(?!o)/gi, 'dark realm')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 900);

  const fullPrompt = `${cleanPrompt}, ${styleModifier}, high quality, no text`;

  // Premium art tier: Studio Pro (plan feature `premiumArt`) renders on Juggernaut PRO Flux — the pro-grade
  // Flux variant — instead of the fast Lightning model everyone else gets. Only checked at launch
  // (RELEASE_MODE); in demo there are no plans so everyone stays on Lightning. Fails closed to Lightning.
  const premium = RELEASE_MODE && (await planAllows(getToken(req), "premiumArt").catch(() => false));

  // Try models in order — fall back if one fails. Premium primary (Studio Pro) → Juggernaut Pro; standard
  // primary → Juggernaut Lightning (~$0.0017/MP, ~10x cheaper than Fal). Both need a FUNDED Together account;
  // if the paid model 402s/4xxs it falls through to the free FLUX, then SDXL, so panels still render for $0.
  const MODELS = [
    ...(premium ? [{ id: 'RunDiffusion/Juggernaut-pro-flux', steps: 28, b64: false }] : []),
    { id: 'Rundiffusion/Juggernaut-Lightning-Flux',   steps: 4,  b64: false },
    { id: 'black-forest-labs/FLUX.1-schnell-Free',     steps: 4,  b64: false },
    { id: 'stabilityai/stable-diffusion-xl-base-1.0', steps: 20, b64: true  },
  ];

  for (const m of MODELS) {
    const model = m.id;
    try {
      const body = {
        model,
        prompt: fullPrompt,
        width: 512,
        height: 768,
        steps: m.steps,
        n: 1,
        ...(m.b64 ? { response_format: 'b64_json' } : {}),
      };

      const response = await fetch('https://api.together.xyz/v1/images/generations', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (response.status === 422 || response.status === 400) {
        // Try next model
        continue;
      }

      if (!response.ok) {
        continue;
      }

      const data = await response.json();
      const imageB64 = data.data?.[0]?.b64_json;
      const imageUrl = data.data?.[0]?.url;

      if (imageB64) return res.status(200).json({ b64: imageB64 });

      if (imageUrl) {
        try {
          const imgRes = await fetch(imageUrl);
          if (imgRes.ok) {
            const buffer = await imgRes.arrayBuffer();
            const base64 = Buffer.from(buffer).toString('base64');
            return res.status(200).json({ b64: base64 });
          }
        } catch {}
        return res.status(200).json({ url: imageUrl });
      }
    } catch (e) {
      continue;
    }
  }

  // All models failed — return null so panel shows placeholder silently
  return res.status(200).json({ filtered: true, url: null });
}

export const config = { api: { bodyParser: true } };
