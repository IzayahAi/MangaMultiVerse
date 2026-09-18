import { useState, useEffect, useCallback } from "react";
import { DEMO_CREDITS } from "../constants.js";

const SB_URL = import.meta.env.VITE_SUPABASE_URL || "https://your-project.supabase.co";
const SB_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "your-anon-key";
export const DEMO = SB_URL.includes("your-project");

// ── Live session so any request can self-refresh a lapsed token and retry once ──
let _refreshTok = null;         // current refresh token
let _onRefresh = null;          // (newToken, newRefreshTok) => void — App wires this to setAuth + localStorage
let _onExpired = null;          // () => void — fires when the refresh token itself is dead (needs re-login)
let _expiredNotified = false;   // throttle so we notify once per lapse, not per request
let _refreshing = null;         // in-flight refresh promise (dedupe concurrent 401s)

export function registerSession(refreshTok, onRefresh, onExpired) {
  _refreshTok = refreshTok || null;
  _onRefresh = onRefresh || null;
  _onExpired = onExpired || null;
  if (refreshTok) _expiredNotified = false; // fresh session → allow a future expiry notice
}

function notifyExpired() {
  if (_expiredNotified) return;
  _expiredNotified = true;
  try { _onExpired?.(); } catch {}
}

export async function ensureFreshToken() {
  if (DEMO) return null;
  if (!_refreshTok) { notifyExpired(); return null; } // no refresh token → can't recover, tell the user
  if (!_refreshing) {
    _refreshing = refreshToken(_refreshTok)
      .then(res => {
        _refreshing = null;
        if (res?.token) {
          if (res.refreshToken) _refreshTok = res.refreshToken;
          _expiredNotified = false;
          try { _onRefresh?.(res.token, _refreshTok); } catch {}
          return res.token;
        }
        notifyExpired(); // refresh endpoint rejected the token → genuinely expired
        return null;
      })
      .catch(() => { _refreshing = null; return null; }); // network error → transient, don't nag
  }
  return _refreshing;
}

const sb = {
  h: (tok) => ({ "apikey":SB_KEY, "Authorization":`Bearer ${tok||SB_KEY}`, "Content-Type":"application/json", "Prefer":"return=representation" }),
  // Fetch that, on a 401 with a user token, refreshes the JWT once and retries.
  async _fetch(method, url, tok, body) {
    const opt = { method, headers:this.h(tok) };
    if (body !== undefined) opt.body = JSON.stringify(body);
    let r = await fetch(url, opt);
    if (r.status === 401 && tok && tok !== SB_KEY) {
      const nt = await ensureFreshToken();
      if (nt) {
        const opt2 = { method, headers:this.h(nt) };
        if (body !== undefined) opt2.body = JSON.stringify(body);
        r = await fetch(url, opt2);
      }
    }
    return r;
  },
  async rpc(path, body, tok) {
    const r = await this._fetch("POST", `${SB_URL}${path}`, tok, body);
    if (!r.ok) throw new Error((await r.text().catch(() => "")) || `rpc ${r.status}`);
    const t = await r.text();          // void RPCs (moderate_story, raise-only spend_credits) return empty
    return t ? JSON.parse(t) : null;
  },
  async get(table, qs, tok) {
    const r = await this._fetch("GET", `${SB_URL}/rest/v1/${table}${qs||""}`, tok);
    if (!r.ok) throw new Error((await r.json()).message);
    return r.json();
  },
  async post(table, body, tok) {
    const r = await this._fetch("POST", `${SB_URL}/rest/v1/${table}`, tok, body);
    if (!r.ok) throw new Error((await r.json()).message);
    return r.json();
  },
  async patch(table, id, body, tok) {
    const r = await this._fetch("PATCH", `${SB_URL}/rest/v1/${table}?id=eq.${id}`, tok, body);
    if (!r.ok) throw new Error((await r.json()).message);
    return r.json();
  },
  async del(table, id, tok) {
    await this._fetch("DELETE", `${SB_URL}/rest/v1/${table}?id=eq.${id}`, tok);
  },
  // Insert-or-update on the primary key (Postgres upsert), with one 401 refresh+retry.
  async upsert(table, body, tok) {
    const hdr = () => ({ ...this.h(tok), Prefer: "resolution=merge-duplicates,return=minimal" });
    let r = await fetch(`${SB_URL}/rest/v1/${table}`, { method: "POST", headers: hdr(), body: JSON.stringify(body) });
    if (r.status === 401 && tok && tok !== SB_KEY) {
      const nt = await ensureFreshToken();
      if (nt) { tok = nt; r = await fetch(`${SB_URL}/rest/v1/${table}`, { method: "POST", headers: hdr(), body: JSON.stringify(body) }); }
    }
    return r;
  },
};

