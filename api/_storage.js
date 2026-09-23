// Upload generated panel art bytes to the public 'panel-art' Supabase Storage bucket and return the
// resulting public URL. Requires db/panel_art_storage.sql to have been run (creates the bucket + RLS).
// Uses the anon key — same pattern as every other write in this app (the security boundary is "the
// browser never holds a provider key," not per-upload auth).
//
// Best-effort: returns null on any failure (bucket not created yet, network error, etc.) so callers can
// fall back to returning base64 directly — the demo keeps working even before the SQL has been run,
// it just means art from before that point never reaches the database (same as today).
const SB_URL = process.env.SUPABASE_URL;
const SB_ANON = process.env.SUPABASE_ANON_KEY;

export async function uploadPanelArt(bytes, contentType = "image/png") {
  if (!SB_URL || !SB_ANON || !bytes?.length) return null;
  const ext = contentType.includes("jpeg") ? "jpg" : contentType.includes("webp") ? "webp" : "png";
  const path = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;
  try {
    const r = await fetch(`${SB_URL}/storage/v1/object/panel-art/${path}`, {
      method: "POST",
      headers: { apikey: SB_ANON, Authorization: `Bearer ${SB_ANON}`, "Content-Type": contentType },
      body: bytes,
    });
    if (!r.ok) return null;
    return `${SB_URL}/storage/v1/object/public/panel-art/${path}`;
  } catch { return null; }
}
