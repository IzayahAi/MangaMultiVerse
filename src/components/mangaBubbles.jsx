// Shared manga-style bubble helpers for both readers (Studio preview + published MangaReader).
// ALL-CAPS comic lettering like the One Piece reference; big/action panels get bubbles ON the art,
// quieter beats use the webtoon conversation zone. Everything reads LEFT-TO-RIGHT / top-to-bottom.

export const BUBBLE_FONT = "'Comic Neue','DM Sans',Arial,sans-serif";
export const SHOUT_FONT  = "'Bangers','Comic Neue',Arial,sans-serif";

// ── Character introduction nameplates ──────────────────────────────────────────
// First time a named character appears, drop a manga-style intro card (name + epithet + a short
// descriptor line), like the "RAGNIR THE HAMMER / MYTHICAL / …" plates in One Piece.
const clip = (s, n = 52) => { const t = String(s || "").replace(/\s+/g, " ").trim(); return t.length > n ? t.slice(0, n - 1).trimEnd() + "…" : t; };

// Build { normalizedName: {name, epithet, tag} } from a story's protagonist/antagonist/support cast.
export function buildCharIntros(story) {
  const out = {};
  const add = (name, tag, epithet, desc) => {
    const key = String(name || "").trim().toLowerCase();
    if (!key || out[key]) return;
    out[key] = { name: String(name).trim(), epithet: clip(epithet, 20), tag: clip(tag, 30), desc: clip(desc, 52) };
  };
  const p = story?.protagonist;
  if (p?.name) add(p.name, "Protagonist", p.epithet, p.goal || p.personality);
  const a = story?.antagonist;
  if (a?.name) add(a.name, a.role || "Antagonist", a.epithet, a.motivation);
  (story?.support_characters || story?.script?.support_characters || []).forEach(c => add(c.name, c.role, c.epithet, c.hook || c.want));
  return out;
}

// Map { panelNumber: [intro, …] } for the FIRST panel each character shows up in (by cast, speaker,
// or being named in the scene). Each character gets exactly one card, in reading order.
export function firstAppearances(panels, intros) {
  const byPanel = {}; const seen = new Set();
  const keys = Object.keys(intros || {});
  if (!keys.length) return byPanel;
  for (const panel of Array.isArray(panels) ? panels : []) {
    if (!panel || seen.size === keys.length) break;
    const cast = (Array.isArray(panel.cast) ? panel.cast : []).map(x => String(x).toLowerCase());
    const speakers = (panel.dialogue || []).map(d => String(d.character || "").toLowerCase());
    const scene = String(panel.scene || "").toLowerCase();
    for (const key of keys) {
      if (seen.has(key)) continue;
      const full = intros[key].name.toLowerCase();
      const first = full.split(" ")[0];
      const hit = cast.some(c => c.includes(first)) || speakers.some(c => c.includes(first)) || scene.includes(full) ||
        (first.length >= 4 && new RegExp(`\\b${first.replace(/[^a-z0-9]/gi, "")}\\b`).test(scene));
      if (hit) { seen.add(key); (byPanel[panel.number] ||= []).push(intros[key]); }
    }
  }
  return byPanel;
}

// Manga caption boxes come in two looks: a CLEAN typeset box (white, thin double-ruled border,
// centered serif — the classic manga profile/narration box, the Ragnir reference) used everywhere by
// default, and a COMIC look (cream paper, bold hand-lettering, drop shadow) for the US Comics style.
const CAPTION_BG = "#f5f1e6";      // comic paper
const CAPTION_BORDER = "#141414";
const SERIF = "'Cinzel','Playfair Display','Georgia',serif";

