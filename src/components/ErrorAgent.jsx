import { useState, useEffect } from "react";
import { useTheme } from "../ThemeContext.jsx";
import { fetchErrors } from "../lib/supabase.js";
import { askClaude } from "../lib/claude.js";
import { Btn, Spinner, Tag } from "./UI.jsx";

// The Error Agent — a control-room brain over the error_log. It pulls recent client
// errors, clusters them into distinct problems (client-side, instant), then runs
// Claude to triage: what's breaking, the likely root cause, and the fix. Read-only
// on the data; it never mutates the log.

// Collapse volatile bits (ids, numbers, urls, hex) so the same bug groups together.
const normalize = (msg = "") =>
  msg
    .replace(/https?:\/\/[^\s'")]+/g, "<url>")
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "<id>")
    .replace(/0x[0-9a-f]+/gi, "<hex>")
    .replace(/\b\d{2,}\b/g, "<n>")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);

const P_ERROR_TRIAGE = (clusters) =>
  `You are a senior engineer triaging client-side errors from a React web app (MangaMultiVerse — a manga creation + reading platform, Vite SPA, Supabase backend, AI provider proxies).
Below are clustered error signatures with how many times each occurred. Analyze them.
Return ONLY a raw JSON object. No markdown. No code fences. Start with { end with }.

ERRORS:
${clusters.map((c) => `[${c.id}] x${c.count} (${c.level}, source: ${[...c.sources].join("/") || "?"}) — ${c.sig}${c.sampleStack ? `\n   stack: ${c.sampleStack}` : ""}`).join("\n")}

Produce one issue per distinct problem. Rank by severity, most severe first. Be specific and practical — no boilerplate.
{"health":"one honest sentence on overall app health given these errors","issues":[{"id":<the cluster id number this maps to>,"title":"short human-readable title","severity":"critical|high|medium|low","likely_cause":"the probable root cause in plain terms","suggested_fix":"the concrete next step a developer should take"}]}`;

