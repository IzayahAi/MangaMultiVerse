import { useTheme } from "../ThemeContext.jsx";
import { LINE, CONTROL_ROOM, surfaceLabel } from "../lib/agents.js";

// The factory floor, drawn from the agent registry. The production LINE is a row
// of clickable stations (selecting one opens its bench tool); the CONTROL ROOM
// brains sit below, supervising the line. `active` highlights the open station.
export default function FactoryMap({ active, onPick }) {
  const C = useTheme();

  return (
    <div style={{ marginBottom: 22 }}>
      {/* The production line */}
      <div style={{ fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10 }}>
        Production line
      </div>
      <div style={{ display: "flex", alignItems: "stretch", gap: 6, flexWrap: "wrap" }}>
        {LINE.map((s, i) => (
          <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 6, flex: "1 1 150px" }}>
            <button
              onClick={() => onPick?.(s.id)}
              title={s.blurb}
              style={{
                flex: 1, textAlign: "left", cursor: "pointer", fontFamily: "inherit",
                padding: "12px 12px", borderRadius: 12,
                border: `0.5px solid ${active === s.id ? C.purple : C.border}`,
                background: active === s.id ? `linear-gradient(135deg,${C.purple}22,${C.pink}0c)` : C.card,
                boxShadow: active === s.id ? `0 0 0 1px ${C.purple}55` : "none",
                transition: "all .15s",
              }}
            >
              <div style={{ fontSize: 9, color: C.muted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 5 }}>
                {s.order} · {s.stage}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 6 }}>
                <span style={{ fontSize: 17 }}>{s.icon}</span>
                <span style={{ fontSize: 13, fontWeight: active === s.id ? 600 : 500, color: active === s.id ? C.purple : C.text }}>{s.name}</span>
              </div>
              <span style={{ fontSize: 9, color: s.standalone ? C.teal : C.muted, border: `0.5px solid ${s.standalone ? C.teal + "66" : C.border}`, borderRadius: 5, padding: "1px 6px" }}>
                {surfaceLabel(s)}
              </span>
            </button>
            {i < LINE.length - 1 && (
              <span style={{ color: C.border2, fontSize: 15, flexShrink: 0 }}>→</span>
            )}
          </div>
        ))}
      </div>

      {/* The control room */}
      <div style={{ fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: "0.1em", margin: "18px 0 10px" }}>
        Control room <span style={{ textTransform: "none", letterSpacing: 0 }}>— supervises the line (on the Dashboard)</span>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {CONTROL_ROOM.map((a) => (
          <div key={a.id} title={a.blurb} style={{ flex: "1 1 150px", padding: "10px 12px", borderRadius: 10, border: `0.5px dashed ${C.border2}`, background: C.bg }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <span style={{ fontSize: 15 }}>{a.icon}</span>
              <span style={{ fontSize: 12, fontWeight: 500, color: C.text }}>{a.name}</span>
            </div>
            <div style={{ fontSize: 10, color: C.muted, marginTop: 3 }}>{a.role}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
