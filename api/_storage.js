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

// TEMP DIAGNOSTIC: also returns _debug (last failure reason) so a caller can surface it in the response
// while tracking down why production uploads were failing when a direct curl to the same bucket worked.
// Remove the _debug plumbing once confirmed fixed.
let _lastDebug = null;
export function _storageDebug() { return _lastDebug; }

// TEMP DIAGNOSTIC: find the first character (if any) in a header-value candidate that would break the
// Fetch API's ByteString coercion (code point > 255) — pinpoints exactly which value is bad instead of
// guessing from Node's generic "index N" error.
function _findBadChar(label, s) {
  if (!s) return null;
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    if (code > 255) return `${label}[${i}]=U+${code.toString(16)} ('${s[i]}') in a string of length ${s.length}`;
  }
  return null;
}

export async function uploadPanelArt(bytes, contentType = "image/png") {
  if (!SB_URL || !SB_ANON || !bytes?.length) { _lastDebug = `precondition failed: SB_URL=${!!SB_URL} SB_ANON=${!!SB_ANON} bytesLen=${bytes?.length}`; return null; }
  const bad = _findBadChar("SB_ANON", SB_ANON) || _findBadChar("SB_URL", SB_URL) || _findBadChar("contentType", contentType);
  if (bad) { _lastDebug = `bad header char found: ${bad}`; return null; }
  const ext = contentType.includes("jpeg") ? "jpg" : contentType.includes("webp") ? "webp" : "png";
  const path = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;
  try {
    const r = await fetch(`${SB_URL}/storage/v1/object/panel-art/${path}`, {
      method: "POST",
      headers: { apikey: SB_ANON, Authorization: `Bearer ${SB_ANON}`, "Content-Type": contentType },
      body: bytes,
    });
    if (!r.ok) { _lastDebug = `HTTP ${r.status}: ${(await r.text().catch(() => "")).slice(0, 300)}`; return null; }
    _lastDebug = null;
    return `${SB_URL}/storage/v1/object/public/panel-art/${path}`;
  } catch (e) { _lastDebug = `threw: ${e.message}`; return null; }
}
