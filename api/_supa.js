// Shared Supabase helpers for the billing endpoints. verifyUser reads the caller's identity from their
// JWT (anon key); the svc* helpers read/write profiles + billing_events past RLS with the SERVICE ROLE
// (only the server holds it) — that's what lets the Stripe webhook set plan/credits the client can't.

const SB_URL = process.env.SUPABASE_URL;
const SB_ANON = process.env.SUPABASE_ANON_KEY;
const SB_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const hasService = () => !!(SB_SERVICE && SB_URL);
const svcHeaders = (extra = {}) => ({ apikey: SB_SERVICE, Authorization: `Bearer ${SB_SERVICE}`, "Content-Type": "application/json", ...extra });

// Verify a Supabase user JWT → { id, email, ... } or null.
export async function verifyUser(token) {
  if (!token || !SB_URL || !SB_ANON) return null;
  try {
    const r = await fetch(`${SB_URL}/auth/v1/user`, { headers: { apikey: SB_ANON, Authorization: `Bearer ${token}` } });
    return r.ok ? await r.json() : null;
  } catch { return null; }
}

export async function svcGetProfile(userId) {
  if (!hasService() || !userId) return null;
  try {
    const r = await fetch(`${SB_URL}/rest/v1/profiles?id=eq.${userId}&select=id,email,username,credits,plan,stripe_customer_id`, { headers: svcHeaders() });
    const rows = await r.json(); return Array.isArray(rows) ? rows[0] || null : null;
  } catch { return null; }
}

export async function svcGetProfileByCustomer(customerId) {
  if (!hasService() || !customerId) return null;
  try {
    const r = await fetch(`${SB_URL}/rest/v1/profiles?stripe_customer_id=eq.${encodeURIComponent(customerId)}&select=id,email,credits,plan,stripe_customer_id`, { headers: svcHeaders() });
    const rows = await r.json(); return Array.isArray(rows) ? rows[0] || null : null;
  } catch { return null; }
}

export async function svcPatchProfile(userId, patch) {
  if (!hasService() || !userId) return false;
  try {
    const r = await fetch(`${SB_URL}/rest/v1/profiles?id=eq.${userId}`, { method: "PATCH", headers: svcHeaders({ Prefer: "return=minimal" }), body: JSON.stringify(patch) });
    return r.ok;
  } catch { return false; }
}

export async function svcInsert(table, row) {
  if (!hasService()) return false;
  try {
    const r = await fetch(`${SB_URL}/rest/v1/${table}`, { method: "POST", headers: svcHeaders({ Prefer: "return=minimal" }), body: JSON.stringify(row) });
    return r.ok;
  } catch { return false; }
}

// Has this Stripe event already been processed? (idempotency — webhooks retry.)
export async function eventSeen(stripeEventId) {
  if (!hasService() || !stripeEventId) return false;
  try {
    const r = await fetch(`${SB_URL}/rest/v1/billing_events?stripe_event_id=eq.${encodeURIComponent(stripeEventId)}&select=id&limit=1`, { headers: svcHeaders() });
    const rows = await r.json(); return Array.isArray(rows) && rows.length > 0;
  } catch { return false; }
}
