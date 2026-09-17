// api/eleven.js — secure server-side proxy for ElevenLabs text-to-speech.
// The key lives ONLY here as process.env.ELEVENLABS_KEY and never reaches the browser.
// Returns raw MP3 bytes so the frontend can keep doing res.blob() -> objectURL.
export const config = { runtime: 'edge' };

export default async function handler(req) {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: cors });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: cors });

  const apiKey = process.env.ELEVENLABS_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'ELEVENLABS_KEY not configured' }), {
      status: 500, headers: { 'Content-Type': 'application/json', ...cors },
    });
  }

  const { text, voiceId } = await req.json();
  if (!text || !voiceId) {
    return new Response(JSON.stringify({ error: 'text and voiceId are required' }), {
      status: 400, headers: { 'Content-Type': 'application/json', ...cors },
    });
  }

  try {
    const upstream = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json', 'Accept': 'audio/mpeg' },
      body: JSON.stringify({
        text,
        model_id: 'eleven_turbo_v2_5',
        voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.35, use_speaker_boost: true },
      }),
    });

    if (!upstream.ok) {
      const detail = (await upstream.text().catch(() => '')).slice(0, 200);
      return new Response(JSON.stringify({ error: 'eleven_failed', status: upstream.status, detail }), {
        status: upstream.status, headers: { 'Content-Type': 'application/json', ...cors },
      });
    }

    const audio = await upstream.arrayBuffer();
    return new Response(audio, {
      status: 200,
      headers: { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store', ...cors },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'eleven_exception', detail: String(e).slice(0, 200) }), {
      status: 502, headers: { 'Content-Type': 'application/json', ...cors },
    });
  }
}
