import { useTheme } from "../ThemeContext.jsx";
import { LINE, CONTROL_ROOM, MAINTENANCE, surfaceLabel } from "../lib/agents.js";

// The factory floor, drawn from the agent registry. Three zones: the production
// LINE (clickable stations — selecting one opens its bench tool), the CONTROL ROOM
// brains that supervise it, and the MAINTENANCE wing that keeps the app healthy.
// `active` highlights the open station. `onOpenMaintenance` jumps to the wing's page.
export default function FactoryMap({ active, onPick, onOpenMaintenance }) {
  const C = useTheme();
  const waveColor = { P0: "#e24b4a", P1: C.gold, P2: C.muted };

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

      {/* The maintenance wing */}
      <div style={{ fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: "0.1em", margin: "18px 0 10px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
        <span>🔧 Maintenance wing <span style={{ textTransform: "none", letterSpacing: 0 }}>— keeps the app healthy (runs on the daily cron)</span></span>
        {onOpenMaintenance && (
          <button onClick={onOpenMaintenance} style={{ fontFamily: "inherit", cursor: "pointer", fontSize: 10, textTransform: "none", letterSpacing: 0, color: C.purple, background: "transparent", border: `0.5px solid ${C.purple}55`, borderRadius: 6, padding: "3px 9px" }}>
            Open wing →
          </button>
        )}
      </div>
      {["P0", "P1", "P2"].map((wave) => {
        const items = MAINTENANCE.filter((m) => m.wave === wave);
        if (!items.length) return null;
        return (
          <div key={wave} style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 9, color: waveColor[wave], fontWeight: 700, letterSpacing: "0.08em", marginBottom: 6 }}>{wave}</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {items.map((m) => (
                <div key={m.id} title={m.blurb} style={{ flex: "1 1 150px", padding: "9px 11px", borderRadius: 10, border: `0.5px dashed ${C.border2}`, borderLeft: `2px solid ${waveColor[wave]}`, background: C.bg }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                    <span style={{ fontSize: 14 }}>{m.icon}</span>
                    <span style={{ fontSize: 11.5, fontWeight: 500, color: C.text, flex: 1 }}>{m.name}</span>
                    <span style={{ width: 7, height: 7, borderRadius: "50%", background: m.status === "live" ? C.teal : m.status === "building" ? C.gold : C.muted, flexShrink: 0 }} title={m.status} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
