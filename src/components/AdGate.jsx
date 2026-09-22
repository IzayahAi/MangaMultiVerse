import { useState, useEffect } from "react";

// 15-second interstitial ad gate shown while reading (free/ad-supported viewers only — see MangaReader).
// SCAFFOLD: the box below is a placeholder. To wire a real ad network later, render its unit into
// `#mv-ad-slot` (e.g. Google Ad Manager / a video ad SDK) and call onDone when the ad completes.
export default function AdGate({ seconds = 15, onDone }) {
  const [left, setLeft] = useState(seconds);

  useEffect(() => {
    const t = setInterval(() => setLeft((s) => (s <= 1 ? 0 : s - 1)), 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1500, background: "rgba(0,0,0,0.92)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ width: "100%", maxWidth: 640, textAlign: "center" }}>
        <div style={{ fontSize: 10, letterSpacing: "0.2em", textTransform: "uppercase", color: "rgba(255,255,255,0.4)", marginBottom: 10 }}>Advertisement</div>
        {/* Real ad network renders into this slot; the placeholder shows until then. */}
        <div id="mv-ad-slot" style={{ aspectRatio: "16/9", background: "linear-gradient(135deg,#1a1a2e,#16213e)", borderRadius: 12, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, border: "0.5px solid rgba(255,255,255,0.1)" }}>
          <div style={{ fontSize: 34, color: "rgba(255,255,255,0.5)" }}>▶</div>
          <div style={{ color: "rgba(255,255,255,0.55)", fontSize: 13 }}>Ad slot ({seconds}s) — your ad network renders here</div>
        </div>
        <div style={{ marginTop: 16, minHeight: 40 }}>
          {left > 0
            ? <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 13 }}>Continue in {left}s…</div>
            : <button onClick={onDone} style={{ padding: "10px 28px", borderRadius: 8, background: "linear-gradient(135deg,#7c3aed,#ec4899)", border: "none", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Continue reading →</button>}
        </div>
        <div style={{ marginTop: 14, fontSize: 11, color: "rgba(255,255,255,0.35)" }}>Reading free with ads · <span style={{ color: "#a78bfa" }}>Go ad-free with a paid plan</span></div>
      </div>
    </div>
  );
}
