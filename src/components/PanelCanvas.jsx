import { useRef, useEffect, useState } from "react";
import { useTheme } from "../ThemeContext.jsx";
import { Btn } from "./UI.jsx";

// In-app sketch canvas for drawing a manga panel directly (no external app needed). Pen/brush,
// eraser, color, brush size, undo/redo, clear. White page (manga default); eraser paints white.
// On save it exports the canvas to a PNG data URL — the caller uploads it to the panel-art bucket,
// the same path as an uploaded drawing. Starts blank; `initialImage` (a data: URL only, to avoid
// cross-origin canvas tainting) pre-loads existing art to draw over.
export default function PanelCanvas({ aspect = 0.75, initialImage = null, onSave, onClose }) {
  const C = useTheme();
  const canvasRef = useRef(null);
  const ctxRef = useRef(null);
  const drawing = useRef(false);
  const last = useRef({ x: 0, y: 0 });
  const history = useRef([]);   // ImageData snapshots (index 0 = blank)
  const redo = useRef([]);
  const [tool, setTool] = useState("brush");
  const [color, setColor] = useState("#111111");
  const [size, setSize] = useState(6);
  const [, force] = useState(0); // re-render for undo/redo enabled state

  const W = 768;
  const H = Math.max(256, Math.min(1536, Math.round(W / (aspect || 0.75))));

  // Set up the canvas once, paint the white page, optionally load a data: URL to draw over.
  useEffect(() => {
    const cv = canvasRef.current;
    cv.width = W; cv.height = H;
    const ctx = cv.getContext("2d");
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, W, H);
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctxRef.current = ctx;
    const finish = () => { snapshot(); };
    if (initialImage && typeof initialImage === "string" && initialImage.startsWith("data:")) {
      const img = new Image();
      img.onload = () => { try { ctx.drawImage(img, 0, 0, W, H); } catch {} finish(); };
      img.onerror = finish;
      img.src = initialImage;
    } else { finish(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const snapshot = () => {
    try {
      history.current.push(ctxRef.current.getImageData(0, 0, W, H));
      if (history.current.length > 40) history.current.shift();
      redo.current = [];
      force(n => n + 1);
    } catch {}
  };

  const pos = (e) => {
    const r = canvasRef.current.getBoundingClientRect();
    const cx = e.touches ? e.touches[0].clientX : e.clientX;
    const cy = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: (cx - r.left) * (W / r.width), y: (cy - r.top) * (H / r.height) };
  };
  const stroke = (e) => {
    if (!drawing.current) return;
    const ctx = ctxRef.current; const p = pos(e);
    ctx.strokeStyle = tool === "eraser" ? "#ffffff" : color;
    ctx.lineWidth = tool === "eraser" ? size * 2.4 : size;
    ctx.beginPath(); ctx.moveTo(last.current.x, last.current.y); ctx.lineTo(p.x, p.y); ctx.stroke();
    last.current = p;
  };
  const down = (e) => { e.preventDefault(); drawing.current = true; last.current = pos(e); stroke(e); };
  const up = () => { if (drawing.current) { drawing.current = false; snapshot(); } };

  // Draw continues even if the pointer leaves the canvas; end on a global release.
  useEffect(() => {
    const move = (e) => stroke(e);
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    window.addEventListener("touchmove", move, { passive: false });
    window.addEventListener("touchend", up);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      window.removeEventListener("touchmove", move);
      window.removeEventListener("touchend", up);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool, color, size]);

  const doUndo = () => {
    if (history.current.length <= 1) return;
    redo.current.push(history.current.pop());
    ctxRef.current.putImageData(history.current[history.current.length - 1], 0, 0);
    force(n => n + 1);
  };
  const doRedo = () => {
    if (!redo.current.length) return;
    const img = redo.current.pop();
    history.current.push(img);
    ctxRef.current.putImageData(img, 0, 0);
    force(n => n + 1);
  };
  const clear = () => { const ctx = ctxRef.current; ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, W, H); snapshot(); };
  const save = () => { try { onSave?.(canvasRef.current.toDataURL("image/png")); } catch (e) { console.warn("canvas export failed:", e.message); } };

  const PALETTE = ["#111111", "#ffffff", "#e0533d", "#f0a830", "#2e8b57", "#2d6cdf", "#8e44ad", "#d81b7a"];
  const toolBtn = (active) => ({ fontSize: 12, padding: "6px 12px", borderRadius: 7, border: `0.5px solid ${active ? C.purple : C.border}`, background: active ? C.purple + "22" : "transparent", color: active ? C.purpleL : C.muted, cursor: "pointer", fontFamily: "inherit" });

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: C.surf, border: `0.5px solid ${C.border}`, borderRadius: 14, padding: 16, maxWidth: "min(95vw, 760px)", width: "100%", maxHeight: "92vh", display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>✏️ Draw panel</div>
          <div style={{ display: "flex", gap: 6 }}>
            <Btn onClick={onClose} sx={{ fontSize: 12 }}>Cancel</Btn>
            <Btn v="pri" onClick={save} sx={{ fontSize: 12 }}>Use this drawing</Btn>
          </div>
        </div>

        {/* Toolbar */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={() => setTool("brush")} style={toolBtn(tool === "brush")}>✒ Brush</button>
            <button onClick={() => setTool("eraser")} style={toolBtn(tool === "eraser")}>⌫ Eraser</button>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            {PALETTE.map(c => (
              <button key={c} onClick={() => { setColor(c); setTool("brush"); }} title={c}
                style={{ width: 20, height: 20, borderRadius: "50%", background: c, cursor: "pointer", border: color === c && tool === "brush" ? `2px solid ${C.purple}` : `1px solid ${C.border2}` }} />
            ))}
            <input type="color" value={color} onChange={e => { setColor(e.target.value); setTool("brush"); }} title="Custom color" style={{ width: 24, height: 24, padding: 0, border: "none", background: "none", cursor: "pointer" }} />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 11, color: C.muted }}>Size</span>
            <input type="range" min={1} max={40} value={size} onChange={e => setSize(Number(e.target.value))} style={{ width: 90 }} />
            <span style={{ fontSize: 11, color: C.muted, width: 18 }}>{size}</span>
          </div>
          <div style={{ display: "flex", gap: 6, marginLeft: "auto" }}>
            <button onClick={doUndo} disabled={history.current.length <= 1} style={toolBtn(false)}>↶ Undo</button>
            <button onClick={doRedo} disabled={!redo.current.length} style={toolBtn(false)}>↷ Redo</button>
            <button onClick={clear} style={toolBtn(false)}>Clear</button>
          </div>
        </div>

        {/* Canvas */}
        <div style={{ flex: 1, minHeight: 0, display: "flex", alignItems: "center", justifyContent: "center", background: C.bg, borderRadius: 10, padding: 10, overflow: "auto" }}>
          <canvas
            ref={canvasRef}
            onMouseDown={down}
            onTouchStart={down}
            style={{ background: "#fff", borderRadius: 4, boxShadow: "0 2px 12px rgba(0,0,0,0.35)", cursor: "crosshair", maxWidth: "100%", maxHeight: "68vh", aspectRatio: `${W} / ${H}`, touchAction: "none" }}
          />
        </div>
      </div>
    </div>
  );
}
