import { useState, useEffect } from "react";
import { useTheme } from "../ThemeContext.jsx";
import { addInboxItem, fetchInbox, resolveInboxItem, addDailyLog, fetchDailyLogs } from "../lib/supabase.js";
import { runSynthesis } from "../lib/claude.js";
import { Btn, Spinner, Tag } from "./UI.jsx";

// Mr. K — the founder's Chief of Staff. Two views: the Inbox (idea captures, triaged) and the Daily Log
// (a dated record of each session). Backed by db/cos_inbox.sql + db/cos_daily_logs.sql.
export default function MrKPage({ token }) {
  const C = useTheme();
  const [view, setView] = useState("inbox");

  return (
    <div style={{ maxWidth: 820, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: `linear-gradient(135deg,${C.purple},${C.pink})`, boxShadow: `0 0 8px ${C.purple}88` }} />
        <div style={{ fontSize: 11, color: C.purple, textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 500 }}>Chief of Staff</div>
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, fontFamily: "'Cinzel',serif", color: C.text, marginBottom: 14 }}>🎩 Mr. K</div>

      {/* View tabs */}
      <div style={{ display: "flex", gap: 4, borderBottom: `0.5px solid ${C.border}`, marginBottom: 18 }}>
        {[["inbox", "Inbox"], ["log", "Daily Log"]].map(([id, label]) => (
          <button key={id} onClick={() => setView(id)} style={{ padding: "8px 16px", fontSize: 13, border: "none", borderBottom: view === id ? `2px solid ${C.purple}` : "2px solid transparent", background: "transparent", color: view === id ? C.purple : C.muted, cursor: "pointer", fontFamily: "inherit", fontWeight: view === id ? 600 : 400 }}>{label}</button>
        ))}
      </div>

      {view === "inbox" ? <Inbox C={C} token={token} /> : <DailyLog C={C} token={token} />}
    </div>
  );
}

