import { guard, corsHeaders } from "./_guard.js";

// Node.js runtime (not edge) — edge functions cap at ~25s, which a full chapter-script generation
// (up to 8000 output tokens) can exceed, causing FUNCTION_INVOCATION_TIMEOUT. maxDuration below raises
// the ceiling; every other proxy in this codebase (fal.js, eleven.js, translate.js) is already Node.
export const maxDuration = 60;

export default async function handler(req, res) {
  const cors = corsHeaders(req);
  for (const [k, v] of Object.entries(cors)) res.setHeader(k, v);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "ANTHROPIC_API_KEY not configured" });

  // Auth + atomic credit charge (skipped while the launch gate is off — see _pricing.js).
  const action = req.headers["x-mv-action"] || "misc";
  const g = await guard(req, action, "anthropic");
  if (!g.ok) return res.status(g.status).json({ error: g.error });
  if (g.balance != null) res.setHeader("x-mv-balance", String(g.balance));

  const body = req.body || {};

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
  return res.status(response.status).json(data);
}