// A small hand-drawn corner swirl/flourish, the classic manga narration-box ornament.
// `pos` picks the corner; the spiral is drawn for the top-left and mirrored for the others.
export function CornerSwirl({ pos = "tl", color = CAPTION_BORDER, size = 15 }) {
  const t = { tl: "", tr: "scaleX(-1)", bl: "scaleY(-1)", br: "scale(-1)" }[pos] || "";
  const corner = {
    tl: { top: -2, left: -2 }, tr: { top: -2, right: -2 },
    bl: { bottom: -2, left: -2 }, br: { bottom: -2, right: -2 },
  }[pos] || { top: -2, left: -2 };
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" style={{ position: "absolute", ...corner, transform: t, pointerEvents: "none" }}>
      {/* a curl that spirals inward from the corner */}
      <path d="M14 2.5 C7 2.5 3 6 3 10 C3 12.4 5 13.4 6.6 12.3 C7.8 11.5 7.6 9.7 6.2 9.5 C5.3 9.4 4.8 10.1 5.1 10.8"
        fill="none" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// A manga narration caption box — clean white square with a thin double-ruled border and a corner
// swirl (the classic manga narration box). `variant="comic"` switches to the cream hand-lettered look.
export function NarrationBox({ children, fs = 14, variant = "manga" }) {
  if (variant === "comic") {
    return (
      <div style={{ position: "relative", background: CAPTION_BG, border: `2px solid ${CAPTION_BORDER}`, boxShadow: "2.5px 2.5px 0 rgba(0,0,0,0.42)", padding: "10px 16px 11px" }}>
        <CornerSwirl pos="tl" /><CornerSwirl pos="br" />
        <div style={{ fontFamily: BUBBLE_FONT, fontStyle: "italic", fontWeight: 700, fontSize: fs, lineHeight: 1.5, color: "#181818", textAlign: "center" }}>{children}</div>
      </div>
    );
  }
  // Identical frame to the intro nameplate (same white box, double-ruled border, shadow, padding) —
  // the ONLY difference is the corner swirls.
  return (
    <div style={{ position: "relative", background: "#fff", border: "1.5px solid #111", padding: 3, boxShadow: "1.5px 1.5px 4px rgba(0,0,0,0.3)" }}>
      <div style={{ position: "relative", border: "1px solid #111", padding: "8px 16px 9px", textAlign: "center" }}>
        <CornerSwirl pos="tl" /><CornerSwirl pos="br" />
        <div style={{ fontFamily: SERIF, fontStyle: "italic", fontWeight: 500, fontSize: fs, lineHeight: 1.5, color: "#141414", textAlign: "center" }}>{children}</div>
      </div>
    </div>
  );
}

// The manga nameplate — the Ragnir box. Default MANGA variant: clean white card, thin double-ruled
// border, centered serif (name + epithet headline, classification, descriptor). COMIC variant: the
// cream hand-lettered plate for the US Comics art style.
export function CharIntroCard({ intro, index = 0, variant = "manga" }) {
  if (!intro) return null;
  const headline = intro.epithet ? `${intro.name} ${intro.epithet}` : intro.name;
  const wrap = { position: "absolute", left: 8, bottom: 8 + index * 76, zIndex: 15, maxWidth: "66%", pointerEvents: "none" };
  if (variant === "comic") {
    return (
      <div style={{ ...wrap, background: CAPTION_BG, border: `2px solid ${CAPTION_BORDER}`, boxShadow: "3px 3px 0 rgba(0,0,0,0.5)", padding: "7px 14px 9px" }}>
        <div style={{ fontFamily: SHOUT_FONT, fontSize: 21, lineHeight: 0.98, color: "#111", letterSpacing: "0.02em", textTransform: "uppercase" }}>{headline}</div>
        {intro.tag && <div style={{ fontFamily: BUBBLE_FONT, fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.11em", color: "#b11226", marginTop: 3 }}>{intro.tag}</div>}
        {intro.desc && <div style={{ fontFamily: BUBBLE_FONT, fontSize: 9.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "#3a3a3a", marginTop: 2, lineHeight: 1.2 }}>{intro.desc}</div>}
      </div>
    );
  }
  // MANGA (default) — clean typeset white box with a double-ruled border, everything centered.
  return (
    <div style={{ ...wrap, background: "#fff", border: "1.5px solid #111", padding: 3, boxShadow: "1.5px 1.5px 4px rgba(0,0,0,0.3)" }}>
      <div style={{ border: "1px solid #111", padding: "8px 16px 9px", textAlign: "center" }}>
        <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 16, lineHeight: 1.08, color: "#111", letterSpacing: "0.04em", textTransform: "uppercase" }}>{headline}</div>
        {intro.tag && <div style={{ fontFamily: SERIF, fontSize: 9.5, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.14em", color: "#111", marginTop: 5 }}>{intro.tag}</div>}
        {intro.desc && <div style={{ fontFamily: SERIF, fontSize: 8.5, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.07em", color: "#222", marginTop: 3, lineHeight: 1.3 }}>{intro.desc}</div>}
      </div>
    </div>
  );
}
export const STARBURST = "polygon(50% 0%,60% 12%,75% 5%,72% 22%,90% 20%,80% 35%,98% 42%,82% 50%,98% 60%,80% 65%,90% 82%,72% 78%,75% 95%,60% 88%,50% 100%,40% 88%,25% 95%,28% 78%,10% 82%,20% 65%,2% 60%,18% 50%,2% 42%,20% 35%,10% 20%,28% 22%,25% 5%,40% 12%)";

// A scalloped-rounded-rectangle cloud for THOUGHT bubbles. Shallow bumps (b=5 of a 100 box) keep
// the INNER area ~90% of the box so the text fits; preserveAspectRatio="none" fills any text box;
// vectorEffect keeps the stroke crisp at any size.
const CLOUD_PATH = "M 5 5 a 7.5 5 0 0 1 15 0 a 7.5 5 0 0 1 15 0 a 7.5 5 0 0 1 15 0 a 7.5 5 0 0 1 15 0 a 7.5 5 0 0 1 15 0 a 7.5 5 0 0 1 15 0 a 5 11.25 0 0 1 0 22.5 a 5 11.25 0 0 1 0 22.5 a 5 11.25 0 0 1 0 22.5 a 5 11.25 0 0 1 0 22.5 a 7.5 5 0 0 1 -15 0 a 7.5 5 0 0 1 -15 0 a 7.5 5 0 0 1 -15 0 a 7.5 5 0 0 1 -15 0 a 7.5 5 0 0 1 -15 0 a 7.5 5 0 0 1 -15 0 a 5 11.25 0 0 1 0 -22.5 a 5 11.25 0 0 1 0 -22.5 a 5 11.25 0 0 1 0 -22.5 a 5 11.25 0 0 1 0 -22.5 z";

// Classic manga thought cloud: scalloped white (or villain-dark) bubble with the little
// trailing dots. `children` is the (already-uppercased by us) text.
export function ThoughtCloud({ children, stroke = "#111", bg = "#fff", color = "#0a0a0a", fs = 15, dots = true }) {
  // The cloud is drawn LARGER than the text box (negative insets) so the scalloped edge always
  // sits outside the words — the bubble grows to fit the text, never the other way around.
  return (
    <div style={{ position: "relative", display: "inline-block", maxWidth: "min(100%, 260px)" }}>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: "absolute", top: -4, left: -8, width: "calc(100% + 16px)", height: "calc(100% + 8px)", filter: "drop-shadow(0 2px 6px rgba(0,0,0,0.32))" }}>
        <path d={CLOUD_PATH} fill={bg} stroke={stroke} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      </svg>
      <div style={{ position: "relative", padding: "12px 20px", textAlign: "center" }}>
        <div style={{ fontFamily: BUBBLE_FONT, textTransform: "uppercase", fontWeight: 700, fontStyle: "italic", fontSize: fs, lineHeight: 1.2, color }}>{children}</div>
      </div>
      {dots && (
        <div style={{ position: "absolute", bottom: -18, left: 8, display: "flex", flexDirection: "column", gap: 3 }}>
          {[6, 4, 2.5].map((s, i) => <div key={i} style={{ width: s, height: s, borderRadius: "50%", background: bg, border: `2px solid ${stroke}` }} />)}
        </div>
      )}
    </div>
  );
}

// A SPREAD panel holds 2-4 sub-scene ("shots") images composited in one frame.
export const spreadShots = (panel) => {
  const s = Array.isArray(panel?.shots) ? panel.shots.filter(x => typeof x === "string" && x.trim().length > 3) : [];
  return s.length >= 2 ? s.slice(0, 4) : null;
};
// Grid layout for a spread: 2 → side by side, 3 → one wide on top + two below, 4 → 2×2.
export const spreadCellSpan = (n, i) => (n === 3 && i === 0 ? { gridColumn: "1 / -1" } : {});

// A "big" panel (full-page or an action beat) gets bubbles ON the art, manga-style.
export const isBigPanel = (p) =>
  p?.panel_type === "full_page" ||
  /action|fight|battle|impact|clash|explos|rage|fury|chaos|storm|slash|strike|blast/i.test(String(p?.mood || ""));

// On-art manga bubbles for a big panel. `lines` = cleaned speech/thought lines.
// Numbered when several, so the eye follows Western reading order.
export function onArtBubbles(lines, mood, fs) {
  const n = lines.length;
  if (!n) return null;
  // Corner/edge anchors keep bubbles OFF the center where faces & bodies usually sit.
  // Reading order: top-left → top-right → bottom-left → bottom-right.
  const SLOTS = [
    { pos: { top: "3%",    left: "3%" },  bottom: false },
    { pos: { top: "3%",    right: "3%" }, bottom: false },
    { pos: { bottom: "3%", left: "3%" },  bottom: true },
    { pos: { bottom: "3%", right: "3%" }, bottom: true },
  ];
  return lines.map((d, i) => {
    const isThought = d.type === "thought";
    const isVillain = /villain|antagonist|enemy|evil/i.test(d.character || "");
    const isShout = !isThought && (/!!|\?!|[A-Z]{4,}/.test(d.text || "") || /action|fight|battle|impact|clash|rage|fury|blast/i.test(String(mood || "")));
    const S = SLOTS[i % SLOTS.length];
    const row = Math.floor(i / SLOTS.length);
    const pos = { ...S.pos };
    if (row) { if (pos.top) pos.top = `${parseFloat(pos.top) + row * 16}%`; if (pos.bottom) pos.bottom = `${parseFloat(pos.bottom) + row * 16}%`; }
    const badgeRight = pos.right !== undefined;
    const bottomTail = S.bottom;
    const bg = isVillain ? "#1a0010" : "#fff";
    const tc = isVillain ? "#ffd9ec" : "#0a0a0a";
    const stroke = isVillain ? "#e84393" : "#111";
    let inner;
    if (isThought) {
      inner = <ThoughtCloud bg={bg} stroke={stroke} color={tc} fs={Math.max(13, fs)}>{d.text}</ThoughtCloud>;
    } else {
      const shape = isShout ? { clipPath: STARBURST } : { borderRadius: "48% / 40%" };
      const outline = isShout
        ? { filter: "drop-shadow(0 0 1.5px #000) drop-shadow(0 0 1.5px #000) drop-shadow(0 2px 5px rgba(0,0,0,0.45))" }
        : { border: `2.5px solid ${stroke}`, boxShadow: "0 2px 9px rgba(0,0,0,0.45)" };
      inner = (
        <div style={{ background: bg, padding: isShout ? "15px 20px" : "10px 15px", textAlign: "center", ...shape, ...outline }}>
          <div style={{ fontFamily: isShout ? SHOUT_FONT : BUBBLE_FONT, textTransform: "uppercase", fontWeight: isShout ? 400 : 700, fontSize: isShout ? Math.max(17, fs + 4) : Math.max(13, fs), lineHeight: 1.12, color: tc, letterSpacing: isShout ? "0.02em" : "0" }}>{d.text}</div>
        </div>
      );
    }
    return (
      <div key={i} style={{ position: "absolute", zIndex: 10, ...pos, minWidth: 92, maxWidth: "44%", pointerEvents: "none" }}>
        <div style={{ position: "relative" }}>
          {n > 1 && <span style={{ position: "absolute", top: -8, [badgeRight ? "right" : "left"]: -8, width: 18, height: 18, borderRadius: "50%", background: "#111", color: "#fff", fontSize: 10, lineHeight: "18px", textAlign: "center", fontWeight: 800, zIndex: 3 }}>{i + 1}</span>}
          {inner}
          {/* SPEECH TAIL — points toward the likely speaker: down for top-anchored bubbles, up for bottom ones */}
          {!isThought && (bottomTail ? (
            <>
              <div style={{ position: "absolute", top: -12, left: "50%", marginLeft: -8, width: 0, height: 0, borderLeft: "8px solid transparent", borderRight: "8px solid transparent", borderBottom: `13px solid ${stroke}` }} />
              <div style={{ position: "absolute", top: -8, left: "50%", marginLeft: -5, width: 0, height: 0, borderLeft: "5px solid transparent", borderRight: "5px solid transparent", borderBottom: `9px solid ${bg}`, zIndex: 2 }} />
            </>
          ) : (
            <>
              <div style={{ position: "absolute", bottom: -12, left: "50%", marginLeft: -8, width: 0, height: 0, borderLeft: "8px solid transparent", borderRight: "8px solid transparent", borderTop: `13px solid ${stroke}` }} />
              <div style={{ position: "absolute", bottom: -8, left: "50%", marginLeft: -5, width: 0, height: 0, borderLeft: "5px solid transparent", borderRight: "5px solid transparent", borderTop: `9px solid ${bg}`, zIndex: 2 }} />
            </>
          ))}
        </div>
      </div>
    );
  });
}