function Inbox({ C, token }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const [draft, setDraft] = useState("");
  const [adding, setAdding] = useState(false);

  const load = async () => { setLoading(true); setRows(await fetchInbox(token)); setLoading(false); };
  useEffect(() => { load(); }, [token]);

  const add = async () => {
    const t = draft.trim();
    if (!t) return;
    setAdding(true);
    try { await addInboxItem(t, "ui", token); setDraft(""); await load(); } catch {}
    setAdding(false);
  };
  const act = async (r, status) => { setBusy(r.id); try { await resolveInboxItem(r.id, status, token); await load(); } catch {} setBusy(null); };

  const when = (t) => { try { return new Date(t).toLocaleString(); } catch { return t; } };
  const open = rows.filter(r => r.status === "open");
  const done = rows.filter(r => r.status !== "open");
  const statusColor = (s) => s === "open" ? C.gold : s === "triaged" ? C.teal : C.muted;

  return (
    <div>
      <div style={{ fontSize: 13, color: C.muted, marginBottom: 14 }}>{open.length ? `${open.length} open capture${open.length > 1 ? "s" : ""} to triage.` : "Jot ideas and follow-ups here — triage them when you're ready."}</div>
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        <input value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={e => { if (e.key === "Enter") add(); }} placeholder="Capture an idea or follow-up…"
          style={{ flex: 1, padding: "10px 12px", borderRadius: 9, border: `0.5px solid ${C.border2}`, background: C.card, color: C.text, fontSize: 13, fontFamily: "inherit", outline: "none" }} />
        <Btn v="pri" onClick={add} disabled={adding || !draft.trim()} sx={{ fontSize: 12 }}>{adding ? <Spinner size={13} /> : "＋ Capture"}</Btn>
      </div>

      {loading && <div style={{ color: C.muted, fontSize: 13, display: "flex", alignItems: "center", gap: 10, padding: 20 }}><Spinner size={16} /> Loading…</div>}
      {!loading && rows.length === 0 && (
        <div style={{ padding: 28, background: C.card, border: `0.5px dashed ${C.border2}`, borderRadius: 14, color: C.muted, fontSize: 13, textAlign: "center", lineHeight: 1.6 }}>
          Nothing captured yet — or the <b>cos_inbox</b> table isn't created (run <code>db/cos_inbox.sql</code>).
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {open.map(r => (
          <div key={r.id} style={{ background: C.surf, border: `0.5px solid ${C.gold}66`, borderRadius: 10, padding: "12px 14px" }}>
            <div style={{ display: "flex", gap: 10, alignItems: "flex-start", flexWrap: "wrap" }}>
              <Tag c={statusColor(r.status)}>{r.status}</Tag>
              <span style={{ fontSize: 13, color: C.text, flex: 1, minWidth: 200 }}>{r.text}</span>
              <span style={{ fontSize: 10, color: C.muted, whiteSpace: "nowrap" }}>{r.source === "session" ? "Mr. K · " : ""}{when(r.created_at)}</span>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <Btn v="pri" onClick={() => act(r, "triaged")} disabled={busy === r.id} sx={{ fontSize: 11 }}>{busy === r.id ? <Spinner size={11} /> : "✓ Triaged"}</Btn>
              <Btn onClick={() => act(r, "dismissed")} disabled={busy === r.id} sx={{ fontSize: 11 }}>Dismiss</Btn>
            </div>
          </div>
        ))}
      </div>

      {done.length > 0 && (
        <>
          <div style={{ fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: "0.08em", margin: "22px 0 8px" }}>Resolved</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {done.map(r => (
              <div key={r.id} style={{ background: C.card, border: `0.5px solid ${C.border}`, borderRadius: 9, padding: "9px 12px", display: "flex", gap: 10, alignItems: "center", opacity: 0.75 }}>
                <Tag c={statusColor(r.status)}>{r.status}</Tag>
                <span style={{ fontSize: 12.5, color: C.muted, flex: 1, textDecoration: r.status === "dismissed" ? "line-through" : "none" }}>{r.text}</span>
                <Btn onClick={() => act(r, "open")} disabled={busy === r.id} sx={{ fontSize: 10 }}>↺ Reopen</Btn>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function DailyLog({ C, token }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [adding, setAdding] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [note, setNote] = useState("");

  const load = async () => { setLoading(true); setRows(await fetchDailyLogs(token)); setLoading(false); };
  useEffect(() => { load(); }, [token]);

  const synth = async () => {
    setSyncing(true); setNote("");
    try {
      const r = await runSynthesis();
      if (r?.synthesis) { setNote("Synthesis added below."); await load(); }
      else setNote(r?.message || r?.error || "Couldn't run synthesis.");
    } catch { setNote("Couldn't run synthesis."); }
    setSyncing(false);
  };

  const add = async () => {
    const b = body.trim();
    if (!b) return;
    setAdding(true);
    try { await addDailyLog(title.trim(), b, "ui", token); setTitle(""); setBody(""); await load(); } catch {}
    setAdding(false);
  };

  const fmtDate = (d) => { try { return new Date(d + "T00:00:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" }); } catch { return d; } };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <div style={{ fontSize: 13, color: C.muted, flex: 1, minWidth: 220 }}>A dated record of each session — what shipped, what was decided, where things stand. Mr. K writes here at session end; you can add your own.</div>
        <Btn onClick={synth} disabled={syncing} sx={{ fontSize: 11, whiteSpace: "nowrap" }}>{syncing ? <><Spinner size={11} /> Synthesizing…</> : "🔎 Run synthesis now"}</Btn>
      </div>
      {note && <div style={{ fontSize: 12, color: C.muted, marginBottom: 12 }}>{note}</div>}

      <div style={{ background: C.surf, border: `0.5px solid ${C.border}`, borderRadius: 12, padding: 12, marginBottom: 22 }}>
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Entry title (optional)"
          style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `0.5px solid ${C.border2}`, background: C.card, color: C.text, fontSize: 13, fontFamily: "inherit", outline: "none", marginBottom: 8, boxSizing: "border-box" }} />
        <textarea value={body} onChange={e => setBody(e.target.value)} placeholder="What happened today…" rows={4}
          style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `0.5px solid ${C.border2}`, background: C.card, color: C.text, fontSize: 13, fontFamily: "inherit", outline: "none", resize: "vertical", boxSizing: "border-box" }} />
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
          <Btn v="pri" onClick={add} disabled={adding || !body.trim()} sx={{ fontSize: 12 }}>{adding ? <Spinner size={13} /> : "＋ Add entry"}</Btn>
        </div>
      </div>

      {loading && <div style={{ color: C.muted, fontSize: 13, display: "flex", alignItems: "center", gap: 10, padding: 20 }}><Spinner size={16} /> Loading…</div>}
      {!loading && rows.length === 0 && (
        <div style={{ padding: 28, background: C.card, border: `0.5px dashed ${C.border2}`, borderRadius: 14, color: C.muted, fontSize: 13, textAlign: "center", lineHeight: 1.6 }}>
          No log entries yet — or the <b>cos_daily_logs</b> table isn't created (run <code>db/cos_daily_logs.sql</code>).
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {rows.map(r => (
          <div key={r.id} style={{ background: C.surf, border: `0.5px solid ${C.border}`, borderRadius: 12, padding: "14px 16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
              <Tag c={C.purple}>{fmtDate(r.log_date)}</Tag>
              {r.title && <span style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{r.title}</span>}
              {r.source === "session" && <span style={{ fontSize: 10, color: C.muted }}>· Mr. K</span>}
            </div>
            <div style={{ fontSize: 13, color: C.text, lineHeight: 1.65, whiteSpace: "pre-wrap" }}>{r.body}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
