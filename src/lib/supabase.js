import { useState, useEffect, useCallback } from "react";

const SB_URL = import.meta.env.VITE_SUPABASE_URL || "https://your-project.supabase.co";
const SB_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "your-anon-key";
export const DEMO = SB_URL.includes("your-project");

const sb = {
  h: (tok) => ({ "apikey":SB_KEY, "Authorization":`Bearer ${tok||SB_KEY}`, "Content-Type":"application/json", "Prefer":"return=representation" }),
  async rpc(path, body, tok) {
    const r = await fetch(`${SB_URL}${path}`, { method:"POST", headers:this.h(tok), body:JSON.stringify(body) });
    return r.json();
  },
  async get(table, qs, tok) {
    const r = await fetch(`${SB_URL}/rest/v1/${table}${qs||""}`, { headers:this.h(tok) });
    if (!r.ok) throw new Error((await r.json()).message);
    return r.json();
  },
  async post(table, body, tok) {
    const r = await fetch(`${SB_URL}/rest/v1/${table}`, { method:"POST", headers:this.h(tok), body:JSON.stringify(body) });
    if (!r.ok) throw new Error((await r.json()).message);
    return r.json();
  },
  async patch(table, id, body, tok) {
    const r = await fetch(`${SB_URL}/rest/v1/${table}?id=eq.${id}`, { method:"PATCH", headers:this.h(tok), body:JSON.stringify(body) });
    if (!r.ok) throw new Error((await r.json()).message);
    return r.json();
  },
  async del(table, id, tok) {
    await fetch(`${SB_URL}/rest/v1/${table}?id=eq.${id}`, { method:"DELETE", headers:this.h(tok) });
  },
};

export async function signUp(email, password, username) {
  if (DEMO) return { user:{ id:`demo_${Date.now()}`, email, username }, token:"demo" };
  const r = await sb.rpc("/auth/v1/signup", { email, password, data:{ username } });
  console.log("signUp response:", JSON.stringify(r));
  if (r.error) throw new Error(r.error.message || r.error);
  if (r.msg) throw new Error(r.msg);
  const authUser = r.user ?? r.data?.user;
  const token    = r.access_token ?? r.data?.session?.access_token ?? r.session?.access_token;
  if (!authUser?.id) throw new Error("Check your email to confirm your account, then sign in.");
  try { await sb.post("profiles", { id:authUser.id, username, email, role:"creator", credits:840 }, token); } catch(e){ console.warn("profile insert:", e); }
  return { user:{ id:authUser.id, email, username, role:"creator", credits:840 }, token };
}

export async function signIn(email, password) {
  if (DEMO) return { user:{ id:`demo_${email.replace(/\W/g,"")}`, email, username:email.split("@")[0], role:"creator", credits:840 }, token:"demo" };
  const res = await fetch(`${SB_URL}/auth/v1/token?grant_type=password`, {
    method:"POST",
    headers:{ "apikey":SB_KEY, "Content-Type":"application/json" },
    body:JSON.stringify({ email, password }),
  });
  const r = await res.json();
  console.log("signIn response:", JSON.stringify(r));
  if (!res.ok || r.error) throw new Error(r.error_description || r.message || r.error || "Sign in failed");
  const authUser = r.user ?? r.data?.user;
  const token      = r.access_token ?? r.data?.session?.access_token ?? r.session?.access_token;
  const refreshTok  = r.refresh_token ?? r.data?.session?.refresh_token ?? r.session?.refresh_token;
  if (!authUser?.id) throw new Error("No user returned — please try again");
  let profile = {};
  try { const rows = await sb.get("profiles", `?id=eq.${authUser.id}`, token); profile = rows[0] || {}; } catch(e){ console.warn("profile fetch:", e); }
  return { user:{ id:authUser.id, email, username:profile.username||email.split("@")[0], role:profile.role||"creator", credits:profile.credits||840 }, token, refreshToken: refreshTok };
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


