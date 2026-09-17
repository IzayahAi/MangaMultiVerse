// api/fal.js — secure server-side proxy for Fal.ai (FLUX schnell).
// The key lives ONLY here as process.env.FAL_KEY and never reaches the browser.
export const config = { runtime: 'edge' };

export default async function handler(req) {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: cors });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: cors });

  const apiKey = process.env.FAL_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'FAL_KEY not configured' }), {
      status: 500, headers: { 'Content-Type': 'application/json', ...cors },
    });
  }

  const { prompt, width = 704, height = 1024 } = await req.json();
  if (!prompt) {
    return new Response(JSON.stringify({ error: 'No prompt provided' }), {
      status: 400, headers: { 'Content-Type': 'application/json', ...cors },
    });
  }

  const clamp = (n) => Math.max(64, Math.min(1024, Math.round(n / 64) * 64));

  try {
    const upstream = await fetch('https://fal.run/fal-ai/flux/schnell', {
      method: 'POST',
      headers: { 'Authorization': `Key ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt,
        image_size: { width: clamp(width), height: clamp(height) },
        num_inference_steps: 4,
        num_images: 1,
        enable_safety_checker: false,
      }),
    });

    if (!upstream.ok) {
      const detail = (await upstream.text().catch(() => '')).slice(0, 200);
      return new Response(JSON.stringify({ error: 'fal_failed', status: upstream.status, detail }), {
        status: upstream.status, headers: { 'Content-Type': 'application/json', ...cors },
      });
    }

    const data = await upstream.json();
    const url = data.images?.[0]?.url || null;
    return new Response(JSON.stringify({ url }), {
      status: 200, headers: { 'Content-Type': 'application/json', ...cors },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'fal_exception', detail: String(e).slice(0, 200) }), {
      status: 502, headers: { 'Content-Type': 'application/json', ...cors },
    });
  }
}
