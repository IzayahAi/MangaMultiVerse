import { guard, corsHeaders } from "./_guard.js";

// Node.js runtime (not edge) — edge functions cap at ~25s, which a full chapter-script generation
// (up to 8000 output tokens) can exceed, causing FUNCTION_INVOCATION_TIMEOUT. maxDuration is raised via
// vercel.json's functions field (this Vite/Node builder doesn't read the Next.js-style in-file export).
// Every other proxy in this codebase (fal.js, eleven.js, translate.js) is already Node.

// The client picks model + max_tokens, and in demo mode guard() lets signed-out callers through (per-IP
// cap only) — so pin both server-side, or anyone could spend our key on a pricier model. Only Haiku is
// used today (askClaude + askClaudeVision in src/lib/claude.js); add a model here before using it there.
const ALLOWED_MODELS = new Set(["claude-haiku-4-5-20251001"]);
const MAX_TOKENS_CAP = 8000;

export default async function handler(req, res) {
  const cors = corsHeaders(req);
  for (const [k, v] of Object.entries(cors)) res.setHeader(k, v);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "ANTHROPIC_API_KEY not configured" });

  // Validate before guard() so a rejected request never charges credits or counts toward the demo cap.
  const body = req.body || {};
  if (!ALLOWED_MODELS.has(body.model)) return res.status(400).json({ error: "Model not allowed" });
  if (!(Number(body.max_tokens) > 0)) return res.status(400).json({ error: "max_tokens required" });
  body.max_tokens = Math.min(Number(body.max_tokens), MAX_TOKENS_CAP);

  // Auth + atomic credit charge (skipped while the launch gate is off — see _pricing.js).
  const t0 = Date.now();
  const action = req.headers["x-mv-action"] || "misc";
  const g = await guard(req, action, "anthropic");
  const guardMs = Date.now() - t0;
  if (!g.ok) return res.status(g.status).json({ error: g.error });
  if (g.balance != null) res.setHeader("x-mv-balance", String(g.balance));

  const t1 = Date.now();
  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    // Where the time goes (visible in the browser network panel): our guard() Supabase hops vs Anthropic.
    res.setHeader("Server-Timing", `guard;dur=${guardMs}, anthropic;dur=${Date.now() - t1}`);
    return res.status(response.status).json(data);
  } catch (e) {
    res.setHeader("Server-Timing", `guard;dur=${guardMs}, anthropic;dur=${Date.now() - t1}`);
    return res.status(502).json({ error: "Upstream error: " + (e?.message || "unknown") });
  }
}
