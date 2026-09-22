import { guard, corsHeaders, logSpend, getToken } from "./_guard.js";
import { RELEASE_MODE } from "./_pricing.js";
import { planAllows } from "./_supa.js";

// Thin authenticated proxy for Fal.ai — the browser never holds VITE_FAL_KEY. The client keeps its
// tuned orchestration (model failover, canvas black-detection, reseed) and calls this per Fal request.
// Credit charging is driven by the x-mv-action header: the client sends the real action ('panel' /
// 'lora') on the FIRST attempt of a logical unit and 'free' (cost 0) on retries/polls, so one panel or
// one training run is charged once. (Header-driven charging is a v1 approximation — tighten later.)

// Only allow official fal-ai model endpoints — never an arbitrary URL.
const OK_ENDPOINT = /^fal-ai\/[a-z0-9][a-z0-9/_.-]*$/i;

export default async function handler(req, res) {
  const cors = corsHeaders(req);
  for (const [k, v] of Object.entries(cors)) res.setHeader(k, v);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const key = process.env.FAL_KEY;
  if (!key) return res.status(500).json({ error: "FAL_KEY not configured" });

  // LoRA training is a Studio-tier feature at launch — enforce server-side.
  if (RELEASE_MODE && req.headers["x-mv-action"] === "lora" && !(await planAllows(getToken(req), "lora"))) {
    return res.status(403).json({ error: "LoRA character training is a Studio feature — upgrade to unlock it." });
  }

  const g = await guard(req, req.headers["x-mv-action"] || "free", "fal");
  if (!g.ok) return res.status(g.status).json({ error: g.error, ...(g.code ? { code: g.code } : {}) });
  if (g.balance != null) res.setHeader("x-mv-balance", String(g.balance));

  const { op, endpoint, body, contentType, fileName, dataB64, requestId } = req.body || {};
  const auth = { Authorization: `Key ${key}` };
  const jsonAuth = { ...auth, "Content-Type": "application/json" };

  try {
    if (op === "run") {
      if (!OK_ENDPOINT.test(endpoint || "")) return res.status(400).json({ error: "bad endpoint" });
      const r = await fetch(`https://fal.run/${endpoint}`, { method: "POST", headers: jsonAuth, body: JSON.stringify(body || {}) });
      if (r.status === 429) await logSpend({ provider: "fal", action: "fal_429", event: true, meta: { op, endpoint } });
      const data = await r.json().catch(() => ({}));
      return res.status(r.status).json(data);
    }
    if (op === "upload") {
      const init = await fetch("https://rest.alpha.fal.ai/storage/upload/initiate", {
        method: "POST", headers: jsonAuth, body: JSON.stringify({ content_type: contentType, file_name: fileName }),
      });
      if (!init.ok) return res.status(init.status).json({ error: "upload initiate failed" });
      const { upload_url, file_url } = await init.json();
      const bytes = Buffer.from(dataB64 || "", "base64");
      const put = await fetch(upload_url, { method: "PUT", headers: { "Content-Type": contentType }, body: bytes });
      if (!put.ok) return res.status(put.status).json({ error: "upload PUT failed" });
      return res.status(200).json({ file_url });
    }
    if (op === "queue_submit") {
      if (!OK_ENDPOINT.test(endpoint || "")) return res.status(400).json({ error: "bad endpoint" });
      const r = await fetch(`https://queue.fal.run/${endpoint}`, { method: "POST", headers: jsonAuth, body: JSON.stringify(body || {}) });
      if (r.status === 429) await logSpend({ provider: "fal", action: "fal_429", event: true, meta: { op, endpoint } });
      const data = await r.json().catch(() => ({}));
      return res.status(r.status).json(data);
    }
    if (op === "queue_status" || op === "queue_result") {
      if (!OK_ENDPOINT.test(endpoint || "")) return res.status(400).json({ error: "bad endpoint" });
      const path = op === "queue_status" ? `/status` : ``;
      const r = await fetch(`https://queue.fal.run/${endpoint}/requests/${requestId}${path}`, { headers: auth });
      const data = await r.json().catch(() => ({}));
      return res.status(r.status).json(data);
    }
    return res.status(400).json({ error: "unknown op" });
  } catch (e) {
    return res.status(502).json({ error: "fal proxy error: " + e.message });
  }
}

export const config = { api: { bodyParser: { sizeLimit: "12mb" } } };