// ── Pre-generated translations live in their OWN table so they never bloat the story record or the
// homepage feed. One row per (story, language), keyed `${storyId}_${language}`. Requires a
// `translations` table (see the setup SQL) with public read + owner write RLS. All calls are
// best-effort: if the table doesn't exist yet, they no-op and the reader falls back to on-demand.
export async function saveTranslation(storyId, language, data, token) {
  if (DEMO || !token || !storyId || !language) return false;
  const row = { id: `${storyId}_${language}`, story_id: storyId, language, data, updated_at: new Date().toISOString() };
  try { const r = await sb.upsert("translations", row, token); return r.ok; }
  catch (e) { console.warn("saveTranslation failed:", e.message); return false; }
}

// Fetch one pre-generated translation (public read — no token). Returns the stored data object or null.
export async function fetchTranslation(storyId, language) {
  if (DEMO || !storyId || !language) return null;
  try {
    const rows = await sb.get("translations", `?id=eq.${encodeURIComponent(`${storyId}_${language}`)}&select=data`);
    return rows?.[0]?.data || null;
  } catch { return null; }
}

// Which languages a story has been pre-translated into (for badges/UX). Returns an array of names.
export async function fetchTranslatedLangs(storyId) {
  if (DEMO || !storyId) return [];
  try {
    const rows = await sb.get("translations", `?story_id=eq.${encodeURIComponent(storyId)}&select=language`);
    return Array.isArray(rows) ? rows.map(r => r.language) : [];
  } catch { return []; }
}

// ── Observability: best-effort error sink (see db/error_log.sql). Fire-and-forget so logging never
// throws or blocks. Inserts with the anon key (RLS allows insert; only admins can read).
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function logError(payload = {}) {
  if (DEMO) return;
  try {
    const row = {
      level: payload.level || "error",
      message: String(payload.message ?? "").slice(0, 2000),
      source: payload.source ? String(payload.source).slice(0, 200) : null,
      url: payload.url || (typeof location !== "undefined" ? location.href : null),
      stack: payload.stack ? String(payload.stack).slice(0, 4000) : null,
      user_id: UUID_RE.test(payload.userId || "") ? payload.userId : null,
      context: payload.context || {},
    };
    fetch(`${SB_URL}/rest/v1/error_log`, {
      method: "POST",
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify(row),
    }).catch(() => {});
  } catch {}
}

// ── Moderation: readers report published stories; admins review + hide/restore (see db/reports.sql).
export async function submitReport(storyId, storyTitle, reason, reporterId) {
  if (DEMO || !storyId) return false;
  try {
    const r = await fetch(`${SB_URL}/rest/v1/reports`, {
      method: "POST",
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ story_id: storyId, story_title: storyTitle || null, reason: reason || null, reporter_id: UUID_RE.test(reporterId || "") ? reporterId : null }),
    });
    return r.ok;
  } catch (e) { console.warn("submitReport:", e.message); return false; }
}

export async function fetchReports(token) {
  if (DEMO || !token) return [];
  try { const rows = await sb.get("reports", `?select=*&order=created_at.desc&limit=100`, token); return Array.isArray(rows) ? rows : []; }
  catch (e) { console.warn("fetchReports:", e.message); return []; }
}

export async function resolveReport(id, status, token) {
  if (DEMO || !token || !id) return false;
  try { await sb.patch("reports", id, { status }, token); return true; }
  catch (e) { console.warn("resolveReport:", e.message); return false; }
}

// Admin: hide ('draft') or restore ('published') any story via the SECURITY DEFINER RPC.
export async function moderateStory(storyId, status, token) {
  if (DEMO || !token || !storyId) return false;
  try { await sb.rpc("/rest/v1/rpc/moderate_story", { p_id: storyId, p_status: status }, token); return true; }
  catch (e) { console.warn("moderateStory:", e.message); return false; }
}

// ── Mr. K (Chief of Staff) inbox: idea/follow-up captures, admin-triaged (see db/cos_inbox.sql).
export async function addInboxItem(text, source = "ui", token) {
  if (DEMO || !text) return false;
  try {
    const r = await fetch(`${SB_URL}/rest/v1/cos_inbox`, {
      method: "POST",
      headers: { apikey: SB_KEY, Authorization: `Bearer ${token || SB_KEY}`, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ text: String(text).slice(0, 2000), source }),
    });
    return r.ok;
  } catch (e) { console.warn("addInboxItem:", e.message); return false; }
}

