#!/usr/bin/env node
// Backfill / heal missing panel art for MangaMultiVerse stories.
//
// WHY THIS EXISTS: stories published while the server-side SUPABASE_ANON_KEY was empty (or during any
// transient storage failure) never got their generated panel art uploaded — their script.panel_images
// stayed empty, so the reader shows placeholders. This regenerates the MISSING panels only (idempotent:
// panels that already have an https image are skipped) and writes real Storage URLs back to the DB, so
// it can be re-run any time art goes missing — the permanent safety net.
//
// Generation goes straight to DeepInfra (same model/params as api/deepinfra.js), upload goes straight to
// the panel-art Storage bucket (same as api/_storage.js) — no app auth/credit gate, since this is an
// admin backfill run with the service role.
//
// Usage (run from the repo root, reads creds from .env.local):
//   node scripts/backfill-panel-art.mjs <storyId> [storyId2 ...]   # heal specific stories
//   node scripts/backfill-panel-art.mjs --missing                  # heal every published story with gaps
//   node scripts/backfill-panel-art.mjs --missing --dry            # report gaps, generate nothing
//   node scripts/backfill-panel-art.mjs <storyId> --mono           # force black-and-white

import fs from "node:fs";

// ── env ──────────────────────────────────────────────────────────────────────
const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split(/\r?\n/)
    .filter(l => l.includes("=") && !l.trim().startsWith("#"))
    .map(l => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);
const SB_URL = env.SUPABASE_URL, ANON = env.SUPABASE_ANON_KEY, SVC = env.SUPABASE_SERVICE_ROLE_KEY, DI = env.DEEPINFRA_API_KEY;
for (const [k, v] of Object.entries({ SUPABASE_URL: SB_URL, SUPABASE_ANON_KEY: ANON, SUPABASE_SERVICE_ROLE_KEY: SVC, DEEPINFRA_API_KEY: DI }))
  if (!v) { console.error(`missing ${k} in .env.local`); process.exit(1); }

const args = process.argv.slice(2);
const DRY = args.includes("--dry");
const FORCE_MONO = args.includes("--mono");
const ALL_MISSING = args.includes("--missing");
const idArgs = args.filter(a => !a.startsWith("--"));

// ── prompt building (mirrors the intent of src/lib/claude.js generatePanelImage) ──
const STYLE = {
  PRISMA: "premium full-color fusion art, manhwa cel-shaded polish, expressive anime manga faces, bold cinematic composition, vivid saturated palette, dramatic volumetric lighting, ultra detailed",
  "JP-EN": "manga illustration, ink linework, screen tones, anime style",
  "KR-EN": "manhwa illustration, full color, cel shading, webtoon style",
  "CN-EN": "manhua illustration, vibrant colors, detailed costumes",
  "US-EN": "comic book illustration, bold outlines, dynamic composition",
  "GL-EN": "manga illustration, detailed linework, anime style",
};
const sanitize = t => String(t || "")
  .replace(/blood(y|ied)?/gi, "dramatic").replace(/gore|gory/gi, "intense")
  .replace(/corpse|dead\s+body/gi, "fallen warrior").replace(/murder|kill(ing|ed)?/gi, "battle")
  .replace(/nude|naked/gi, "clothed").replace(/\s+/g, " ").trim();
const sleep = ms => new Promise(r => setTimeout(r, ms));

function characterContext(story, panel) {
  const chars = [story.protagonist, story.antagonist, ...((story.script?.support_characters) || [])].filter(c => c && c.name);
  const cast = (panel.cast || []).map(c => (typeof c === "string" ? c : c?.name)).filter(Boolean).map(s => s.toLowerCase());
  const relevant = cast.length
    ? chars.filter(c => cast.some(n => c.name.toLowerCase().includes(n) || n.includes(c.name.toLowerCase())))
    : chars.slice(0, 2);
  return relevant.map(c => `${c.name}${c.appearance ? `: ${c.appearance}` : ""}`).filter(Boolean).join(". ");
}

function buildPrompt(story, panel) {
  const mono = FORCE_MONO || !!story.script?.mono;
  const essential = mono
    ? "Black-and-white monochrome manga illustration, no color, correct anatomy, no written text."
    : "Full-color illustration, correct anatomy, no written text.";
  const desc = panel.scene || panel.scene_description || panel.composition || panel.scene_heading || "a dramatic manga scene";
  const cc = characterContext(story, panel);
  const styleMod = STYLE[story.script?.art_style] || STYLE["JP-EN"];
  const p = `${essential} Storytelling panel depicting: ${desc}.${cc ? ` Characters, render them consistently: ${cc}.` : ""} ${styleMod}. High quality, clean line art, correct anatomy, no written text, no speech bubbles, no watermark.`;
  return sanitize(p).slice(0, 1900);
}

