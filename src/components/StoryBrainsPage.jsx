import { useState, useEffect } from "react";
import { useTheme } from "../ThemeContext.jsx";
import { fetchBible } from "../lib/supabase.js";
import { Btn, Spinner, Tag } from "./UI.jsx";

// A library of every story's living brain (bible) for the signed-in creator — recap, cast, open threads,
// and "where to take it next," in one place. Read-only overview; open a story to edit/continue it.
export default function StoryBrainsPage({ stories = [], onOpenStory }) {
  const C = useTheme();
  const [bibles, setBibles] = useState({});   // { [storyId]: bibleData }
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState(null);  // expanded card

  const ids = stories.map(s => s.id).join(",");
  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      const out = {};
      for (const s of stories) { try { const row = await fetchBible(s.id); if (row?.data) out[s.id] = row.data; } catch {} }
      if (active) { setBibles(out); setLoading(false); }
    })();
    return () => { active = false; };
  }, [ids]);

  const withBrains = stories.filter(s => bibles[s.id]);

  const Section = ({ title, accent, children }) => (
    <div style={{ marginTop: 12 }}>
      <div style={{ fontSize: 9, color: accent, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 5 }}>{title}</div>
      {children}
    </div>
  );

  return (
    <div style={{ maxWidth: 1040, margin: "0 auto" }}>
      <div style={{ marginBottom: 22 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: `linear-gradient(135deg,${C.purple},${C.pink})`, boxShadow: `0 0 8px ${C.purple}88` }} />
          <div style={{ fontSize: 11, color: C.purple, textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 500 }}>Your series memory</div>
        </div>
        <div style={{ fontSize: 22, fontWeight: 700, fontFamily: "'Cinzel',serif", color: C.text }}>🧠 Story Brains</div>
        <div style={{ fontSize: 13, color: C.muted, marginTop: 4 }}>Every story remembers its own canon — cast, threads, open questions — and suggests where to take it next.</div>
      </div>

      {loading && <div style={{ color: C.muted, fontSize: 13, display: "flex", alignItems: "center", gap: 10, padding: 20 }}><Spinner size={16} /> Loading your story brains…</div>}

      {!loading && stories.length === 0 && (
        <div style={{ padding: 28, background: C.card, border: `0.5px dashed ${C.border2}`, borderRadius: 14, color: C.muted, fontSize: 13, textAlign: "center" }}>
          You haven't created a story yet. Make one in the Studio and its brain starts building as you write chapters.
        </div>
      )}

      {!loading && stories.length > 0 && withBrains.length === 0 && (
        <div style={{ padding: 24, background: C.card, border: `0.5px dashed ${C.border2}`, borderRadius: 14, color: C.muted, fontSize: 13, textAlign: "center", lineHeight: 1.6 }}>
          None of your stories have a brain yet. Open a story in the Studio → <b>🧠 Story Brain</b> tab — it reads the chapters and builds one automatically.
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(320px,1fr))", gap: 14 }}>
        {stories.map(s => {
          const b = bibles[s.id];
          const open = openId === s.id;
          const openThreads = (b?.plot_threads || []).filter(t => t.status !== "resolved");
          return (
            <div key={s.id} style={{ background: C.surf, border: `0.5px solid ${C.border}`, borderRadius: 14, padding: 16, display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", gap: 12, marginBottom: 10 }}>
                <div style={{ width: 46, height: 62, borderRadius: 8, background: s.cover_color || C.card, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>{s.emoji || "📖"}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: C.text, lineHeight: 1.3 }}>{s.title || "Untitled"}</div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
                    <Tag c={C.purple}>{s.chapters || 1} ch</Tag>
                    {b && <Tag c={C.teal}>{(b.characters || []).length} cast</Tag>}
                    {b && openThreads.length > 0 && <Tag c={C.gold}>{openThreads.length} open</Tag>}
                    {!b && <Tag c={C.muted}>no brain yet</Tag>}
                  </div>
                </div>
              </div>

              {b ? (
                <>
                  {b.running_recap && <div style={{ fontSize: 12, color: C.text, lineHeight: 1.55, marginBottom: 8 }}>{b.running_recap}</div>}
                  {b.next_directions?.[0] && (
                    <div style={{ padding: "8px 10px", background: C.purple + "10", border: `0.5px solid ${C.purple}30`, borderRadius: 8, marginBottom: 8 }}>
                      <div style={{ fontSize: 9, color: C.purpleL, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 2 }}>Where to take it next</div>
                      <div style={{ fontSize: 11.5, color: C.text, lineHeight: 1.5 }}><b>{b.next_directions[0].title}</b> — {b.next_directions[0].pitch}</div>
                    </div>
                  )}
                  {open && (
                    <div style={{ borderTop: `0.5px solid ${C.border}`, marginTop: 4, paddingTop: 8 }}>
                      {b.characters?.length > 0 && <Section title="Characters" accent={C.purple}>{b.characters.map((c, i) => <div key={i} style={{ fontSize: 11.5, color: C.text, marginBottom: 3 }}><b>{c.name}</b> <span style={{ color: C.muted }}>· {c.role}{c.status ? ` · ${c.status}` : ""}</span></div>)}</Section>}
                      {openThreads.length > 0 && <Section title="Open threads" accent={C.gold}>{openThreads.map((t, i) => <div key={i} style={{ fontSize: 11.5, color: C.text, lineHeight: 1.5, marginBottom: 3 }}>{t.thread}</div>)}</Section>}
                      {b.open_hooks?.length > 0 && <Section title="Open questions" accent={C.teal}><ul style={{ margin: 0, paddingLeft: 16 }}>{b.open_hooks.map((h, i) => <li key={i} style={{ fontSize: 11.5, color: C.text, lineHeight: 1.5 }}>{h}</li>)}</ul></Section>}
                      {b.timeline?.length > 0 && <Section title="Timeline" accent={C.muted}>{b.timeline.map((t, i) => <div key={i} style={{ fontSize: 11, color: C.muted, lineHeight: 1.45 }}>{t}</div>)}</Section>}
                    </div>
                  )}
                </>
              ) : (
                <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.5, marginBottom: 8 }}>Open this story's <b>🧠 Story Brain</b> tab in the Studio to read its chapters and build a brain.</div>
              )}

              <div style={{ display: "flex", gap: 8, marginTop: "auto", paddingTop: 10 }}>
                <Btn v="pri" onClick={() => onOpenStory?.(s)} sx={{ flex: 1, fontSize: 12, justifyContent: "center" }}>Open in Studio</Btn>
                {b && <Btn onClick={() => setOpenId(open ? null : s.id)} sx={{ fontSize: 12 }}>{open ? "Less" : "Details"}</Btn>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
