import { useState } from "react";
import { useTheme } from "../ThemeContext.jsx";
import { setAgeVerified } from "../constants.js";
import { Btn } from "./UI.jsx";

// Age gate for Mature (18+) content — mature THEMES, not explicit. Self-attested birth year (standard for
// mature media). On confirm (18+), persists verification so it isn't asked again. onVerified/onCancel.
export default function AgeGate({ onVerified, onCancel }) {
  const C = useTheme();
  const [year, setYear] = useState("");
  const [err, setErr] = useState("");
  const thisYear = new Date().getFullYear();

  const confirm = () => {
    const y = parseInt(year, 10);
    if (!y || y < 1900 || y > thisYear) { setErr("Enter a valid birth year."); return; }
    if (thisYear - y < 18) { setErr("Sorry — this content is for readers 18 and older."); return; }
    setAgeVerified(true);
    onVerified?.();
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 2000, background: "rgba(0,0,0,0.9)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ background: C.surf, border: `0.5px solid ${C.border2}`, borderRadius: 16, padding: "26px 28px", width: "100%", maxWidth: 400, textAlign: "center" }}>
        <div style={{ fontSize: 30, marginBottom: 8 }}>🔞</div>
        <div style={{ fontSize: 17, fontWeight: 700, color: C.text, fontFamily: "'Cinzel',serif" }}>Mature content</div>
        <div style={{ fontSize: 13, color: C.muted, marginTop: 8, lineHeight: 1.6 }}>
          This story is rated <b style={{ color: "#e24b4a" }}>Mature (18+)</b> — dark or suggestive themes. Confirm your age to continue.
        </div>
        <div style={{ marginTop: 18, textAlign: "left" }}>
          <div style={{ fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>Your birth year</div>
          <input
            type="number" inputMode="numeric" value={year} placeholder="e.g. 1998"
            onChange={(e) => { setYear(e.target.value); setErr(""); }}
            onKeyDown={(e) => e.key === "Enter" && confirm()}
            style={{ width: "100%", padding: "11px 14px", borderRadius: 9, border: `0.5px solid ${err ? "#e24b4a" : C.border2}`, background: C.card, color: C.text, fontSize: 15, fontFamily: "inherit", outline: "none", textAlign: "center" }}
          />
          {err && <div style={{ fontSize: 12, color: "#e24b4a", marginTop: 7 }}>{err}</div>}
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
          <Btn onClick={() => onCancel?.()} sx={{ flex: 1, justifyContent: "center" }}>Go back</Btn>
          <Btn v="pri" onClick={confirm} sx={{ flex: 1, justifyContent: "center" }}>I'm 18 or older</Btn>
        </div>
        <div style={{ fontSize: 10.5, color: C.muted, marginTop: 14, lineHeight: 1.5 }}>Mature = dark/suggestive themes only. No explicit content.</div>
      </div>
    </div>
  );
}
