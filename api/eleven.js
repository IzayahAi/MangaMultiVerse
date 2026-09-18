import { guard, corsHeaders } from "./_guard.js";

// Authenticated proxy for ElevenLabs text-to-speech — the browser never holds the ElevenLabs key.
// Returns the audio/mpeg bytes; the client wraps them in an object URL.
export default async function handler(req, res) {
  const cors = corsHeaders(req);
  for (const [k, v] of Object.entries(cors)) res.setHeader(k, v);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const key = process.env.ELEVENLABS_KEY;
  if (!key) return res.status(500).json({ error: "ELEVENLABS_KEY not configured" });

  const g = await guard(req, "voice_tts");
  if (!g.ok) return res.status(g.status).json({ error: g.error });
  if (g.balance != null) res.setHeader("x-mv-balance", String(g.balance));

  const { text, voiceId } = req.body || {};
  if (!text || !voiceId) return res.status(400).json({ error: "text and voiceId required" });

  try {
    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`, {
      method: "POST",
      headers: { "xi-api-key": key, "Content-Type": "application/json", Accept: "audio/mpeg" },
      body: JSON.stringify({ text, model_id: "eleven_turbo_v2_5", voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.35, use_speaker_boost: true } }),
    });
    if (!r.ok) {
      const body = await r.text().catch(() => "");
      return res.status(r.status).json({ error: "ElevenLabs " + r.status, detail: body.slice(0, 200) });
    }
    const buf = Buffer.from(await r.arrayBuffer());
    res.setHeader("Content-Type", "audio/mpeg");
    return res.status(200).send(buf);
  } catch (e) {
    return res.status(502).json({ error: "eleven proxy error: " + e.message });
  }
}

export const config = { api: { bodyParser: true } };