export async function fetchInbox(token) {
  if (DEMO || !token) return [];
  try { const rows = await sb.get("cos_inbox", `?select=*&order=created_at.desc&limit=200`, token); return Array.isArray(rows) ? rows : []; }
  catch (e) { console.warn("fetchInbox:", e.message); return []; }
}

export async function resolveInboxItem(id, status, token) {
  if (DEMO || !token || !id) return false;
  try { await sb.patch("cos_inbox", id, { status }, token); return true; }
  catch (e) { console.warn("resolveInboxItem:", e.message); return false; }
}

// ── Mr. K daily logs: a dated record of each session (see db/cos_daily_logs.sql).
export async function addDailyLog(title, body, source = "ui", token, logDate) {
  if (DEMO || !body) return false;
  try {
    const r = await fetch(`${SB_URL}/rest/v1/cos_daily_logs`, {
      method: "POST",
      headers: { apikey: SB_KEY, Authorization: `Bearer ${token || SB_KEY}`, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ title: title ? String(title).slice(0, 200) : null, body: String(body).slice(0, 8000), source, ...(logDate ? { log_date: logDate } : {}) }),
    });
    return r.ok;
  } catch (e) { console.warn("addDailyLog:", e.message); return false; }
}

export async function fetchDailyLogs(token, limit = 60) {
  if (DEMO || !token) return [];
  try { const rows = await sb.get("cos_daily_logs", `?select=*&order=log_date.desc,created_at.desc&limit=${limit}`, token); return Array.isArray(rows) ? rows : []; }
  catch (e) { console.warn("fetchDailyLogs:", e.message); return []; }
}

// Admin-only: read recent errors for the observability view.
export async function fetchErrors(token, limit = 100) {
  if (DEMO || !token) return [];
  try { const rows = await sb.get("error_log", `?select=*&order=created_at.desc&limit=${limit}`, token); return Array.isArray(rows) ? rows : []; }
  catch (e) { console.warn("fetchErrors:", e.message); return []; }
}

// ── Multi-chapter series. Chapters 2+ live in their OWN `chapters` table (see db/chapters.sql) so the
// homepage feed stays light; Chapter 1 stays in the story record's `script`. Best-effort like translations.
// A chapter row: { id:`${storyId}_${n}`, story_id, number, script, status:'draft'|'published' }.
export async function fetchChapters(storyId) {
  if (DEMO || !storyId) return [];
  try {
    const rows = await sb.get("chapters", `?story_id=eq.${encodeURIComponent(storyId)}&select=number,status,updated_at&order=number.asc`);
    return Array.isArray(rows) ? rows : [];
  } catch (e) { console.warn("fetchChapters:", e.message); return []; }
}

export async function fetchChapter(storyId, number) {
  if (DEMO || !storyId || !number) return null;
  try {
    const rows = await sb.get("chapters", `?id=eq.${encodeURIComponent(`${storyId}_${number}`)}&select=script,status,number`);
    return rows?.[0] || null;
  } catch (e) { console.warn("fetchChapter:", e.message); return null; }
}

export async function saveChapter(storyId, number, script, status, token) {
  if (DEMO || !token || !storyId || !number) return false;
  const row = { id: `${storyId}_${number}`, story_id: storyId, number, script, status: status || "draft", updated_at: new Date().toISOString() };
  try { const r = await sb.upsert("chapters", row, token); return r.ok; }
  catch (e) { console.warn("saveChapter failed:", e.message); return false; }
}

// Remove a chapter row (owner only via RLS). Used to delete an unwanted/phantom chapter 2+.
export async function deleteChapter(storyId, number, token) {
  if (DEMO || !token || !storyId || !number) return false;
  try { await sb.del("chapters", `${storyId}_${number}`, token); return true; }
  catch (e) { console.warn("deleteChapter failed:", e.message); return false; }
}

// ── Story Brain: the living bible per story (see db/story_bible.sql). Public read (it's story lore),
// owner write. Best-effort like the other stores. Shape: { data:{characters,locations,world_rules,
// plot_threads,open_hooks,timeline,running_recap}, prefs:{...} }.
export async function fetchBible(storyId) {
  if (DEMO || !storyId) return null;
  try {
    const rows = await sb.get("story_bible", `?id=eq.${encodeURIComponent(storyId)}&select=data,prefs`);
    return rows?.[0] || null;
  } catch (e) { console.warn("fetchBible:", e.message); return null; }
}