// ── generation + upload ──────────────────────────────────────────────────────
async function generate(prompt) {
  const r = await fetch("https://api.deepinfra.com/v1/inference/black-forest-labs/FLUX-1-schnell", {
    method: "POST",
    headers: { Authorization: `Bearer ${DI}`, "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, width: 512, height: 768, num_inference_steps: 4 }),
  });
  if (!r.ok) throw new Error(`deepinfra ${r.status}: ${(await r.text().catch(() => "")).slice(0, 160)}`);
  const data = await r.json();
  const first = data.images?.[0] || data.data?.[0]?.b64_json || null;
  if (!first) throw new Error("no image in deepinfra response");
  if (typeof first === "string" && first.startsWith("data:")) {
    const m = first.match(/^data:image\/[a-zA-Z0-9.+-]+;base64,(.+)$/);
    if (!m) throw new Error("unrecognized data URI");
    return Buffer.from(m[1], "base64");
  }
  return Buffer.from(first, "base64"); // already-bare b64
}

async function upload(bytes) {
  const path = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}.png`;
  const r = await fetch(`${SB_URL}/storage/v1/object/panel-art/${path}`, {
    method: "POST",
    headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, "Content-Type": "image/png" },
    body: bytes,
  });
  if (!r.ok) throw new Error(`storage upload ${r.status}: ${(await r.text().catch(() => "")).slice(0, 160)}`);
  return `${SB_URL}/storage/v1/object/public/panel-art/${path}`;
}

// ── DB ───────────────────────────────────────────────────────────────────────
const svcHeaders = { apikey: SVC, Authorization: `Bearer ${SVC}`, "Content-Type": "application/json" };
async function fetchStory(id) {
  const r = await fetch(`${SB_URL}/rest/v1/stories?id=eq.${encodeURIComponent(id)}&select=*`, { headers: svcHeaders });
  const rows = await r.json();
  return Array.isArray(rows) ? rows[0] : null;
}
async function savePanelImages(story, panelImages) {
  const script = { ...(story.script || {}), panel_images: panelImages };
  const r = await fetch(`${SB_URL}/rest/v1/stories?id=eq.${encodeURIComponent(story.id)}`, {
    method: "PATCH", headers: { ...svcHeaders, Prefer: "return=minimal" }, body: JSON.stringify({ script }),
  });
  if (!r.ok) throw new Error(`save ${r.status}: ${(await r.text().catch(() => "")).slice(0, 160)}`);
}

async function listMissing() {
  const r = await fetch(`${SB_URL}/rest/v1/stories?status=eq.published&select=id,title,script`, { headers: svcHeaders });
  const rows = await r.json();
  return rows.filter(s => {
    const panels = s.script?.panels || [];
    const imgs = s.script?.panel_images || {};
    const have = panels.filter(p => String(imgs[p.number] || "").startsWith("http")).length;
    return panels.length > 0 && have < panels.length;
  }).map(s => s.id);
}

// ── main ─────────────────────────────────────────────────────────────────────
async function backfillStory(id) {
  const story = await fetchStory(id);
  if (!story) { console.log(`  ! ${id}: not found`); return; }
  const panels = story.script?.panels || [];
  const images = { ...(story.script?.panel_images || {}) };
  const missing = panels.filter(p => !String(images[p.number] || "").startsWith("http"));
  console.log(`\n▶ ${story.title} (${id}) — ${panels.length} panels, ${missing.length} missing art`);
  if (DRY) return;
  let filled = 0;
  for (let i = 0; i < missing.length; i++) {
    const p = missing[i];
    try {
      const url = await upload(await generate(buildPrompt(story, p)));
      images[p.number] = url;
      filled++;
      if (filled % 8 === 0) { await savePanelImages(story, images); } // checkpoint (resumable)
      process.stdout.write(`  panel ${p.number} ✓ (${filled}/${missing.length})\r`);
    } catch (e) {
      console.log(`\n  panel ${p.number} ✗ ${e.message}`);
    }
    await sleep(250); // gentle on the provider
  }
  await savePanelImages(story, images);
  console.log(`\n  done: ${filled}/${missing.length} panels filled → saved to DB`);
}

(async () => {
  let ids = idArgs;
  if (ALL_MISSING) ids = await listMissing();
  if (!ids.length) { console.log("Nothing to do. Pass a story id, or --missing to scan published stories."); return; }
  console.log(`Backfilling ${ids.length} story(ies)${DRY ? " (dry run)" : ""}…`);
  for (const id of ids) await backfillStory(id);
  console.log("\nAll done.");
})();
