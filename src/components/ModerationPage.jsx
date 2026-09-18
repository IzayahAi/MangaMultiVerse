import { useState, useEffect } from "react";
import { useTheme } from "../ThemeContext.jsx";
import { fetchReports, resolveReport, moderateStory } from "../lib/supabase.js";
import { Btn, Spinner, Tag } from "./UI.jsx";

// Admin moderation: reader reports + one-click hide/restore/dismiss (no hand-editing Supabase).
export default function ModerationPage({ token, onModerated }) {
  const C = useTheme();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);

  const load = async () => { setLoading(true); setRows(await fetchReports(token)); setLoading(false); };
  useEffect(() => { load(); }, [token]);

  const act = async (r, kind) => {
    setBusy(r.id);
    try {
      if (kind === "hide") { await moderateStory(r.story_id, "draft", token); await resolveReport(r.id, "actioned", token); }
      else if (kind === "restore") { await moderateStory(r.story_id, "published", token); await resolveReport(r.id, "actioned", token); }
      else if (kind === "dismiss") { await resolveReport(r.id, "dismissed", token); }
      onModerated?.();
      await load();
    } catch {}
    setBusy(null);
  };

  const when = (t) => { try { return new Date(t).toLocaleString(); } catch { return t; } };
  const statusColor = (s) => s === "open" ? C.gold : s === "actioned" ? "#e24b4a" : C.muted;
  const openCount = rows.filter(r => r.status === "open").length;

  return (
    <div style={{ maxWidth: 900, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 18, flexWrap: "wrap", gap: 8 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: `linear-gradient(135deg,${C.purple},${C.pink})`, boxShadow: `0 0 8px ${C.purple}88` }} />
            <div style={{ fontSize: 11, color: C.purple, textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 500 }}>Admin · Moderation</div>
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, fontFamily: "'Cinzel',serif", color: C.text }}>⚑ Reports</div>
          <div style={{ fontSize: 13, color: C.muted, marginTop: 4 }}>{openCount ? `${openCount} open report${openCount > 1 ? "s" : ""} needing review.` : "Reader reports on published stories."}</div>
        </div>
        <Btn onClick={load} disabled={loading} sx={{ fontSize: 12 }}>{loading ? <Spinner size={13} /> : "↻ Refresh"}</Btn>
      </div>

      {loading && <div style={{ color: C.muted, fontSize: 13, display: "flex", alignItems: "center", gap: 10, padding: 20 }}><Spinner size={16} /> Loading…</div>}

      {!loading && rows.length === 0 && (
        <div style={{ padding: 28, background: C.card, border: `0.5px dashed ${C.border2}`, borderRadius: 14, color: C.muted, fontSize: 13, textAlign: "center", lineHeight: 1.6 }}>
          No reports 🎉 — or the <b>reports</b> table isn't created yet (run <code>db/reports.sql</code> in Supabase).
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {rows.map((r) => (
          <div key={r.id} style={{ background: C.surf, border: `0.5px solid ${r.status === "open" ? C.gold + "66" : C.border}`, borderRadius: 10, padding: "12px 14px" }}>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <Tag c={statusColor(r.status)}>{r.status}</Tag>
              <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{r.story_title || r.story_id}</span>
              <span style={{ fontSize: 12, color: C.muted, flex: 1 }}>· {r.reason || "no reason given"}</span>
              <span style={{ fontSize: 10, color: C.muted, whiteSpace: "nowrap" }}>{when(r.created_at)}</span>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              {r.status === "open" && <>
                <Btn v="pri" onClick={() => act(r, "hide")} disabled={busy === r.id} sx={{ fontSize: 11 }}>{busy === r.id ? <Spinner size={11} /> : "🚫 Hide story"}</Btn>
                <Btn onClick={() => act(r, "dismiss")} disabled={busy === r.id} sx={{ fontSize: 11 }}>Dismiss</Btn>
              </>}
              {r.status === "actioned" && <Btn onClick={() => act(r, "restore")} disabled={busy === r.id} sx={{ fontSize: 11 }}>↺ Restore story</Btn>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