export async function saveBible(storyId, data, prefs, token) {
  if (DEMO || !token || !storyId) return false;
  const row = { id: storyId, story_id: storyId, data: data || {}, prefs: prefs || {}, updated_at: new Date().toISOString() };
  try { const r = await sb.upsert("story_bible", row, token); return r.ok; }
  catch (e) { console.warn("saveBible failed:", e.message); return false; }
}

// ── Admin "Brain": an Obsidian-style linked-notes vault, private to admins. Lives in its OWN
// `brain_notes` table (see db/brain_notes.sql) with admin-only RLS. Like translations, all calls are
// best-effort: if the table doesn't exist yet they no-op, so the app never breaks pre-setup.
// A note: { id, title, body (markdown w/ [[wikilinks]]), kind: 'doc'|'ops'|'note', tags[], links[] }.
export async function fetchBrainNotes(token) {
  if (DEMO || !token) return [];
  try {
    const rows = await sb.get("brain_notes", `?select=*&order=updated_at.desc`, token);
    return Array.isArray(rows) ? rows : [];
  } catch (e) { console.warn("fetchBrainNotes failed:", e.message); return []; }
}

export async function saveBrainNote(note, token) {
  if (DEMO || !token || !note?.id) return false;
  const row = {
    id: note.id,
    title: note.title || "Untitled",
    body: note.body || "",
    kind: note.kind || "note",
    tags: note.tags || [],
    links: note.links || [],
    updated_at: new Date().toISOString(),
  };
  try { const r = await sb.upsert("brain_notes", row, token); return r.ok; }
  catch (e) { console.warn("saveBrainNote failed:", e.message); return false; }
}

export async function deleteBrainNote(id, token) {
  if (DEMO || !token || !id) return false;
  try { await sb.del("brain_notes", id, token); return true; }
  catch (e) { console.warn("deleteBrainNote failed:", e.message); return false; }
}

export async function signUp(email, password, username) {
  if (DEMO) return { user:{ id:`demo_${Date.now()}`, email, username }, token:"demo" };
  const r = await sb.rpc("/auth/v1/signup", { email, password, data:{ username } });
  // (never log the full auth response — it contains access/refresh tokens)
  if (r.error) throw new Error(r.error.message || r.error);
  if (r.msg) throw new Error(r.msg);
  const authUser = r.user ?? r.data?.user;
  const token    = r.access_token ?? r.data?.session?.access_token ?? r.session?.access_token;
  if (!authUser?.id) throw new Error("Check your email to confirm your account, then sign in.");
  try { await sb.post("profiles", { id:authUser.id, username, email, role:"creator", credits:DEMO_CREDITS }, token); } catch(e){ console.warn("profile insert:", e); }
  return { user:{ id:authUser.id, email, username, role:"creator", credits:DEMO_CREDITS }, token };
}

export async function signIn(email, password) {
  if (DEMO) return { user:{ id:`demo_${email.replace(/\W/g,"")}`, email, username:email.split("@")[0], role:"creator", credits:DEMO_CREDITS }, token:"demo" };
  const res = await fetch(`${SB_URL}/auth/v1/token?grant_type=password`, {
    method:"POST",
    headers:{ "apikey":SB_KEY, "Content-Type":"application/json" },
    body:JSON.stringify({ email, password }),
  });
  const r = await res.json();
  // (never log the full auth response — it contains access/refresh tokens)
  if (!res.ok || r.error) throw new Error(r.error_description || r.message || r.error || "Sign in failed");
  const authUser = r.user ?? r.data?.user;
  const token      = r.access_token ?? r.data?.session?.access_token ?? r.session?.access_token;
  const refreshTok  = r.refresh_token ?? r.data?.session?.refresh_token ?? r.session?.refresh_token;
  if (!authUser?.id) throw new Error("No user returned — please try again");
  let profile = {};
  try { const rows = await sb.get("profiles", `?id=eq.${authUser.id}`, token); profile = rows[0] || {}; } catch(e){ console.warn("profile fetch:", e); }
  return { user:{ id:authUser.id, email, username:profile.username||email.split("@")[0], role:profile.role||"creator", credits:profile.credits ?? DEMO_CREDITS }, token, refreshToken: refreshTok };
}

const lsKey = (uid) => `mv2_stories_${uid}`;
export const lsGet = (uid) => { try { return JSON.parse(localStorage.getItem(lsKey(uid))||"[]"); } catch { return []; }};
export const lsSet = (uid, data) => { try { localStorage.setItem(lsKey(uid), JSON.stringify(data)); } catch{} };

