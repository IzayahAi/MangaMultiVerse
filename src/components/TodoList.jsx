import { useState, useEffect } from "react";
import { useTheme } from "../ThemeContext.jsx";

// A lightweight personal to-do list for the Dashboard overview. Persists per-user
// in localStorage — browser-local, wrapped in try/catch so it never breaks the page.
// TODO(server): move to a Supabase table (like cos_inbox) for cross-device sync +
// a possible Mr. K feed. Local is fine for a single-operator dashboard for now.
export default function TodoList({ userKey = "me" }) {
  const C = useTheme();
  const KEY = `mv_todos_${userKey}`;

  const [todos, setTodos] = useState(() => {
    try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { return []; }
  });
  const [text, setText] = useState("");

  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(todos)); } catch {}
  }, [KEY, todos]);

  const add = () => {
    const t = text.trim();
    if (!t) return;
    setTodos(prev => [{ id: Date.now(), text: t, done: false }, ...prev]);
    setText("");
  };
  const toggle = (id) => setTodos(prev => prev.map(x => x.id === id ? { ...x, done: !x.done } : x));
  const remove = (id) => setTodos(prev => prev.filter(x => x.id !== id));
  const clearDone = () => setTodos(prev => prev.filter(x => !x.done));

  const remaining = todos.filter(t => !t.done).length;
  // Undone first; Array.sort is stable so insertion order holds within each group.
  const ordered = [...todos].sort((a, b) => (a.done === b.done ? 0 : a.done ? 1 : -1));

  return (
    <div style={{ background: C.surf, border: `0.5px solid ${C.border}`, borderRadius: 14, padding: 18, marginBottom: 22 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>✓ To-do</div>
        <div style={{ fontSize: 11, color: C.muted }}>{remaining} open</div>
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <input
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") add(); }}
          placeholder="Add a task…"
          style={{ flex: 1, padding: "9px 12px", borderRadius: 8, border: `0.5px solid ${C.border2}`, background: C.card, color: C.text, fontSize: 13, fontFamily: "inherit", outline: "none" }}
        />
        <button onClick={add} disabled={!text.trim()} style={{ padding: "9px 16px", borderRadius: 8, border: "none", background: text.trim() ? C.purple : C.card, color: text.trim() ? "#fff" : C.muted, fontSize: 13, fontWeight: 500, cursor: text.trim() ? "pointer" : "default", fontFamily: "inherit" }}>Add</button>
      </div>

      {todos.length === 0 ? (
        <div style={{ fontSize: 12, color: C.muted, marginTop: 14, textAlign: "center" }}>No tasks yet — add one above.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 12 }}>
          {ordered.map(t => (
            <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 8, background: C.card, border: `0.5px solid ${C.border}` }}>
              <input type="checkbox" checked={t.done} onChange={() => toggle(t.id)} style={{ accentColor: C.purple, cursor: "pointer", width: 15, height: 15, flexShrink: 0 }} />
              <span style={{ flex: 1, fontSize: 13, color: t.done ? C.muted : C.text, textDecoration: t.done ? "line-through" : "none", wordBreak: "break-word" }}>{t.text}</span>
              <button onClick={() => remove(t.id)} title="Delete" style={{ background: "transparent", border: "none", color: C.muted, cursor: "pointer", fontSize: 17, lineHeight: 1, flexShrink: 0 }}>×</button>
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
