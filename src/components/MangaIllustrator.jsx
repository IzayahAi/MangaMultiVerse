import { useState, useRef, useEffect, useCallback } from "react";
import { useTheme } from "../ThemeContext.jsx";
import { Btn, Spinner, Tag } from "./UI.jsx";
import {
  generatePanelImage, askClaude, askClaudeVision,
  P_STYLE_FROM_ART, P_VOICE_FROM_TEXT, P_NEXT_IDEAS,
} from "../lib/claude.js";
import { uploadPanelArt, fetchBible } from "../lib/supabase.js";
import { PositionedBubble } from "./mangaBubbles.jsx";
import { STYLE_GUIDE, GENRES, rndCover } from "../constants.js";

// ── Illustrator: a blank, creator-driven panel + page maker. The creator uploads/draws their own art
// (or generates a starting image), letters it with their own bubbles, lays panels into a page, and
// publishes into the same library as everything else (origin:"custom"). On publish we study their art
// + lettering into the story brain so AI Studio gets better at their style (see learnStyle).

const STYLE_KEYS = ["JP-EN", "KR-EN", "CN-EN", "US-EN", "GL-EN", "PRISMA"];
const LAYOUTS = [
  { id: "single",  label: "Single",  cols: 1 },
  { id: "2up",     label: "2-up",    cols: 2 },
  { id: "grid",    label: "2×2",     cols: 2 },
  { id: "webtoon", label: "Webtoon", cols: 1 },
];
const BUBBLE_KINDS = [
  { id: "speech",    label: "💬 Speech" },
  { id: "thought",   label: "💭 Thought" },
  { id: "shout",     label: "💥 SFX / Shout" },
  { id: "narration", label: "▭ Narration" },
];
// Map an illustrator bubble kind → the reader's dialogue `type`, so a published custom story still
// shows the creator's text in MangaReader even before it honors saved {x,y} positions.
const BUBBLE_TO_DIALOGUE = { speech: "speech", shout: "sfx", thought: "thought", narration: "narration" };

const uid = () => Math.random().toString(36).slice(2, 9);
const blankPanel = (number, scene = "") => ({ number, panel_type: "half_page", scene, mood: "", cast: [], dialogue: [], bubbles: [] });