export async function refreshToken(refreshTok) {
  if (DEMO || !refreshTok) return null;
  try {
    const res = await fetch(`${SB_URL}/auth/v1/token?grant_type=refresh_token`, {
      method:"POST",
      headers:{ "apikey":SB_KEY, "Content-Type":"application/json" },
      body:JSON.stringify({ refresh_token: refreshTok }),
    });
    const r = await res.json();
    if (!res.ok) return null;
    return {
      token: r.access_token ?? r.data?.session?.access_token ?? null,
      refreshToken: r.refresh_token ?? r.data?.session?.refresh_token ?? null,
    };
  } catch { return null; }
}

// Fetch ALL published stories across every author (public read path).
// Requires an RLS policy allowing select where status = 'published'.
export async function fetchPublishedStories() {
  if (DEMO) {
    // Demo mode: gather published stories from every local user bucket
    const out = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith("mv2_stories_")) {
        try { JSON.parse(localStorage.getItem(k)||"[]").forEach(s => { if (s.status === "published") out.push(s); }); } catch {}
      }
    }
    return out;
  }
  try {
    return await sb.get("stories", `?status=eq.published&order=updated_at.desc`);
  } catch (e) {
    console.warn("Public published fetch failed:", e.message);
    return [];
  }
}

// Decrement a user's credits in Supabase. Returns the new balance, or null on failure.
export async function spendCredits(userId, token, currentBalance, amount) {
  const newBalance = Math.max(0, currentBalance - amount);
  if (DEMO || !token) return newBalance; // demo mode: just track locally
  try {
    await sb.patch("profiles", userId, { credits: newBalance }, token);
  } catch (e) {
    console.warn("Credit update failed (kept local):", e.message);
  }
  return newBalance;
}

export function useDB(token, userId) {
  const [stories, setStories] = useState([]);
  const [busy, setBusy]       = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    setBusy(true);
    try {
      if (DEMO) { setStories(lsGet(userId)); return; }
      const rows = await sb.get("stories", `?author_id=eq.${userId}&order=updated_at.desc`, token);
      if (Array.isArray(rows)) { setStories(rows); lsSet(userId, rows); }
      else { setStories(lsGet(userId)); }
    } catch(e) {
      setStories(lsGet(userId));
      if (e.message?.includes("JWT") || e.message?.includes("expired")) console.warn("Token expired — using local cache");
    }
    finally { setBusy(false); }
  }, [token, userId]);

  useEffect(() => { load(); }, [load]);

  const DB_COLS = new Set(["id","author_id","author_name","title","tagline","logline","genre_tags","origin","status","cover_color","emoji","chapters","rating","views","langs","protagonist","antagonist","setting","script","character_brief","themes","central_conflict","chapter_one_hook","visual_style_notes","story_arc","comparable_works","created_at","updated_at"]);
  const sanitize = (obj) => Object.fromEntries(Object.entries(obj).filter(([k]) => DB_COLS.has(k)));

  const upsert = useCallback(async (raw) => {
    const now  = new Date().toISOString();
    const story = { ...raw, author_id:userId, updated_at:now };
    if (!story.id) story.id = `story_${Date.now()}_${Math.random().toString(36).slice(2,7)}`;
    if (!story.created_at) story.created_at = now;
    setStories(prev => {
      const idx = prev.findIndex(s => s.id === story.id);
      return idx >= 0 ? prev.map(s => s.id === story.id ? story : s) : [story, ...prev];
    });
    lsSet(userId, lsGet(userId).map(s => s.id === story.id ? story : s).concat(
      lsGet(userId).find(s => s.id === story.id) ? [] : [story]
    ));
    if (!DEMO && token) {
      try {
        const exists = lsGet(userId).find(s => s.id === raw.id);
        if (exists && raw.id) await sb.patch("stories", story.id, sanitize(story), token);
        else await sb.post("stories", sanitize(story), token);
      } catch (e) {
        if (e.message?.includes("JWT") || e.message?.includes("expired") || e.message?.includes("401")) {
          console.warn("Auth token expired — data saved locally. Please sign out and back in.");
        } else {
          console.warn("Supabase sync failed, kept local:", e.message);
        }
      }
    }
    return story;
  }, [token, userId]);

  const remove = useCallback(async (id) => {
    setStories(prev => prev.filter(s => s.id !== id));
    lsSet(userId, lsGet(userId).filter(s => s.id !== id));
    if (!DEMO && token) await sb.del("stories", id, token).catch(() => {});
  }, [token, userId]);

  return { stories, busy, upsert, remove, reload: load };
}


