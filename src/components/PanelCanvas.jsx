import { useRef, useEffect, useState } from "react";
import { useTheme } from "../ThemeContext.jsx";
import { Btn } from "./UI.jsx";

// In-app drawing studio for a manga panel. Tools: brush (hard/soft) + opacity, eraser, straight
// line, rectangle, ellipse (fill or outline), paint-bucket flood fill, eyedropper, and LAYERS
// (add / hide / reorder / merge / delete). White manga page; exports a flattened PNG that the caller
// uploads to the panel-art bucket, the same path as uploaded/generated art.
//
// Model: each layer is an offscreen transparent canvas. The visible <canvas> is a composite of the
// white page + all visible layers (bottom→top), recomposited on every change. Drawing happens on the
// active layer. Undo/redo stores a before-snapshot of whichever layer an action changed.

let _lid = 0;
const nextId = () => `L${++_lid}`;

export default function PanelCanvas({ aspect = 0.75, initialImage = null, onSave, onClose }) {
  const C = useTheme();
  const W = 768;
  const H = Math.max(256, Math.min(1536, Math.round(W / (aspect || 0.75))));

  const displayRef = useRef(null);
  const layerCanvases = useRef({});           // id -> offscreen HTMLCanvasElement
  const drawing = useRef(false);
  const startPt = useRef({ x: 0, y: 0 });
  const lastPt = useRef({ x: 0, y: 0 });
  const undoStack = useRef([]);               // [{ id, data: ImageData }] — before-snapshots
  const redoStack = useRef([]);
  const pendingBefore = useRef(null);         // { id, data } captured at stroke start

  const [layers, setLayers] = useState([{ id: "L0", name: "Layer 1", visible: true }]);
  const [activeId, setActiveId] = useState("L0");
  const [tool, setTool] = useState("brush");  // brush|eraser|line|rect|ellipse|fill|pick
  const [brushStyle, setBrushStyle] = useState("hard"); // hard|soft
  const [shapeFill, setShapeFill] = useState(false);
  const [color, setColor] = useState("#111111");
  const [size, setSize] = useState(6);
  const [opacity, setOpacity] = useState(1);
  const [, force] = useState(0);
  const rerender = () => force(n => n + 1);

  const mkCanvas = () => { const c = document.createElement("canvas"); c.width = W; c.height = H; return c; };
  const layerCtx = (id) => layerCanvases.current[id]?.getContext("2d");
  // Always resolve the ACTIVE layer through the live ref (S.current) — the window-bound pointer
  // handlers capture a stale `activeId` from their first render, so reading the state var directly
  // would draw mid-stroke segments onto whatever layer was active when the listener was bound.
  const activeCtx = () => layerCtx(S.current.activeId);

  // Live refs so window listeners always see current tool/settings.
  const S = useRef({});
  S.current = { tool, brushStyle, shapeFill, color, size, opacity, activeId, layers };

  // ── setup ──────────────────────────────────────────────────────────────────────
  useEffect(() => {
    _lid = 0;
    layerCanvases.current = { L0: mkCanvas() };
    const d = displayRef.current; d.width = W; d.height = H;
    if (initialImage && typeof initialImage === "string" && initialImage.startsWith("data:")) {
      const img = new Image();
      img.onload = () => { try { layerCtx("L0").drawImage(img, 0, 0, W, H); } catch {} composite(); };
      img.onerror = composite;
      img.src = initialImage;
    } else composite();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── compositing ──────────────────────────────────────────────────────────────────
  const composite = (preview) => {
    const ctx = displayRef.current.getContext("2d");
    ctx.save(); ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, W, H);
    for (const L of S.current.layers) { if (L.visible && layerCanvases.current[L.id]) ctx.drawImage(layerCanvases.current[L.id], 0, 0); }
    if (preview) preview(ctx);
    ctx.restore();
  };

  // ── helpers ──────────────────────────────────────────────────────────────────────
  const pos = (e) => {
    const r = displayRef.current.getBoundingClientRect();
    const cx = e.touches ? e.touches[0].clientX : e.clientX;
    const cy = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: (cx - r.left) * (W / r.width), y: (cy - r.top) * (H / r.height) };
  };
  const hexToRgba = (hex, a) => {
    const h = String(hex).replace("#", "");
    const f = h.length === 3 ? h.split("").map(c => c + c).join("") : h;
    const n = parseInt(f, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, Math.round(a * 255)];
  };
  const applyStroke = (ctx, eraser) => {
    ctx.globalCompositeOperation = eraser ? "destination-out" : "source-over";
    ctx.globalAlpha = eraser ? 1 : (S.current.brushStyle === "soft" ? S.current.opacity * 0.55 : S.current.opacity);
    ctx.strokeStyle = S.current.color; ctx.fillStyle = S.current.color;
    ctx.lineWidth = eraser ? S.current.size * 2.4 : S.current.size;
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    if (!eraser && S.current.brushStyle === "soft") { ctx.shadowBlur = S.current.size * 0.9; ctx.shadowColor = S.current.color; }
    else ctx.shadowBlur = 0;
  };
  const resetCtx = (ctx) => { ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over"; ctx.shadowBlur = 0; };

  const drawShape = (ctx, a, b, which) => {
    ctx.save();
    ctx.globalAlpha = S.current.opacity; ctx.strokeStyle = S.current.color; ctx.fillStyle = S.current.color;
    ctx.lineWidth = S.current.size; ctx.lineCap = "round"; ctx.lineJoin = "round";
    if (which === "line") { ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
    else if (which === "rect") { const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y), w = Math.abs(b.x - a.x), h = Math.abs(b.y - a.y); S.current.shapeFill ? ctx.fillRect(x, y, w, h) : ctx.strokeRect(x, y, w, h); }
    else if (which === "ellipse") { const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2, rx = Math.abs(b.x - a.x) / 2, ry = Math.abs(b.y - a.y) / 2; ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); S.current.shapeFill ? ctx.fill() : ctx.stroke(); }
    ctx.restore();
  };

  const floodFill = (ctx, px, py) => {
    const sx = Math.max(0, Math.min(W - 1, Math.floor(px))), sy = Math.max(0, Math.min(H - 1, Math.floor(py)));
    const img = ctx.getImageData(0, 0, W, H); const data = img.data;
    const at = (x, y) => (y * W + x) * 4;
    const si = at(sx, sy);
    const tr = data[si], tg = data[si + 1], tb = data[si + 2], ta = data[si + 3];
    const [fr, fg, fb, fa] = hexToRgba(S.current.color, S.current.opacity);
    if (Math.abs(tr - fr) < 2 && Math.abs(tg - fg) < 2 && Math.abs(tb - fb) < 2 && Math.abs(ta - fa) < 2) return;
    const tol = 40 * 40;
    const match = (i) => { const dr = data[i] - tr, dg = data[i + 1] - tg, db = data[i + 2] - tb, da = data[i + 3] - ta; return dr * dr + dg * dg + db * db + da * da <= tol; };
    const stack = [[sx, sy]];
    while (stack.length) {
      const [cx, cy] = stack.pop();
      if (cx < 0 || cy < 0 || cx >= W || cy >= H) continue;
      const i = at(cx, cy); if (!match(i)) continue;
      data[i] = fr; data[i + 1] = fg; data[i + 2] = fb; data[i + 3] = fa;
      stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
    }
    ctx.putImageData(img, 0, 0);
  };

  // ── history ──────────────────────────────────────────────────────────────────────
  const snapBefore = () => { const id = S.current.activeId; const ctx = layerCtx(id); if (ctx) pendingBefore.current = { id, data: ctx.getImageData(0, 0, W, H) }; };
  const commitHistory = () => {
    if (!pendingBefore.current) return;
    undoStack.current.push(pendingBefore.current);
    if (undoStack.current.length > 24) undoStack.current.shift();
    redoStack.current = []; pendingBefore.current = null; rerender();
  };
  const doUndo = () => {
    const e = undoStack.current.pop(); if (!e) return;
    const ctx = layerCtx(e.id); if (!ctx) { rerender(); return; }
    redoStack.current.push({ id: e.id, data: ctx.getImageData(0, 0, W, H) });
    ctx.putImageData(e.data, 0, 0); composite(); rerender();
  };
  const doRedo = () => {
    const e = redoStack.current.pop(); if (!e) return;
    const ctx = layerCtx(e.id); if (!ctx) { rerender(); return; }
    undoStack.current.push({ id: e.id, data: ctx.getImageData(0, 0, W, H) });
    ctx.putImageData(e.data, 0, 0); composite(); rerender();
  };

  // ── pointer handling ──────────────────────────────────────────────────────────────
  const onDown = (e) => {
    e.preventDefault();
    const p = pos(e); const t = S.current.tool;
    if (t === "pick") { const d = displayRef.current.getContext("2d").getImageData(p.x, p.y, 1, 1).data; const hex = "#" + [d[0], d[1], d[2]].map(v => v.toString(16).padStart(2, "0")).join(""); setColor(hex); setTool("brush"); return; }
    if (t === "fill") { snapBefore(); floodFill(activeCtx(), p.x, p.y); composite(); commitHistory(); return; }
    drawing.current = true; startPt.current = p; lastPt.current = p; snapBefore();
    if (t === "brush" || t === "eraser") { const ctx = activeCtx(); applyStroke(ctx, t === "eraser"); ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + 0.01, p.y); ctx.stroke(); resetCtx(ctx); composite(); }
  };
  const onMove = (e) => {
    if (!drawing.current) return;
    const p = pos(e); const t = S.current.tool;
    if (t === "brush" || t === "eraser") {
      const ctx = activeCtx(); applyStroke(ctx, t === "eraser");
      ctx.beginPath(); ctx.moveTo(lastPt.current.x, lastPt.current.y); ctx.lineTo(p.x, p.y); ctx.stroke(); resetCtx(ctx);
      lastPt.current = p; composite();
    } else if (t === "line" || t === "rect" || t === "ellipse") {
      composite((ctx) => drawShape(ctx, startPt.current, p, t));
    }
  };
  const onUp = (e) => {
    if (!drawing.current) return; drawing.current = false;
    const t = S.current.tool;
    if (t === "line" || t === "rect" || t === "ellipse") { const p = lastPtFromEvent(e); drawShape(activeCtx(), startPt.current, p, t); composite(); }
    commitHistory();
  };
  const lastPtFromEvent = (e) => { try { return pos(e.changedTouches ? { touches: e.changedTouches } : e); } catch { return lastPt.current; } };

  useEffect(() => {
    const move = (e) => onMove(e);
    const up = (e) => onUp(e);
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    window.addEventListener("touchmove", move, { passive: false });
    window.addEventListener("touchend", up);
    return () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); window.removeEventListener("touchmove", move); window.removeEventListener("touchend", up); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── layer ops ──────────────────────────────────────────────────────────────────────
  const addLayer = () => { const id = nextId(); layerCanvases.current[id] = mkCanvas(); setLayers(ls => [...ls, { id, name: `Layer ${ls.length + 1}`, visible: true }]); setActiveId(id); };
  const delLayer = (id) => {
    if (layers.length <= 1) return;
    delete layerCanvases.current[id];
    setLayers(ls => { const next = ls.filter(l => l.id !== id); if (id === activeId) setActiveId(next[next.length - 1].id); return next; });
    setTimeout(composite, 0);
  };
  const toggleVis = (id) => { setLayers(ls => ls.map(l => l.id === id ? { ...l, visible: !l.visible } : l)); setTimeout(composite, 0); };
  const moveLayer = (id, dir) => {
    setLayers(ls => { const i = ls.findIndex(l => l.id === id); const j = i + dir; if (i < 0 || j < 0 || j >= ls.length) return ls; const n = [...ls]; [n[i], n[j]] = [n[j], n[i]]; return n; });
    setTimeout(composite, 0);
  };
  const mergeDown = (id) => {
    setLayers(ls => {
      const i = ls.findIndex(l => l.id === id); if (i <= 0) return ls;
      const below = ls[i - 1];
      try { layerCtx(below.id).drawImage(layerCanvases.current[id], 0, 0); } catch {}
      delete layerCanvases.current[id];
      const next = ls.filter(l => l.id !== id);
      if (id === activeId) setActiveId(below.id);
      return next;
    });
    setTimeout(composite, 0);
  };

  const clearActive = () => { snapBefore(); const ctx = activeCtx(); ctx.clearRect(0, 0, W, H); composite(); commitHistory(); };
  const save = () => {
    // Flatten visible layers onto white and export.
    const out = mkCanvas(); const ctx = out.getContext("2d");
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, W, H);
    for (const L of layers) { if (L.visible && layerCanvases.current[L.id]) ctx.drawImage(layerCanvases.current[L.id], 0, 0); }
    try { onSave?.(out.toDataURL("image/png")); } catch (e) { console.warn("canvas export failed:", e.message); }
  };

  // ── UI ───────────────────────────────────────────────────────────────────────────
  const PALETTE = ["#111111", "#ffffff", "#e0533d", "#f0a830", "#2e8b57", "#2d6cdf", "#8e44ad", "#d81b7a"];
  const tb = (active) => ({ fontSize: 12, padding: "6px 10px", borderRadius: 7, border: `0.5px solid ${active ? C.purple : C.border}`, background: active ? C.purple + "22" : "transparent", color: active ? C.purpleL : C.muted, cursor: "pointer", fontFamily: "inherit" });
  const TOOLS = [["brush", "✒ Brush"], ["eraser", "⌫ Eraser"], ["line", "╱ Line"], ["rect", "▭ Rect"], ["ellipse", "◯ Ellipse"], ["fill", "🪣 Fill"], ["pick", "💧 Pick"]];
  const shapesActive = tool === "rect" || tool === "ellipse";

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: C.surf, border: `0.5px solid ${C.border}`, borderRadius: 14, padding: 14, maxWidth: "min(96vw, 900px)", width: "100%", maxHeight: "94vh", display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>✏️ Draw panel</div>
          <div style={{ display: "flex", gap: 6 }}>
            <Btn onClick={onClose} sx={{ fontSize: 12 }}>Cancel</Btn>
            <Btn v="pri" onClick={save} sx={{ fontSize: 12 }}>Use this drawing</Btn>
          </div>
        </div>

        {/* Tools */}
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
          {TOOLS.map(([id, lbl]) => <button key={id} onClick={() => setTool(id)} style={tb(tool === id)}>{lbl}</button>)}
        </div>

        {/* Settings */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          {tool === "brush" && (
            <div style={{ display: "flex", gap: 5 }}>
              <button onClick={() => setBrushStyle("hard")} style={tb(brushStyle === "hard")}>Hard</button>
              <button onClick={() => setBrushStyle("soft")} style={tb(brushStyle === "soft")}>Soft</button>
            </div>
          )}
          {shapesActive && (
            <div style={{ display: "flex", gap: 5 }}>
              <button onClick={() => setShapeFill(false)} style={tb(!shapeFill)}>Outline</button>
              <button onClick={() => setShapeFill(true)} style={tb(shapeFill)}>Fill</button>
            </div>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            {PALETTE.map(c => <button key={c} onClick={() => setColor(c)} title={c} style={{ width: 20, height: 20, borderRadius: "50%", background: c, cursor: "pointer", border: color === c ? `2px solid ${C.purple}` : `1px solid ${C.border2}` }} />)}
            <input type="color" value={color} onChange={e => setColor(e.target.value)} title="Custom color" style={{ width: 24, height: 24, padding: 0, border: "none", background: "none", cursor: "pointer" }} />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ fontSize: 11, color: C.muted }}>Size</span>
            <input type="range" min={1} max={60} value={size} onChange={e => setSize(Number(e.target.value))} style={{ width: 80 }} />
            <span style={{ fontSize: 11, color: C.muted, width: 16 }}>{size}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ fontSize: 11, color: C.muted }}>Opacity</span>
            <input type="range" min={10} max={100} value={Math.round(opacity * 100)} onChange={e => setOpacity(Number(e.target.value) / 100)} style={{ width: 70 }} />
            <span style={{ fontSize: 11, color: C.muted, width: 26 }}>{Math.round(opacity * 100)}%</span>
          </div>
          <div style={{ display: "flex", gap: 5, marginLeft: "auto" }}>
            <button onClick={doUndo} disabled={!undoStack.current.length} style={tb(false)}>↶</button>
            <button onClick={doRedo} disabled={!redoStack.current.length} style={tb(false)}>↷</button>
            <button onClick={clearActive} style={tb(false)}>Clear</button>
          </div>
        </div>

        {/* Canvas + layers */}
        <div style={{ flex: 1, minHeight: 0, display: "flex", gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", justifyContent: "center", background: C.bg, borderRadius: 10, padding: 10, overflow: "auto" }}>
            <canvas ref={displayRef} onMouseDown={onDown} onTouchStart={onDown}
              style={{ background: "#fff", borderRadius: 4, boxShadow: "0 2px 12px rgba(0,0,0,0.35)", cursor: tool === "pick" ? "copy" : "crosshair", maxWidth: "100%", maxHeight: "66vh", aspectRatio: `${W} / ${H}`, touchAction: "none" }} />
          </div>

          {/* Layers panel */}
          <div style={{ width: 168, flexShrink: 0, display: "flex", flexDirection: "column", gap: 8, background: C.bg, borderRadius: 10, padding: 10 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: C.text, textTransform: "uppercase", letterSpacing: "0.06em" }}>Layers</span>
              <button onClick={addLayer} title="Add layer" style={tb(false)}>＋</button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 5, overflowY: "auto" }}>
              {[...layers].reverse().map(L => (
                <div key={L.id} onClick={() => setActiveId(L.id)}
                  style={{ padding: "6px 8px", borderRadius: 7, border: `0.5px solid ${L.id === activeId ? C.purple : C.border}`, background: L.id === activeId ? C.purple + "18" : C.card, cursor: "pointer" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <button onClick={e => { e.stopPropagation(); toggleVis(L.id); }} title={L.visible ? "Hide" : "Show"} style={{ border: "none", background: "none", cursor: "pointer", fontSize: 12, padding: 0 }}>{L.visible ? "👁" : "🚫"}</button>
                    <span style={{ flex: 1, fontSize: 11, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{L.name}</span>
                  </div>
                  <div style={{ display: "flex", gap: 3, marginTop: 5 }}>
                    <button onClick={e => { e.stopPropagation(); moveLayer(L.id, 1); }} title="Up" style={{ ...tb(false), padding: "2px 6px", fontSize: 10 }}>↑</button>
                    <button onClick={e => { e.stopPropagation(); moveLayer(L.id, -1); }} title="Down" style={{ ...tb(false), padding: "2px 6px", fontSize: 10 }}>↓</button>
                    <button onClick={e => { e.stopPropagation(); mergeDown(L.id); }} title="Merge down" style={{ ...tb(false), padding: "2px 6px", fontSize: 10 }}>⥥</button>
                    <button onClick={e => { e.stopPropagation(); delLayer(L.id); }} disabled={layers.length <= 1} title="Delete" style={{ ...tb(false), padding: "2px 6px", fontSize: 10, color: "#e0533d" }}>🗑</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