export default function MangaIllustrator({ auth, onSaveStory, onSaveBible, setToast, onViewStory }) {
  const C = useTheme();
  const user = auth?.user;

  const [title, setTitle]       = useState("");
  const [logline, setLogline]   = useState("");
  const [genre, setGenre]       = useState("Action");
  const [style, setStyle]       = useState("PRISMA");
  const [layout, setLayout]     = useState("single");
  const [panels, setPanels]     = useState([blankPanel(1)]);
  const [images, setImages]     = useState({});     // { [panelNumber]: url }
  const [sel, setSel]           = useState(1);       // selected panel number
  const [gening, setGening]     = useState(null);    // panel number currently generating
  const [uploading, setUploading] = useState(null);
  const [publishing, setPublishing] = useState(false);
  const [storyId, setStoryId]   = useState(null);
  const [learning, setLearning] = useState(false);
  const [profile, setProfile]   = useState(null);    // { art, lettering }
  const [ideas, setIdeas]       = useState(null);
  const [ideasLoading, setIdeasLoading] = useState(false);
  const fileRef = useRef(null);
  const panelEls = useRef({});   // { [panelNumber]: DOM node } — for bubble drag math

  const mono = style === "JP-EN";
  const cols = LAYOUTS.find(l => l.id === layout)?.cols || 1;
  const selPanel = panels.find(p => p.number === sel) || panels[0];

  const toast = (msg, type = "ok") => setToast?.({ msg, type });
  const requireAuth = () => { if (!user) { toast("Sign in to use the Illustrator.", "warn"); return false; } return true; };

  // ── Panel management ──────────────────────────────────────────────────────────
  const addPanel = () => {
    setPanels(prev => {
      const n = (prev.reduce((m, p) => Math.max(m, p.number), 0) || 0) + 1;
      setSel(n);
      return [...prev, blankPanel(n)];
    });
  };
  const removePanel = (number) => {
    setPanels(prev => prev.length <= 1 ? prev : prev.filter(p => p.number !== number));
    setImages(prev => { const n = { ...prev }; delete n[number]; return n; });
    if (sel === number) setSel(panels.find(p => p.number !== number)?.number || 1);
  };
  const movePanel = (number, dir) => {
    setPanels(prev => {
      const i = prev.findIndex(p => p.number === number);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      const next = [...prev]; [next[i], next[j]] = [next[j], next[i]]; return next;
    });
  };
  const patchPanel = (number, patch) =>
    setPanels(prev => prev.map(p => p.number === number ? { ...p, ...patch } : p));

  // ── Art: upload the creator's own drawing, or generate a starting image ─────────
  const onUpload = async (number, file) => {
    if (!file || !requireAuth()) return;
    setUploading(number);
    try {
      const dataUrl = await new Promise((res, rej) => {
        const r = new FileReader(); r.onload = e => res(e.target.result); r.onerror = rej; r.readAsDataURL(file);
      });
      // Show it immediately (device-local), then upload to the bucket so every reader sees it.
      setImages(prev => ({ ...prev, [number]: dataUrl }));
      const hosted = await uploadPanelArt(dataUrl);
      if (hosted) setImages(prev => ({ ...prev, [number]: hosted }));
      else toast("Uploaded locally — couldn't reach cloud storage, so readers on other devices won't see this panel until it syncs.", "warn");
    } catch (e) { toast("Couldn't read that image: " + e.message, "err"); }
    finally { setUploading(null); }
  };

  const generateStart = async (panel, reroll = false) => {
    if (!requireAuth()) return;
    if (gening) return;
    if (!panel.scene?.trim()) { toast("Describe the panel first — what's happening?", "warn"); return; }
    setGening(panel.number);
    try {
      const castStr = panel.cast?.length ? panel.cast.join(", ") : "no characters";
      const seed = reroll ? Math.floor(Math.random() * 2e9) : (panel.number * 104729) % 2147483647;
      const url = await generatePanelImage(panel.scene, castStr, style, seed);
      if (url) setImages(prev => ({ ...prev, [panel.number]: url }));
      else toast("The image service didn't return art — try again or upload your own.", "warn");
    } catch (e) { toast("Generation failed: " + e.message, "err"); }
    finally { setGening(null); }
  };

  // ── Bubbles (draggable overlay) ─────────────────────────────────────────────────
  const addBubble = (number, kind) => {
    patchPanel(number, { bubbles: [...(panels.find(p => p.number === number)?.bubbles || []), { id: uid(), type: kind, text: "NEW TEXT", character: "", x: 12, y: 12 }] });
  };
  const updateBubble = (number, id, patch) => {
    const p = panels.find(x => x.number === number); if (!p) return;
    patchPanel(number, { bubbles: (p.bubbles || []).map(b => b.id === id ? { ...b, ...patch } : b) });
  };
  const removeBubble = (number, id) => {
    const p = panels.find(x => x.number === number); if (!p) return;
    patchPanel(number, { bubbles: (p.bubbles || []).filter(b => b.id !== id) });
  };

  // Pointer drag — updates the bubble's {x,y} as % of the panel box it lives in.
  const dragRef = useRef(null);
  const startDrag = (e, number, id, boxEl) => {
    e.preventDefault(); e.stopPropagation();
    dragRef.current = { number, id, box: boxEl };
  };
  useEffect(() => {
    const move = (e) => {
      const d = dragRef.current; if (!d?.box) return;
      const r = d.box.getBoundingClientRect();
      const x = Math.max(0, Math.min(92, ((e.clientX - r.left) / r.width) * 100));
      const y = Math.max(0, Math.min(92, ((e.clientY - r.top) / r.height) * 100));
      updateBubble(d.number, d.id, { x, y });
    };
    const up = () => { dragRef.current = null; };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
  }, [panels]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Build + save ────────────────────────────────────────────────────────────────
  // Hosted (http) panel art only — the rule the Studio/reader follow (data: URLs stay device-local).
  const hostedImages = useCallback(() => Object.fromEntries(
    Object.entries(images).filter(([, v]) => typeof v === "string" && v.startsWith("http"))
  ), [images]);

  const buildStory = (status) => {
    // Derive reader-visible dialogue from each panel's bubbles so the text shows in MangaReader.
    const outPanels = panels.map(p => ({
      number: p.number,
      panel_type: p.panel_type || "half_page",
      scene: p.scene || "",
      mood: p.mood || "",
      cast: p.cast || [],
      dialogue: (p.bubbles || []).map(b => ({ character: b.character || "", type: BUBBLE_TO_DIALOGUE[b.type] || "speech", text: b.text || "" })).filter(d => d.text.trim()),
      bubbles: p.bubbles || [],
    }));
    return {
      ...(storyId ? { id: storyId } : {}),
      title: title.trim() || "Untitled",
      logline: logline.trim(),
      tagline: logline.trim().slice(0, 60),
      genre_tags: genre ? [genre] : [],
      origin: "custom",
      author_name: user?.username,
      status,
      emoji: "🎨",
      cover_color: rndCover(),
      chapters: 1,
      content_rating: "all",
      script: {
        art_style: style,
        mono,
        layout: layout === "webtoon" ? "webtoon" : "classic",
        panels: outPanels,
        panel_images: { ...hostedImages() },
      },
    };
  };

  const persistLocal = (id) => {
    try { localStorage.setItem(`mv_panels_${id}`, JSON.stringify(images)); } catch {}
  };

  const saveDraft = async () => {
    if (!requireAuth()) return;
    try {
      const saved = await onSaveStory(buildStory("draft"));
      if (saved?.id) { setStoryId(saved.id); persistLocal(saved.id); }
      toast("Draft saved ✓");
    } catch (e) { toast("Save failed: " + e.message, "err"); }
  };

  const publish = async () => {
    if (!requireAuth()) return;
    if (!title.trim()) { toast("Give your manga a title first.", "warn"); return; }
    setPublishing(true);
    try {
      const saved = await onSaveStory(buildStory("published"));
      const id = saved?.id;
      if (id) { setStoryId(id); persistLocal(id); }
      toast(`"${title}" published to the library! 🎉`);
      // Learn the creator's style into the brain — background, best-effort, never blocks publish.
      if (id) learnStyle(id);
      onViewStory?.(saved);
    } catch (e) { toast("Publish failed: " + e.message, "err"); }
    finally { setPublishing(false); }
  };

  // ── Study the creator's style into the story brain (auto on publish) ────────────
  const learnStyle = async (id) => {
    setLearning(true);
    try {
      const artUrls = Object.values(images).filter(v => typeof v === "string").slice(0, 4);
      const lines = panels.flatMap(p => (p.bubbles || []).map(b => b.text)).filter(t => t && t.trim()).slice(0, 60);
      const [art, voice] = await Promise.all([
        artUrls.length ? askClaudeVision(P_STYLE_FROM_ART(artUrls.length), artUrls, "misc") : Promise.resolve(null),
        lines.length ? askClaude(P_VOICE_FROM_TEXT(lines), () => {}, 2, "misc") : Promise.resolve(null),
      ]);
      const learned = { art: art?.visual_style_notes || "", lettering: voice?.lettering_voice || "" };
      if (!learned.art && !learned.lettering) { setLearning(false); return; }
      setProfile(learned);
      // Persist (all best-effort):
      // 1) Full re-save of the published story so AI Studio reads the style when continuing it —
      //    visual_style_notes (art, steers panel images) + script.lettering_voice (dialogue voice).
      //    A FULL record (buildStory) avoids clobbering the panels a partial script update would wipe.
      try {
        const full = buildStory("published");
        await onSaveStory({ ...full, id, visual_style_notes: learned.art, script: { ...full.script, lettering_voice: learned.lettering, thought_style: voice?.thought_style || "caption" } });
      } catch {}
      // 2) The story brain prefs — the durable creator-style record.
      try {
        const prev = await fetchBible(id);
        await onSaveBible?.(id, prev?.data || {}, { ...(prev?.prefs || {}), style_profile: learned, thought_style: voice?.thought_style || "caption" });
      } catch {}
      // 3) Creator default — pre-seeds the creator's NEXT Studio story so the style compounds.
      try { if (user?.id) localStorage.setItem(`mv_style_${user.id}`, JSON.stringify(learned)); } catch {}
      toast("Learned your style — AI Studio will match it now ✦");
    } catch (e) { console.warn("learnStyle:", e.message); }
    finally { setLearning(false); }
  };

  // ── Next-chapter ideas (text only, no art) ──────────────────────────────────────
  const loadIdeas = async () => {
    if (!storyId) { toast("Save or publish this chapter first, then I can suggest what's next.", "warn"); return; }
    setIdeasLoading(true);
    try {
      const bible = await fetchBible(storyId);
      const seeded = bible?.data?.next_directions;
      if (Array.isArray(seeded) && seeded.length) {
        setIdeas(seeded.map(d => ({ title: d.title, pitch: d.pitch, beats: [], pays_off: [], tone: "" })));
      } else {
        await moreIdeas(bible);
      }
    } catch (e) { toast("Couldn't load ideas: " + e.message, "err"); }
    finally { setIdeasLoading(false); }
  };
  const moreIdeas = async (preloadedBible) => {
    setIdeasLoading(true);
    try {
      const bible = preloadedBible || (storyId ? await fetchBible(storyId) : null);
      const story = { title: title.trim() || "Untitled", logline: logline.trim() };
      const r = await askClaude(P_NEXT_IDEAS(story, bible?.data || {}), () => {}, 2, "misc");
      if (r?.ideas?.length) setIdeas(r.ideas);
      else toast("No ideas came back — try again.", "warn");
    } catch (e) { toast("Idea generation failed: " + e.message, "err"); }
    finally { setIdeasLoading(false); }
  };
  const startFromIdea = (idea) => {
    const scene = idea.beats?.length ? idea.beats[0] : idea.pitch || "";
    setPanels(prev => {
      const n = (prev.reduce((m, p) => Math.max(m, p.number), 0) || 0) + 1;
      setSel(n);
      // Seed one blank panel per beat (or a single panel from the pitch).
      const beats = idea.beats?.length ? idea.beats : [scene];
      return [...prev, ...beats.map((b, i) => blankPanel(n + i, b))];
    });
    setIdeas(null);
    toast(`Added "${idea.title}" as blank panels — draw away ✏️`);
  };

  // ── UI ───────────────────────────────────────────────────────────────────────────
  const inp = { width: "100%", padding: "9px 12px", borderRadius: 8, border: `0.5px solid ${C.border2}`, background: C.card, color: C.text, fontSize: 13, fontFamily: "inherit", outline: "none" };
  const label = { fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 };

  if (!user) return (
    <div style={{ textAlign: "center", padding: "60px 20px" }}>
      <div style={{ fontSize: 40, marginBottom: 14 }}>🎨</div>
      <div style={{ fontSize: 18, fontWeight: 700, fontFamily: "'Cinzel',serif", marginBottom: 8 }}>Illustrator</div>
      <div style={{ fontSize: 13, color: C.muted, maxWidth: 420, margin: "0 auto 20px", lineHeight: 1.7 }}>
        Draw your own manga — upload your panels, letter them your way, lay out the page. Sign in to start.
      </div>
    </div>
  );

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, fontFamily: "'Cinzel',serif" }}>🎨 Illustrator</div>
          <div style={{ fontSize: 12, color: C.muted }}>Your panels, your lettering, your layout. We learn your style for the AI Studio.</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Btn onClick={saveDraft}>Save draft</Btn>
          <Btn v="pri" onClick={publish} disabled={publishing}>{publishing ? <><Spinner size={13} /> Publishing…</> : "✦ Publish"}</Btn>
        </div>
      </div>

      {learning && <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: C.purple + "12", border: `0.5px solid ${C.purple}44`, borderRadius: 9, marginBottom: 12, fontSize: 12, color: C.purpleL }}><Spinner size={12} /> Studying your art + lettering into the story brain…</div>}

      <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 16, alignItems: "start" }}>
        {/* ── Left rail: story meta + layout + selected-panel tools ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ background: C.surf, border: `0.5px solid ${C.border}`, borderRadius: 12, padding: 14 }}>
            <div style={label}>Title</div>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="My manga" style={{ ...inp, marginBottom: 10 }} />
            <div style={label}>Logline</div>
            <textarea value={logline} onChange={e => setLogline(e.target.value)} rows={2} placeholder="One line about your story" style={{ ...inp, resize: "vertical", marginBottom: 10 }} />
            <div style={label}>Genre</div>
            <select value={genre} onChange={e => setGenre(e.target.value)} style={{ ...inp, marginBottom: 10 }}>
              {GENRES.filter(g => g !== "All").map(g => <option key={g} value={g}>{g}</option>)}
            </select>
            <div style={label}>Art style</div>
            <select value={style} onChange={e => setStyle(e.target.value)} style={inp} title={STYLE_GUIDE[style]}>
              {STYLE_KEYS.map(k => <option key={k} value={k}>{k}</option>)}
            </select>
            <div style={{ fontSize: 10, color: C.muted, marginTop: 5, lineHeight: 1.4 }}>{STYLE_GUIDE[style]}</div>
          </div>

          <div style={{ background: C.surf, border: `0.5px solid ${C.border}`, borderRadius: 12, padding: 14 }}>
            <div style={label}>Page layout</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {LAYOUTS.map(l => (
                <button key={l.id} onClick={() => setLayout(l.id)} style={{ fontSize: 11, padding: "5px 11px", borderRadius: 7, border: `0.5px solid ${layout === l.id ? C.purple : C.border}`, background: layout === l.id ? C.purple + "22" : "transparent", color: layout === l.id ? C.purpleL : C.muted, cursor: "pointer", fontFamily: "inherit" }}>{l.label}</button>
              ))}
            </div>
            <Btn onClick={addPanel} sx={{ width: "100%", justifyContent: "center", marginTop: 12, fontSize: 12 }}>+ Add panel</Btn>
          </div>

          {/* Selected panel tools */}
          {selPanel && (
            <div style={{ background: C.surf, border: `0.5px solid ${C.border}`, borderRadius: 12, padding: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 10 }}>Panel {selPanel.number}</div>
              <div style={label}>Scene / what's happening</div>
              <textarea value={selPanel.scene} onChange={e => patchPanel(selPanel.number, { scene: e.target.value })} rows={2} placeholder="e.g. Kaito draws his blade on the rooftop at dusk" style={{ ...inp, resize: "vertical", marginBottom: 10 }} />
              <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
                <Btn onClick={() => fileRef.current?.click()} disabled={uploading === selPanel.number} sx={{ flex: 1, justifyContent: "center", fontSize: 11 }}>{uploading === selPanel.number ? <Spinner size={12} /> : "⬆ Upload art"}</Btn>
                <Btn onClick={() => generateStart(selPanel)} disabled={gening === selPanel.number} sx={{ flex: 1, justifyContent: "center", fontSize: 11 }}>{gening === selPanel.number ? <Spinner size={12} /> : "✦ Generate"}</Btn>
              </div>
              {images[selPanel.number] && <Btn onClick={() => generateStart(selPanel, true)} disabled={gening === selPanel.number} sx={{ width: "100%", justifyContent: "center", fontSize: 11, marginBottom: 10 }}>↻ Redo generated</Btn>}
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" style={{ display: "none" }} onChange={e => { const f = e.target.files?.[0]; if (f) onUpload(selPanel.number, f); e.target.value = ""; }} />
              <div style={label}>Add lettering</div>
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                {BUBBLE_KINDS.map(b => <button key={b.id} onClick={() => addBubble(selPanel.number, b.id)} style={{ fontSize: 10.5, padding: "5px 9px", borderRadius: 6, border: `0.5px solid ${C.border}`, background: C.card, color: C.text, cursor: "pointer", fontFamily: "inherit" }}>{b.label}</button>)}
              </div>
            </div>
          )}

          {/* Learned style profile (editable) */}
          {profile && (
            <div style={{ background: C.purple + "10", border: `0.5px solid ${C.purple}44`, borderRadius: 12, padding: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: C.purpleL }}>✦ My style (learned)</div>
              <div style={label}>Art</div>
              <textarea value={profile.art} onChange={e => setProfile({ ...profile, art: e.target.value })} rows={3} style={{ ...inp, resize: "vertical", marginBottom: 8 }} />
              <div style={label}>Lettering voice</div>
              <textarea value={profile.lettering} onChange={e => setProfile({ ...profile, lettering: e.target.value })} rows={3} style={{ ...inp, resize: "vertical" }} />
              <div style={{ fontSize: 10, color: C.muted, marginTop: 6, lineHeight: 1.4 }}>Saved to this story's brain + your creator default. AI Studio uses it to match your look.</div>
            </div>
          )}

          {/* Next-chapter ideas */}
          <div style={{ background: C.surf, border: `0.5px solid ${C.border}`, borderRadius: 12, padding: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>💡 Next chapter ideas</div>
            {!ideas ? (
              <Btn onClick={loadIdeas} disabled={ideasLoading} sx={{ width: "100%", justifyContent: "center", fontSize: 11 }}>{ideasLoading ? <Spinner size={12} /> : "Suggest directions"}</Btn>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {ideas.map((idea, i) => (
                  <div key={i} style={{ padding: 10, background: C.card, border: `0.5px solid ${C.border}`, borderRadius: 8 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{idea.title}</div>
                    <div style={{ fontSize: 11, color: C.muted, margin: "3px 0 6px", lineHeight: 1.5 }}>{idea.pitch}</div>
                    {idea.beats?.length > 0 && <ul style={{ margin: "0 0 6px", paddingLeft: 16 }}>{idea.beats.map((b, j) => <li key={j} style={{ fontSize: 10.5, color: C.muted, lineHeight: 1.5 }}>{b}</li>)}</ul>}
                    <Btn onClick={() => startFromIdea(idea)} sx={{ fontSize: 10.5, padding: "4px 10px" }}>Start this chapter →</Btn>
                  </div>
                ))}
                <div style={{ display: "flex", gap: 6 }}>
                  <Btn onClick={() => moreIdeas()} disabled={ideasLoading} sx={{ flex: 1, justifyContent: "center", fontSize: 11 }}>{ideasLoading ? <Spinner size={12} /> : "↻ More ideas"}</Btn>
                  <Btn onClick={() => setIdeas(null)} sx={{ fontSize: 11 }}>Close</Btn>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Right: the page preview (panels in the chosen layout) ── */}
        <div style={{ background: mono ? "#f3f3f3" : C.card, border: `0.5px solid ${C.border}`, borderRadius: 12, padding: 16, minHeight: 400 }}>
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 10 }}>
            {panels.map((p, idx) => {
              const art = images[p.number];
              const isSel = p.number === sel;
              return (
                <div key={p.number} onClick={() => setSel(p.number)}
                  style={{ gridColumn: layout === "grid" && panels.length === 1 ? "1 / -1" : "auto", position: "relative", border: `2px solid ${isSel ? C.purple : "#111"}`, borderRadius: 4, overflow: "hidden", background: "#e8e8e8", aspectRatio: layout === "webtoon" ? "16 / 7" : "3 / 4", cursor: "pointer" }}
                  ref={el => { if (el) panelEls.current[p.number] = el; }}>
                  {art ? (
                    <img src={art} alt={`panel ${p.number}`} style={{ width: "100%", height: "100%", objectFit: "cover", filter: mono ? "grayscale(1) contrast(1.05)" : "none", display: "block" }} draggable={false} />
                  ) : (
                    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#999", fontSize: 12, textAlign: "center", padding: 12 }}>
                      {gening === p.number || uploading === p.number ? <Spinner size={18} /> : (p.scene ? "Upload or generate art — or draw it yourself" : "Describe the scene, then upload/generate")}
                    </div>
                  )}
                  {/* panel number badge + reorder/remove */}
                  <div style={{ position: "absolute", top: 4, left: 4, display: "flex", gap: 3, zIndex: 20 }}>
                    <span style={{ width: 18, height: 18, borderRadius: "50%", background: "#111", color: "#fff", fontSize: 10, lineHeight: "18px", textAlign: "center", fontWeight: 800 }}>{p.number}</span>
                  </div>
                  <div style={{ position: "absolute", top: 4, right: 4, display: "flex", gap: 3, zIndex: 20 }} onClick={e => e.stopPropagation()}>
                    <button onClick={() => movePanel(p.number, -1)} disabled={idx === 0} title="Move up/left" style={{ width: 20, height: 20, borderRadius: 4, border: "none", background: "rgba(0,0,0,0.6)", color: "#fff", cursor: "pointer", fontSize: 11 }}>↑</button>
                    <button onClick={() => movePanel(p.number, 1)} disabled={idx === panels.length - 1} title="Move down/right" style={{ width: 20, height: 20, borderRadius: 4, border: "none", background: "rgba(0,0,0,0.6)", color: "#fff", cursor: "pointer", fontSize: 11 }}>↓</button>
                    <button onClick={() => removePanel(p.number)} title="Delete panel" style={{ width: 20, height: 20, borderRadius: 4, border: "none", background: "rgba(200,50,50,0.75)", color: "#fff", cursor: "pointer", fontSize: 11 }}>✕</button>
                  </div>
                  {/* draggable bubbles */}
                  {(p.bubbles || []).map(b => (
                    <div key={b.id}
                      style={{ position: "absolute", left: `${b.x}%`, top: `${b.y}%`, minWidth: 80, maxWidth: "70%", zIndex: 15, cursor: "move" }}
                      onClick={e => e.stopPropagation()}
                      onMouseDown={e => startDrag(e, p.number, b.id, panelEls.current[p.number])}>
                      <div style={{ position: "relative" }}>
                        <PositionedBubble type={b.type} text={b.text} character={b.character} />
                        {isSel && (
                          <div style={{ position: "absolute", top: -10, right: -10, display: "flex", gap: 2, zIndex: 16 }} onMouseDown={e => e.stopPropagation()}>
                            <button onClick={() => { const t = window.prompt("Bubble text", b.text); if (t != null) updateBubble(p.number, b.id, { text: t }); }} title="Edit text" style={{ width: 18, height: 18, borderRadius: "50%", border: "none", background: C.purple, color: "#fff", cursor: "pointer", fontSize: 10 }}>✎</button>
                            <button onClick={() => removeBubble(p.number, b.id)} title="Remove" style={{ width: 18, height: 18, borderRadius: "50%", border: "none", background: "#c33", color: "#fff", cursor: "pointer", fontSize: 10 }}>✕</button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
          <div style={{ fontSize: 11, color: mono ? "#666" : C.muted, marginTop: 12, textAlign: "center" }}>
            Click a panel to edit it · drag bubbles to position · the ✎ on a bubble edits its text
          </div>
        </div>
      </div>
    </div>
  );
}