export default function ErrorAgent({ token }) {
  const C = useTheme();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [triaging, setTriaging] = useState(false);
  const [report, setReport] = useState(null);

  const load = async () => {
    setLoading(true); setReport(null);
    const r = await fetchErrors(token, 200);
    setRows(Array.isArray(r) ? r : []);
    setLoading(false);
  };
  useEffect(() => { load(); }, [token]);

  // Cluster rows by normalized message signature.
  const clusters = (() => {
    const map = new Map();
    rows.forEach((r) => {
      const sig = normalize(r.message || "(no message)");
      let c = map.get(sig);
      if (!c) { c = { sig, count: 0, level: r.level || "error", sources: new Set(), latest: r.created_at, sampleStack: "" }; map.set(sig, c); }
      c.count++;
      if (r.source) c.sources.add(r.source);
      if (!c.sampleStack && r.stack) c.sampleStack = String(r.stack).split("\n").slice(0, 2).join(" ").slice(0, 220);
      if (r.created_at > c.latest) c.latest = r.created_at;
      if ((r.level === "error") && c.level !== "error") c.level = "error";
    });
    return [...map.values()].sort((a, b) => b.count - a.count).map((c, i) => ({ ...c, id: i }));
  })();

  const triage = async () => {
    if (!clusters.length) return;
    setTriaging(true); setReport(null);
    const r = await askClaude(P_ERROR_TRIAGE(clusters.slice(0, 20)), () => {});
    setReport(r);
    setTriaging(false);
  };

  const sevColor = { critical: "#e24b4a", high: C.gold, medium: C.teal, low: C.muted };
  const sevRank = { critical: 0, high: 1, medium: 2, low: 3 };
  const when = (t) => { try { return new Date(t).toLocaleString(); } catch { return t; } };
  const issues = (report?.issues || []).slice().sort((a, b) => (sevRank[a.severity] ?? 9) - (sevRank[b.severity] ?? 9));

  return (
    <div style={{ maxWidth: 960, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 18, flexWrap: "wrap", gap: 8 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: `linear-gradient(135deg,${C.purple},${C.pink})`, boxShadow: `0 0 8px ${C.purple}88` }} />
            <div style={{ fontSize: 11, color: C.purple, textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 500 }}>Control Room · Reliability</div>
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, fontFamily: "'Cinzel',serif", color: C.text }}>🩺 Error Agent</div>
          <div style={{ fontSize: 13, color: C.muted, marginTop: 4 }}>Reads the error log, clusters failures, and triages what's breaking and why.</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Btn onClick={load} disabled={loading || triaging} sx={{ fontSize: 12 }}>{loading ? <Spinner size={13} /> : "↻ Reload"}</Btn>
          <Btn v="pri" onClick={triage} disabled={loading || triaging || !clusters.length} sx={{ fontSize: 12 }}>{triaging ? <><Spinner size={13} /> Triaging…</> : "🔎 Triage with AI"}</Btn>
        </div>
      </div>

      {/* Summary strip */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 12, marginBottom: 18 }}>
        {[
          { label: "Errors captured", value: rows.length, c: rows.length ? "#e24b4a" : C.teal },
          { label: "Distinct issues", value: clusters.length, c: C.purple },
          { label: "Most frequent", value: clusters[0] ? `×${clusters[0].count}` : "—", c: C.gold },
        ].map((t) => (
          <div key={t.label} style={{ background: C.surf, border: `0.5px solid ${C.border}`, borderRadius: 12, padding: "14px 16px" }}>
            <div style={{ fontSize: 24, fontWeight: 700, color: t.c }}>{t.value}</div>
            <div style={{ fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: "0.06em", marginTop: 2 }}>{t.label}</div>
          </div>
        ))}
      </div>

      {loading && <div style={{ color: C.muted, fontSize: 13, display: "flex", alignItems: "center", gap: 10, padding: 20 }}><Spinner size={16} /> Loading errors…</div>}

      {!loading && rows.length === 0 && (
        <div style={{ padding: 28, background: C.card, border: `0.5px dashed ${C.border2}`, borderRadius: 14, color: C.muted, fontSize: 13, textAlign: "center", lineHeight: 1.6 }}>
          No errors to analyze 🎉 — or the <b>error_log</b> table hasn't been created yet (run <code>db/error_log.sql</code> in Supabase to start capturing).
        </div>
      )}

      {/* AI triage report */}
      {report && (
        <div style={{ marginBottom: 18 }}>
          {report.health && (
            <div style={{ padding: "12px 16px", background: `linear-gradient(135deg,${C.purple}18,${C.pink}0a)`, border: `0.5px solid ${C.purple}44`, borderRadius: 12, fontSize: 13, color: C.text, marginBottom: 12 }}>
              <span style={{ color: C.purple, fontWeight: 600 }}>Assessment:</span> {report.health}
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {issues.map((iss, i) => {
              const cl = clusters.find((c) => c.id === iss.id);
              return (
                <div key={i} style={{ background: C.surf, border: `0.5px solid ${C.border}`, borderRadius: 12, padding: 16, borderLeft: `3px solid ${sevColor[iss.severity] || C.muted}` }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
                    <Tag c={sevColor[iss.severity] || C.muted}>{iss.severity}</Tag>
                    <span style={{ fontSize: 14, fontWeight: 600, color: C.text, flex: 1, minWidth: 0 }}>{iss.title}</span>
                    {cl && <span style={{ fontSize: 11, color: C.muted, whiteSpace: "nowrap" }}>×{cl.count}{cl.sources.size ? ` · ${[...cl.sources].join(", ")}` : ""}</span>}
                  </div>
                  {iss.likely_cause && <div style={{ marginBottom: 8 }}><div style={{ fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 3 }}>Likely cause</div><div style={{ fontSize: 13, color: C.text, lineHeight: 1.55 }}>{iss.likely_cause}</div></div>}
                  {iss.suggested_fix && <div><div style={{ fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 3 }}>Suggested fix</div><div style={{ fontSize: 13, color: C.text, lineHeight: 1.55 }}>{iss.suggested_fix}</div></div>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Raw clusters (always available, even before AI) */}
      {!loading && clusters.length > 0 && (
        <div>
          <div style={{ fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Clusters {report ? "(raw)" : "— run triage for root-cause analysis"}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {clusters.map((c) => (
              <div key={c.id} style={{ background: C.card, border: `0.5px solid ${C.border}`, borderRadius: 10, padding: "10px 14px", display: "flex", gap: 10, alignItems: "center" }}>
                <Tag c={c.count >= 5 ? "#e24b4a" : c.count >= 2 ? C.gold : C.muted}>×{c.count}</Tag>
                <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.sig}</span>
                <span style={{ fontSize: 10, color: C.muted, whiteSpace: "nowrap" }}>{when(c.latest)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
