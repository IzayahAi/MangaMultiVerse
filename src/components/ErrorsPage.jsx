import { useState, useEffect } from "react";
import { useTheme } from "../ThemeContext.jsx";
import { fetchErrors } from "../lib/supabase.js";
import { Btn, Spinner, Tag } from "./UI.jsx";

// Admin observability: recent client errors captured by the error sink. So breakage surfaces here
// instead of dying in a tester's console.
export default function ErrorsPage({ token }) {
  const C = useTheme();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState(null);

  const load = async () => { setLoading(true); const r = await fetchErrors(token, 150); setRows(r); setLoading(false); };
  useEffect(() => { load(); }, [token]);

  const when = (t) => { try { return new Date(t).toLocaleString(); } catch { return t; } };
  const levelColor = (l) => l === "warn" ? C.gold : l === "info" ? C.teal : "#e24b4a";

  return (
    <div style={{ maxWidth: 960, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 18, flexWrap: "wrap", gap: 8 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: `linear-gradient(135deg,${C.purple},${C.pink})`, boxShadow: `0 0 8px ${C.purple}88` }} />
            <div style={{ fontSize: 11, color: C.purple, textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 500 }}>Admin · Observability</div>
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, fontFamily: "'Cinzel',serif", color: C.text }}>🐞 Errors</div>
          <div style={{ fontSize: 13, color: C.muted, marginTop: 4 }}>Recent client errors, newest first. {rows.length ? `${rows.length} logged.` : ""}</div>
        </div>
        <Btn onClick={load} disabled={loading} sx={{ fontSize: 12 }}>{loading ? <Spinner size={13} /> : "↻ Refresh"}</Btn>
      </div>

      {loading && <div style={{ color: C.muted, fontSize: 13, display: "flex", alignItems: "center", gap: 10, padding: 20 }}><Spinner size={16} /> Loading…</div>}

      {!loading && rows.length === 0 && (
        <div style={{ padding: 28, background: C.card, border: `0.5px dashed ${C.border2}`, borderRadius: 14, color: C.muted, fontSize: 13, textAlign: "center", lineHeight: 1.6 }}>
          No errors logged 🎉 — or the <b>error_log</b> table hasn't been created yet (run <code>db/error_log.sql</code> in Supabase to start capturing).
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {rows.map((r) => {
          const open = openId === r.id;
          return (
            <div key={r.id} style={{ background: C.surf, border: `0.5px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
              <button onClick={() => setOpenId(open ? null : r.id)} style={{ width: "100%", textAlign: "left", background: "transparent", border: "none", cursor: "pointer", padding: "10px 14px", display: "flex", gap: 10, alignItems: "center", fontFamily: "inherit" }}>
                <Tag c={levelColor(r.level)}>{r.level}</Tag>
                <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.message || "(no message)"}</span>
                <span style={{ fontSize: 10, color: C.muted, whiteSpace: "nowrap" }}>{r.source}</span>
                <span style={{ fontSize: 10, color: C.muted, whiteSpace: "nowrap" }}>{when(r.created_at)}</span>
              </button>
              {open && (
                <div style={{ padding: "0 14px 12px", borderTop: `0.5px solid ${C.border}` }}>
                  {r.url && <div style={{ fontSize: 11, color: C.muted, marginTop: 8, wordBreak: "break-all" }}><b>URL:</b> {r.url}</div>}
                  {r.user_id && <div style={{ fontSize: 11, color: C.muted, marginTop: 3 }}><b>User:</b> {r.user_id}</div>}
                  {r.stack && <pre style={{ fontSize: 11, color: C.text, background: C.bg, borderRadius: 8, padding: 10, marginTop: 8, overflowX: "auto", lineHeight: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{r.stack}</pre>}
                  {r.context && Object.keys(r.context).length > 0 && <pre style={{ fontSize: 11, color: C.muted, background: C.bg, borderRadius: 8, padding: 10, marginTop: 8, overflowX: "auto" }}>{JSON.stringify(r.context, null, 2)}</pre>}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
