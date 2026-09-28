import { useState, useEffect } from "react";
import { useTheme } from "../ThemeContext.jsx";
import { fetchTodos, addTodo, setTodoDone, deleteTodo } from "../lib/supabase.js";

// The founder's to-do list on the Dashboard overview. Server-backed via Supabase (db/cos_todos.sql)
// so it syncs across devices and Mr. K can write tasks from a session. Updates are optimistic;
// falls back gracefully when the table doesn't exist yet (the empty state points at the SQL).
export default function TodoList({ token }) {
  const C = useTheme();
  const [todos, setTodos] = useState([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = async () => { setLoading(true); setTodos(await fetchTodos(token)); setLoading(false); };
  useEffect(() => { load(); }, [token]);

  const add = async () => {
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true);
    const row = await addTodo(t, "ui", token);
    if (row) { setTodos(prev => [row, ...prev]); setText(""); }
    setBusy(false);
  };
  const toggle = async (row) => {
    const next = !row.done;
    setTodos(prev => prev.map(x => x.id === row.id ? { ...x, done: next } : x));
    await setTodoDone(row.id, next, token);
  };
  const remove = async (row) => {
    setTodos(prev => prev.filter(x => x.id !== row.id));
    await deleteTodo(row.id, token);
  };
  const clearDone = async () => {
    const doneRows = todos.filter(t => t.done);
    setTodos(prev => prev.filter(t => !t.done));
    for (const r of doneRows) await deleteTodo(r.id, token);
  };

  const remaining = todos.filter(t => !t.done).length;
  // Undone first; Array.sort is stable so server order (newest first) holds within each group.
  const ordered = [...todos].sort((a, b) => (a.done === b.done ? 0 : a.done ? 1 : -1));

  return (
    <div style={{ background: C.surf, border: `0.5px solid ${C.border}`, borderRadius: 14, padding: 18, marginBottom: 22 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>✓ To-do</div>
        <div style={{ fontSize: 11, color: C.muted }}>{loading ? "…" : `${remaining} open`}</div>
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <input
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") add(); }}
          placeholder="Add a task…"
          style={{ flex: 1, padding: "9px 12px", borderRadius: 8, border: `0.5px solid ${C.border2}`, background: C.card, color: C.text, fontSize: 13, fontFamily: "inherit", outline: "none" }}
        />
        <button onClick={add} disabled={!text.trim() || busy} style={{ padding: "9px 16px", borderRadius: 8, border: "none", background: text.trim() && !busy ? C.purple : C.card, color: text.trim() && !busy ? "#fff" : C.muted, fontSize: 13, fontWeight: 500, cursor: text.trim() && !busy ? "pointer" : "default", fontFamily: "inherit" }}>Add</button>
      </div>

      {loading ? (
        <div style={{ fontSize: 12, color: C.muted, marginTop: 14, textAlign: "center" }}>Loading…</div>
      ) : todos.length === 0 ? (
        <div style={{ fontSize: 12, color: C.muted, marginTop: 14, textAlign: "center", lineHeight: 1.6 }}>
          No tasks yet — add one above.<br />
          <span style={{ fontSize: 11 }}>If this stays empty, run <code>db/cos_todos.sql</code> in Supabase to enable sync.</span>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 12 }}>
          {ordered.map(t => (
            <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 8, background: C.card, border: `0.5px solid ${C.border}` }}>
              <input type="checkbox" checked={t.done} onChange={() => toggle(t)} style={{ accentColor: C.purple, cursor: "pointer", width: 15, height: 15, flexShrink: 0 }} />
              <span style={{ flex: 1, fontSize: 13, color: t.done ? C.muted : C.text, textDecoration: t.done ? "line-through" : "none", wordBreak: "break-word" }}>{t.text}{t.source === "session" || t.source === "synthesis" ? <span style={{ fontSize: 10, color: C.purple, marginLeft: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>Mr. K</span> : null}</span>
              <button onClick={() => remove(t)} title="Delete" style={{ background: "transparent", border: "none", color: C.muted, cursor: "pointer", fontSize: 17, lineHeight: 1, flexShrink: 0 }}>×</button>
            </div>
          ))}
        </div>
      )}

      {todos.some(t => t.done) && (
        <div style={{ marginTop: 10, textAlign: "right" }}>
          <button onClick={clearDone} style={{ fontSize: 11, color: C.muted, background: "transparent", border: "none", cursor: "pointer", fontFamily: "inherit" }}>Clear completed</button>
        </div>
      )}
    </div>
  );
}
