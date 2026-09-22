import { useState, useRef, useEffect } from "react";
import { MOOD_PALETTES, getMood, LANG_GROUPS, RELEASE_MODE, TRANSLATION_ENABLED, featuresFor, AD_EVERY_CHAPTERS, AD_SECONDS } from "../constants.js";
import { useTheme } from "../ThemeContext.jsx";
import { askClaude, P_TRANSLATE, translateChapter, translateCached } from "../lib/claude.js";
import { fetchTranslation, fetchChapter, submitReport } from "../lib/supabase.js";
import AdGate from "./AdGate.jsx";
import { BUBBLE_FONT, SHOUT_FONT, isBigPanel, onArtBubbles, ThoughtCloud, spreadShots, spreadCellSpan, buildCharIntros, firstAppearances, CharIntroCard, NarrationBox } from "./mangaBubbles.jsx";

// Swap each panel's dialogue text with its translation. Matches by panel number + normalized
// original text (robust to the reader's dialogue cleaning), so index drift doesn't misalign lines.
function applyTranslation(panels, translation) {
  if (!translation?.panels) return panels;
  const norm = s => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 60);
  const byNum = new Map();
  translation.panels.forEach(tp => { if (tp && tp.number != null) byNum.set(tp.number, tp.dialogue || []); });
  return panels.map(p => {
    if (p._isTitle && translation.chapter_title) return { ...p, _chapterTitle: translation.chapter_title };
    if (!p.dialogue || !p.dialogue.length) return p;
    const td = byNum.get(p.number);
    if (!td || !td.length) return p;
    const used = new Array(td.length).fill(false);
    const dialogue = p.dialogue.map((d, i) => {
      // 1) exact original-text match at the same slot, 2) search other slots by original text,
      // 3) positional fallback (translator kept order but paraphrased the 'original' field).
      let hit = (td[i] && norm(td[i].original) === norm(d.text)) ? i : -1;
      if (hit < 0) hit = td.findIndex((t, ti) => !used[ti] && t && norm(t.original) === norm(d.text));
      if (hit < 0 && td[i] && !used[i] && td[i].translated) hit = i;
      if (hit >= 0 && td[hit]?.translated) { used[hit] = true; return { ...d, text: td[hit].translated }; }
      return d;
    });
    return { ...p, dialogue };
  });
}

const buildPanels = (story, panelImages = {}, activeScript = story.script, chapterNum = 1) => {
  const title = story.title || "Untitled";
  const tagline = story.tagline || "";
  const genre = (story.genre_tags||[])[0] || "";

  const introPanel = {
    number: 0, panel_type: "full_page", scene: "title card", mood: "dramatic",
    dialogue: [], visual_notes: "", image: null, _isTitle: true,
    _title: title, _tagline: tagline, _genre: genre, _chapterNum: chapterNum,
    _chapterTitle: activeScript?.chapter_title || `Chapter ${chapterNum}`,
    // Cover art is story-level — show it only on Chapter 1's intro.
    _coverUrl: chapterNum === 1 ? ((story.cover_art || story.script?.cover_art)?.url || null) : null,
    _coverCaption: chapterNum === 1 ? ((story.cover_art || story.script?.cover_art)?.caption || "") : "",
  };

  const outroPanel = {
    number: 9999, panel_type: "full_page", scene: "end card", mood: "dramatic",
    dialogue: [], visual_notes: "", image: null, _isOutro: true,
    _title: title, _tagline: tagline, _endHook: activeScript?.chapter_end_hook || "",
  };

  const script = activeScript;
  if (script?.panels?.length) {
    const mainPanels = script.panels.map(p => ({
      number: p.number,
      scene: p.scene || p.scene_description || p.composition || "",
      mood: p.mood || "dramatic",
      dialogue: (p.dialogue || []).map(d => ({
        ...d,
        type: d.type || (d.text?.match(/^[A-Z\s!?]+$/) ? "sfx" : "speech"),
        text: (d.text || "")
          .replace(/[{}"\[\]]/g, "")
          .replace(/^(speech|thought|narration|sfx|REAL|name|type|text|character|actual|placeholder)[\s:]+/i, "")
          .replace(/max \d+ words/gi, "")
          .trim(),
      })).filter(d => {
        const t = d.text;
        if (!t || t.length === 0) return false;
        if (t.length > 150) return false;
        if (/^(speech|thought|narration|sfx|REAL|placeholder|example|sample|actual|type|character name|dialogue text)$/i.test(t)) return false;
        if (/short punchy|max \d+ words|camera angle|precise visual|actual dialogue|schema|template|fill (every|this)|never (use|echo|put)/i.test(t)) return false;
        if (/^(actual (name|words|spoken)|real (content|dialogue|title))/i.test(t)) return false;
        return true;
      }),
      visual_notes: p.visual_notes || "",
      panel_type: p.panel_type || "half_page",
      scene_heading: p.scene_heading || "",
      shots: Array.isArray(p.shots) ? p.shots : null,
      shotImages: (Array.isArray(p.shots) ? p.shots : []).map((_, i) => panelImages[`${p.number}.${i}`] || null),
      image: panelImages[p.number] || null,
    }));
    return [introPanel, ...mainPanels, outroPanel];
  }

  const protag = story.protagonist?.name || "Protagonist";
  const antag = story.antagonist?.name || "Antagonist";
  return [
    introPanel,
    {number:1, panel_type:"full_page", scene:"Wide establishing shot — a ruined city at dusk, lone silhouette on a rooftop against a blood-red sky", mood:"dramatic",
      dialogue:[{type:"narration",text:"Seven years since the fall. The city still burns in my memory."}]},
    {number:2, panel_type:"half_page", scene:"Extreme close-up on protagonist's fierce eyes, wind whipping their hair across their face", mood:"dramatic",
      dialogue:[{character:protag,type:"thought",text:"I swore I'd never come back."}]},
    {number:3, panel_type:"half_page", scene:"Dynamic action — protagonist leaps between rooftops, coat billowing, speed lines radiating outward", mood:"action",
      dialogue:[{type:"sfx",text:"WHOOSH"}]},
    {number:4, panel_type:"quarter", scene:"Street level wide shot — crowd scatters as protagonist lands hard, dust cloud rising", mood:"action",
      dialogue:[{character:"Bystander",type:"speech",text:"Is that... the Phantom?!"}]},
    {number:5, panel_type:"half_page", scene:"Medium shot — protagonist squares shoulders, staring at the distant ruined palace tower", mood:"dramatic",
      dialogue:[{character:protag,type:"speech",text:"I'm here to end this."}]},
    {number:6, panel_type:"half_page", scene:"High angle — shadowy figure watches from a gargoyle perch above, smirking, face half in shadow", mood:"mystery",
      dialogue:[{character:antag,type:"thought",text:"Took you long enough."}]},
    {number:7, panel_type:"quarter", scene:"Close-up on clenched fist — a glowing crimson mark pulses on the palm, veins illuminated", mood:"dramatic",
      dialogue:[{type:"narration",text:"The mark. It was awakening."}]},
    {number:8, panel_type:"thin_strip", scene:"Narrow horizontal panel — protagonist's boots hit the cobblestone of the palace courtyard", mood:"action",
      dialogue:[{type:"sfx",text:"CRACK"}]},
    {number:9, panel_type:"half_page", scene:"Palace interior — protagonist walks through a grand ruined hall, moonlight cutting through broken stained glass", mood:"mystery",
      dialogue:[{character:protag,type:"speech",text:"Show yourself."}]},
    {number:10, panel_type:"half_page", scene:"Mirror reveal — antagonist steps from the shadows, arms crossed, eerily calm expression", mood:"dramatic",
      dialogue:[{character:antag,type:"speech",text:"I never left."}]},
    {number:11, panel_type:"half_page", scene:"Two-shot — protagonist and antagonist face off across cracked mosaic floor, crackling energy between them", mood:"action",
      dialogue:[{character:protag,type:"speech",text:"This ends tonight."},{character:antag,type:"speech",text:"Finally."}]},
    {number:12, panel_type:"full_page", scene:"Full splash — both figures launch at each other simultaneously, massive energy explosion between them, debris flying", mood:"action",
      dialogue:[{type:"sfx",text:"KRRRAKOOM"},{type:"narration",text:"And the city trembled once more."}]},
    outroPanel,
  ];
};

const PANEL_HEIGHTS = {full_page:480, half_page:280, quarter:180, thin_strip:100};

const MangaReader = ({ story, onBack, panelImages, signedIn = false, reporterId = null, user = null }) => {
  const C = useTheme();
  const [readMode, setReadMode] = useState("scroll");
  const [currentPage, setCurrentPage] = useState(0);
  const [lang, setLang] = useState("English");
  const [showNav, setShowNav] = useState(true);
  const [currentChapter, setCurrentChapter] = useState(1);
  const [fontSize, setFontSize] = useState(13);

  // Ad gate: ad-supported free/guest viewers see a short interstitial every AD_EVERY_CHAPTERS chapter-opens
  // (paid plans are ad-free; ads only run at launch). Counts chapter opens and trips the gate on each Nth.
  const adsOn = RELEASE_MODE && !featuresFor(user).adFree;
  const chapterOpens = useRef(0);
  const [showAd, setShowAd] = useState(false);
  useEffect(() => {
    chapterOpens.current += 1;
    if (adsOn && chapterOpens.current > 1 && (chapterOpens.current - 1) % AD_EVERY_CHAPTERS === 0) setShowAd(true);
  }, [currentChapter]); // eslint-disable-line react-hooks/exhaustive-deps
  const [translation, setTranslation] = useState(null); // translated chapter for the active non-English lang
  const [translating, setTranslating] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);  // report menu open
  const [reported, setReported] = useState(false);      // this reader already reported it
  const doReport = async (reason) => { setReportOpen(false); setReported(true); try { await submitReport(story.id, story.title, reason, reporterId); } catch {} };
  const [transErr, setTransErr] = useState(false);
  // Images: prop first; else this device's saved copy; else the URLs the creator published WITH
  // the story (so other viewers/devices see the art too).
  const ch1Images = panelImages || (() => {
    try { const ls = JSON.parse(localStorage.getItem(`mv_panels_${story.id}`) || "null"); if (ls && Object.keys(ls).length) return ls; } catch {}
    return story.script?.panel_images || {};
  })();
  // Active chapter content: Ch.1 is the story record's script; Ch.2+ load from the chapters table.
  const [chScript, setChScript] = useState(story.script);
  const [chImages, setChImages] = useState(ch1Images);
  const [chLoading, setChLoading] = useState(false);
  // True when a chapter the story advertises (chapters > 1) has no persisted content anywhere — no
  // chapters-table row and no local cache. Without this the reader silently showed Chapter 1's content
  // under the missing chapter's label, because chScript kept its prior value when the fetch found nothing.
  const [chapterMissing, setChapterMissing] = useState(false);
  useEffect(() => {
    let active = true;
    setChapterMissing(false);
    if (currentChapter <= 1) { setChScript(story.script); setChImages(ch1Images); setChLoading(false); return; }
    const cacheKey = `mv_ch_${story.id}_${currentChapter}`;
    let hadCache = false;
    try { const c = JSON.parse(localStorage.getItem(cacheKey) || "null"); if (c?.panels) { setChScript(c); setChImages(c.panel_images || {}); hadCache = true; } } catch {}
    setChLoading(true);
    (async () => {
      const row = await fetchChapter(story.id, currentChapter);
      if (!active) return;
      if (row?.script?.panels?.length) {
        setChScript(row.script); setChImages(row.script.panel_images || {});
        try { localStorage.setItem(cacheKey, JSON.stringify(row.script)); } catch {}
      } else if (!hadCache) {
        setChapterMissing(true);
      }
      setChLoading(false);
    })();
    return () => { active = false; };
  }, [currentChapter, story.id]);
  const images = chImages;
  // The language this chapter was AUTHORED in (classic formats read natively, e.g. Japanese). Picking
  // any OTHER language — including English — translates; picking the source language shows the original.
  const srcLang = chScript?.native_language || story.script?.native_language || "English";
  // Classic manga packs bubbles ONTO the art (no airy webtoon gutter). Default to classic for EVERY
  // story — only Prisma/Global explicitly tagged "webtoon" keep the conversation zone. This way older
  // stories (made before the layout tag) also lose the blank gutter, not just newly generated ones.
  const classicLayout = (chScript?.layout || story.script?.layout) !== "webtoon";
  // Manga is strictly black-and-white — force grayscale so any color the image model leaks into the
  // art (colored energy/FX, etc.) is stripped, guaranteeing a classic monochrome page.
  const monoFilter = (chScript?.mono ?? story.script?.mono) ? "grayscale(1) contrast(1.04)" : "none";
  // First-appearance intro nameplates (name + epithet), one per named character, manga-style.
  const introMap = firstAppearances(chScript?.panels, buildCharIntros(story));
  const captionVariant = story.script?.art_style === "US-EN" ? "comic" : "manga"; // Comics style → hand-lettered caption boxes

  // On-demand translation: when a reader picks a non-English language, translate the chapter live
  // (via the same P_TRANSLATE engine the Studio uses) and cache it so switching back is instant.
  useEffect(() => {
    let active = true;
    setTransErr(false);
    const allPanels = chScript?.panels;
    // Demo: English only — no live translation (saves tokens). Turns on at launch.
    if (!TRANSLATION_ENABLED) { setTranslation(null); setTranslating(false); return; }
    if (lang === srcLang || !allPanels?.length) { setTranslation(null); setTranslating(false); return; }
    // Pre-generated at publish time → instant, no AI call, same for every reader/device.
    const pre = chScript?.translations?.[lang];
    if (pre?.panels?.length) { setTranslation(pre); setTranslating(false); return; }
    const cacheKey = `mv_trans_v3_${story.id}_${currentChapter}_${lang}`; // v3: per-chapter, batched
    try { const c = JSON.parse(localStorage.getItem(cacheKey) || "null"); if (c?.panels) { setTranslation(c); setTranslating(false); return; } } catch {}
    setTranslating(true); setTranslation(null);
    (async () => {
      // Cache-first, open to EVERY reader: /api/translate returns a globally-cached translation if one exists
      // (free), else translates once and persists it for everyone. No sign-in / no credit charge — reading a
      // manga in any language is open to all (max reach). Misses are bounded by the per-IP cap server-side.
      try {
        const out = await translateCached(story.id, lang, currentChapter, chScript?.panels, story);
        if (!active) return;
        if (out?.data?.panels?.length) {
          setTranslation(out.data);
          try { localStorage.setItem(cacheKey, JSON.stringify(out.data)); } catch {}
        } else setTransErr(true);
      } catch { if (active) setTransErr(true); }
      finally { if (active) setTranslating(false); }
    })();
    return () => { active = false; };
  }, [lang, story?.id, currentChapter, chScript]);

  const panels = applyTranslation(buildPanels(story, images, chScript, currentChapter), translation);
  // Translated text runs bigger — many readers view at ~50% zoom, and non-Latin scripts need the room.
  const readFs = fontSize + (translation ? 4 : 0);
  const thoughtStyle = story.script?.thought_style || "caption"; // "caption" (webtoon) | "bubble" (comic)
  const totalChapters = story.chapters || 1;
  const containerRef = useRef(null);
  const navTimer = useRef(null);

  const resetNavTimer = () => {
    setShowNav(true);
    clearTimeout(navTimer.current);
    navTimer.current = setTimeout(() => setShowNav(false), 3000);
  };

  useEffect(() => {
    resetNavTimer();
    return () => clearTimeout(navTimer.current);
  }, []);

  useEffect(() => {
    const handler = (e) => {
      if (readMode === "page") {
        if (e.key === "ArrowRight" || e.key === "d") setCurrentPage(p => Math.min(p+1, panels.length-1));
        if (e.key === "ArrowLeft"  || e.key === "a") setCurrentPage(p => Math.max(p-1, 0));
      }
      if (e.key === "Escape") onBack();
      if (e.key === "f") {
        if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
        else document.exitFullscreen?.();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [readMode, panels.length, onBack]);

  return (
    <div ref={containerRef} style={{background:"#000",position:"fixed",inset:0,zIndex:1000,overflowY:"auto",padding:0}}
      onMouseMove={resetNavTimer} onClick={resetNavTimer}>

      {showAd && <AdGate seconds={AD_SECONDS} onDone={()=>setShowAd(false)} />}

      <div style={{position:"fixed",top:0,left:0,right:0,zIndex:100,transition:"opacity .3s",opacity:showNav?1:0,pointerEvents:showNav?"auto":"none"}}>
        <div style={{background:"rgba(0,0,0,0.9)",backdropFilter:"blur(12px)",borderBottom:"0.5px solid rgba(255,255,255,0.08)",padding:"10px 16px",display:"flex",alignItems:"center",gap:10}}>
          <button onClick={onBack} style={{background:"rgba(255,255,255,0.1)",border:"none",color:"#fff",cursor:"pointer",fontFamily:"inherit",fontSize:12,padding:"5px 12px",borderRadius:6,flexShrink:0}}>← Back</button>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:13,fontWeight:500,color:"#fff",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{story.title}</div>
            <div style={{fontSize:10,color:"rgba(255,255,255,0.5)"}}>Chapter {currentChapter}</div>
          </div>
          <select value={currentChapter} onChange={e=>setCurrentChapter(Number(e.target.value))}
            style={{fontSize:11,padding:"4px 8px",borderRadius:6,border:"0.5px solid rgba(255,255,255,0.2)",background:"rgba(255,255,255,0.1)",color:"#fff",fontFamily:"inherit",cursor:"pointer"}}>
            {Array.from({length:totalChapters},(_,i)=>i+1).map(n=><option key={n} value={n}>Ch. {n}</option>)}
          </select>
          <div style={{display:"flex",background:"rgba(255,255,255,0.1)",borderRadius:6,overflow:"hidden"}}>
            {[["scroll","↕ Scroll"],["page","↔ Page"]].map(([m,l])=>(
              <button key={m} onClick={()=>setReadMode(m)}
                style={{fontSize:10,padding:"5px 10px",border:"none",background:readMode===m?"rgba(124,58,237,0.8)":"transparent",color:"#fff",cursor:"pointer",fontFamily:"inherit"}}>
                {l}
              </button>
            ))}
          </div>
          {TRANSLATION_ENABLED && <select value={lang} onChange={e=>setLang(e.target.value)} title={srcLang==="English"?"Translate this chapter":`Originally in ${srcLang} — translate or read the original`}
            style={{fontSize:11,padding:"4px 8px",borderRadius:6,border:`0.5px solid ${lang!==srcLang?"rgba(124,58,237,0.7)":"rgba(255,255,255,0.2)"}`,background:"rgba(255,255,255,0.1)",color:"#fff",fontFamily:"inherit",cursor:"pointer",maxWidth:150}}>
            {LANG_GROUPS.map(g=>(<optgroup key={g.region} label={g.region} style={{color:"#000"}}>{g.langs.map(l=><option key={l} value={l} style={{color:"#000"}}>{l}{l===srcLang?" (original)":""}</option>)}</optgroup>))}
          </select>}
          {translating && <span style={{fontSize:10,color:"#c4b5fd",whiteSpace:"nowrap"}}>⟳ Translating…</span>}
          {!translating && lang!==srcLang && !transErr && translation && <span style={{fontSize:9,color:"#a78bfa",whiteSpace:"nowrap"}}>✦ AI translation{srcLang!=="English"?` from ${srcLang}`:""}</span>}
          {!translating && transErr && <span style={{fontSize:9,color:"#f59e0b",whiteSpace:"nowrap"}}>translation failed — showing {srcLang==="English"?"English":"the original"}</span>}
          <div style={{display:"flex",alignItems:"center",gap:4}}>
            <button onClick={()=>setFontSize(f=>Math.max(10,f-1))} style={{background:"rgba(255,255,255,0.1)",border:"none",color:"#fff",cursor:"pointer",width:22,height:22,borderRadius:4,fontSize:14,lineHeight:1}}>−</button>
            <button onClick={()=>setFontSize(f=>Math.min(18,f+1))} style={{background:"rgba(255,255,255,0.1)",border:"none",color:"#fff",cursor:"pointer",width:22,height:22,borderRadius:4,fontSize:14,lineHeight:1}}>+</button>
          </div>
          <div style={{position:"relative",flexShrink:0}}>
            <button onClick={()=>setReportOpen(o=>!o)} title="Report this story" disabled={reported} style={{background:"rgba(255,255,255,0.1)",border:"none",color:reported?"#22c55e":"rgba(255,255,255,0.85)",cursor:reported?"default":"pointer",fontFamily:"inherit",fontSize:11,padding:"5px 10px",borderRadius:6}}>{reported?"✓ Reported":"⚑ Report"}</button>
            {reportOpen && !reported && (
              <div style={{position:"absolute",right:0,top:"120%",background:"#16161c",border:"0.5px solid rgba(255,255,255,0.15)",borderRadius:10,padding:10,width:210,zIndex:130,boxShadow:"0 10px 28px rgba(0,0,0,0.55)"}}>
                <div style={{fontSize:10,color:"rgba(255,255,255,0.5)",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:8}}>Report this story for…</div>
                {["Inappropriate / explicit","Stolen / plagiarized","Harassment or hate","Spam","Other"].map(r=>(
                  <button key={r} onClick={()=>doReport(r)} style={{display:"block",width:"100%",textAlign:"left",padding:"7px 8px",borderRadius:6,marginBottom:2,border:"none",background:"transparent",color:"#fff",cursor:"pointer",fontFamily:"inherit",fontSize:12}} onMouseEnter={e=>e.currentTarget.style.background="rgba(255,255,255,0.08)"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>{r}</button>
                ))}
              </div>
            )}
          </div>
        </div>
        <div style={{height:2,background:"rgba(255,255,255,0.1)"}}>
          <div style={{height:"100%",background:`linear-gradient(90deg,${C.purple},${C.pink})`,
            width:readMode==="page"?`${((currentPage+1)/panels.length)*100}%`:"100%",
            transition:"width .3s"}}/>
        </div>
      </div>

      {chapterMissing && (
        <div style={{minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"flex-start",textAlign:"center",padding:"120px 24px 24px"}}>
          <div style={{fontSize:40,marginBottom:12}}>🚧</div>
          <div style={{fontSize:18,fontWeight:600,color:"#fff",marginBottom:8,fontFamily:"'DM Sans',sans-serif"}}>Chapter {currentChapter} isn’t available yet</div>
          <div style={{fontSize:13,color:"rgba(255,255,255,0.55)",maxWidth:420,lineHeight:1.6,marginBottom:24,fontFamily:"'DM Sans',sans-serif"}}>This chapter hasn’t been published for this story. It may still be a draft.</div>
          <div style={{display:"flex",gap:10}}>
            <button onClick={()=>setCurrentChapter(1)} style={{padding:"10px 24px",borderRadius:8,background:`linear-gradient(135deg,${C.purple},${C.pink})`,border:"none",color:"#fff",fontSize:13,cursor:"pointer",fontFamily:"inherit",fontWeight:500}}>← Back to Chapter 1</button>
            <button onClick={onBack} style={{padding:"10px 24px",borderRadius:8,background:"rgba(255,255,255,0.08)",border:"0.5px solid rgba(255,255,255,0.15)",color:"#fff",fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>Back to library</button>
          </div>
        </div>
      )}

      {!chapterMissing && readMode==="scroll"&&(
        <div style={{paddingTop:52,maxWidth:720,margin:"0 auto",background:"#e9e9e4"}}>
          {panels.map((panel,i) => {
            const mood = getMood(panel.scene + " " + panel.mood);
            const palette = MOOD_PALETTES[mood];
            const h = PANEL_HEIGHTS[panel.panel_type] || 280;

            const BUBBLE_POS = [
              {top:"8%",  left:"5%",  maxWidth:"42%"},
              {top:"8%",  right:"5%", maxWidth:"42%"},
              {top:"48%", left:"5%",  maxWidth:"42%"},
              {top:"48%", right:"5%", maxWidth:"42%"},
              {top:"75%", left:"50%", maxWidth:"44%", transform:"translateX(-50%)"},
            ];

            if (panel._isTitle) return (
              <div key="intro" style={{position:"relative",width:"100%",minHeight:520,background:"#000",display:"flex",alignItems:"center",justifyContent:"center",overflow:"hidden"}}>
                <div style={{position:"absolute",inset:0,background:`radial-gradient(ellipse at 50% 50%, ${C.purple}55 0%, #000 70%)`}}/>
                <div style={{position:"absolute",inset:0,background:`radial-gradient(ellipse at 80% 20%, ${C.pink}33 0%, transparent 60%)`}}/>
                <svg style={{position:"absolute",inset:0,width:"100%",height:"100%",opacity:0.08}} viewBox="0 0 720 520">
                  {Array.from({length:12},(_,i)=>{
                    const y = i*44+10;
                    return <line key={i} x1="0" y1={y} x2="720" y2={y} stroke="white" strokeWidth="0.5"/>;
                  })}
                </svg>
                <div style={{position:"relative",zIndex:2,textAlign:"center",padding:"40px 32px"}}>
                  {panel._genre&&<div style={{fontSize:11,letterSpacing:"0.25em",textTransform:"uppercase",color:C.purple,marginBottom:16,fontFamily:"'DM Sans',sans-serif"}}>{panel._genre}</div>}
                  <div style={{fontSize:42,fontWeight:700,fontFamily:"'Cinzel',serif",color:"#fff",lineHeight:1.15,marginBottom:16,textShadow:`0 0 40px ${C.purple}88`}}>
                    {panel._title}
                  </div>
                  {panel._tagline&&<div style={{fontSize:14,color:"rgba(255,255,255,0.6)",fontStyle:"italic",marginBottom:28,fontFamily:"'DM Sans',sans-serif",lineHeight:1.6}}>{panel._tagline}</div>}
                  <div style={{width:60,height:2,background:`linear-gradient(90deg,transparent,${C.purple},${C.pink},transparent)`,margin:"0 auto 20px"}}/>
                  <div style={{fontSize:13,color:C.purple,letterSpacing:"0.15em",textTransform:"uppercase",fontFamily:"'Cinzel',serif",marginBottom:panel._coverUrl?24:0}}>{panel._chapterTitle || "Chapter 1"}</div>
                  {/* BONUS non-canon cover art (SBS-style easter egg) */}
                  {panel._coverUrl && (
                    <div style={{maxWidth:340,margin:"0 auto"}}>
                      <div style={{border:"3px solid rgba(255,255,255,0.85)",borderRadius:3,overflow:"hidden",boxShadow:"0 6px 24px rgba(0,0,0,0.5)"}}>
                        <img src={panel._coverUrl} alt="Bonus cover" style={{width:"100%",display:"block"}}/>
                      </div>
                      {panel._coverCaption && <div style={{fontSize:12,color:"rgba(255,255,255,0.6)",fontStyle:"italic",marginTop:10,lineHeight:1.5,fontFamily:"'DM Sans',sans-serif"}}>“{panel._coverCaption}”</div>}
                      <div style={{fontSize:9,color:"rgba(255,255,255,0.35)",letterSpacing:"0.14em",textTransform:"uppercase",marginTop:6}}>Bonus · not part of the story</div>
                    </div>
                  )}
                </div>
                <div style={{position:"absolute",top:20,left:20,width:30,height:30,borderTop:`2px solid ${C.purple}88`,borderLeft:`2px solid ${C.purple}88`}}/>
                <div style={{position:"absolute",top:20,right:20,width:30,height:30,borderTop:`2px solid ${C.purple}88`,borderRight:`2px solid ${C.purple}88`}}/>
                <div style={{position:"absolute",bottom:20,left:20,width:30,height:30,borderBottom:`2px solid ${C.purple}88`,borderLeft:`2px solid ${C.purple}88`}}/>
                <div style={{position:"absolute",bottom:20,right:20,width:30,height:30,borderBottom:`2px solid ${C.purple}88`,borderRight:`2px solid ${C.purple}88`}}/>
              </div>
            );

            if (panel._isOutro) return (
              <div key="outro" style={{position:"relative",width:"100%",minHeight:400,background:"#000",display:"flex",alignItems:"center",justifyContent:"center",overflow:"hidden"}}>
                <div style={{position:"absolute",inset:0,background:`radial-gradient(ellipse at 50% 50%, ${C.pink}33 0%, #000 70%)`}}/>
                <div style={{position:"relative",zIndex:2,textAlign:"center",padding:"40px 32px"}}>
                  <div style={{width:40,height:2,background:`linear-gradient(90deg,transparent,${C.pink},transparent)`,margin:"0 auto 20px"}}/>
                  <div style={{fontSize:11,letterSpacing:"0.2em",textTransform:"uppercase",color:"rgba(255,255,255,0.35)",marginBottom:20,fontFamily:"'DM Sans',sans-serif"}}>End of Chapter</div>
                  <div style={{fontSize:28,fontWeight:700,fontFamily:"'Cinzel',serif",color:"rgba(255,255,255,0.9)",marginBottom:16}}>{panel._title}</div>
                  {panel._endHook&&(
                    <div style={{fontSize:13,color:"rgba(255,255,255,0.55)",fontStyle:"italic",maxWidth:400,margin:"0 auto 24px",lineHeight:1.7,fontFamily:"'DM Sans',sans-serif"}}>"{panel._endHook}"</div>
                  )}
                  <div style={{fontSize:11,color:C.pink,letterSpacing:"0.2em",textTransform:"uppercase",fontFamily:"'DM Sans',sans-serif"}}>— To be continued —</div>
                </div>
              </div>
            );

            const cleanDlg = (panel.dialogue||[])
              .map(d => ({...d, text: (d.text||"").replace(/[{}[\]"]/g,"").trim()}))
              .filter(d => {
                if (!d.text || d.text.length < 1 || d.text.length > 120) return false;
                const t = d.text.toLowerCase();
                if (/^(speech|thought|narration|sfx|real|type|text|character|name|dialogue|short|punchy|max \d|actual|placeholder|schema|template)/.test(t)) return false;
                if (/camera angle|precise visual|actual dialogue|placeholder|example|sample|panel|scene description|fill every|never (use|echo|put)|max \d+ words/.test(t)) return false;
                if (/^(actual (name|words|spoken)|real (content|dialogue|title)|character name|dialogue text)/.test(t)) return false;
                return true;
              });
            const nonSfx = cleanDlg.filter(d => d.type!=="sfx");
            const sfx = cleanDlg.filter(d => d.type==="sfx");
            const speechThought = nonSfx.filter(d => d.type==="speech" || d.type==="thought");
            const narrLines = nonSfx.filter(d => d.type==="narration");
            const shots = spreadShots(panel);            // 2-4 sub-scenes → composite spread
            const toSrc = (v) => !v ? null : (v.startsWith("data:") || v.startsWith("http") ? v : "data:image/png;base64,"+v);
            const imgSrc = toSrc(panel.image);
            const shotSrcs = shots ? shots.map((_,si)=>toSrc(panel.shotImages?.[si])) : [];
            const hasArt = !!imgSrc || shotSrcs.some(Boolean);
            // Bubbles go ON the art only when there IS art — otherwise a failed image would be a black void.
            // Classic manga formats put EVERY panel's bubbles on the art (no webtoon conversation gutter).
            const big = (isBigPanel(panel) || !!shots || classicLayout) && hasArt;

            return (
              <div key={panel.number} style={{background:"#e9e9e4"}}>
                {/* SCENE CUT — divider header when the story jumps to a new place/time */}
                {panel.scene_heading && (
                  <div style={{padding:"30px 24px 12px",display:"flex",alignItems:"center",gap:12,justifyContent:"center"}}>
                    <div style={{height:1,flex:"0 1 56px",background:"#c3c3ba"}}/>
                    <div style={{fontSize:11,letterSpacing:"0.14em",textTransform:"uppercase",color:"#7a7a70",fontWeight:600,textAlign:"center"}}>{panel.scene_heading}</div>
                    <div style={{height:1,flex:"0 1 56px",background:"#c3c3ba"}}/>
                  </div>
                )}
                {/* IMAGE — the picture for this beat (natural aspect, SFX painted on the art) */}
                <div style={{position:"relative",background:"#0a0a0a"}}>
                  {(shots && hasArt) ? (
                    /* SPREAD — 2-4 sub-scenes composited in one frame with manga gutters */
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:3,background:"#111"}}>
                      {shots.map((sc,si)=>{
                        const src = shotSrcs[si];
                        return (
                          <div key={si} style={{position:"relative",background:"#0a0a0a",minHeight:src?undefined:150,...spreadCellSpan(shots.length,si)}}>
                            {src
                              ? <img src={src} alt={panel.scene ? `${panel.scene.slice(0,120)} (shot ${si+1})` : `Panel ${panel.number} shot ${si+1}`} style={{width:"100%",height:"100%",objectFit:"cover",display:"block",filter:monoFilter}}/>
                              : <div style={{position:"absolute",inset:0,background:`radial-gradient(ellipse at 50% 40%, ${palette.accent}66 0%, transparent 65%)`,display:"flex",alignItems:"flex-end",padding:10}}><div style={{fontSize:10,color:"rgba(255,255,255,0.35)",fontStyle:"italic",lineHeight:1.3}}>{sc.slice(0,60)}</div></div>}
                          </div>
                        );
                      })}
                    </div>
                  ) : imgSrc ? (
                    <img src={imgSrc} alt={panel.scene ? panel.scene.slice(0,120) : `Panel ${panel.number}`} style={{width:"100%",display:"block",filter:monoFilter}}/>
                  ) : (
                    /* No art (generation failed/pending) — a COMPACT placeholder, never a tall black void */
                    <div style={{minHeight:200,width:"100%",position:"relative",overflow:"hidden",background:`linear-gradient(160deg, ${palette.bg} 0%, #111 100%)`,display:"flex",alignItems:"center",justifyContent:"center",padding:"18px"}}>
                      <div style={{position:"absolute",inset:0,background:`radial-gradient(ellipse at 50% 40%, ${palette.accent}55 0%, transparent 65%)`}}/>
                      <div style={{position:"relative",textAlign:"center",maxWidth:"80%"}}>
                        <div style={{fontSize:22,marginBottom:6,opacity:0.5}}>🖼</div>
                        <div style={{fontSize:11,color:"rgba(255,255,255,0.45)",lineHeight:1.4,fontStyle:"italic"}}>{(panel.scene||"").slice(0,90)}</div>
                      </div>
                    </div>
                  )}
                  {sfx.map((d,si)=>(
                    <div key={si} style={{position:"absolute",zIndex:11,top:si%2===0?"32%":"64%",left:si%2===0?"58%":"14%",transform:`rotate(${si%2===0?"-6":"4"}deg)`,fontSize:h>300?58:42,fontWeight:400,color:"#fff",fontFamily:SHOUT_FONT,letterSpacing:"0.04em",textShadow:"3px 3px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000",pointerEvents:"none",userSelect:"none"}}>{d.text}</div>
                  ))}
                  {/* BIG / ACTION PANEL — manga bubbles ON the art (reads left-to-right, top-to-bottom) */}
                  {big && narrLines.map((d,ni)=>(
                    <div key={"n"+ni} style={{position:"absolute",zIndex:12,top:10+ni*58,left:10,maxWidth:"66%"}}>
                      <NarrationBox fs={Math.max(12,readFs)} variant={captionVariant}>{d.text}</NarrationBox>
                    </div>
                  ))}
                  {big && onArtBubbles(speechThought, panel.mood, Math.max(14,readFs))}
                  {(introMap[panel.number]||[]).map((intro,ii)=><CharIntroCard key={"intro"+ii} intro={intro} index={ii} variant={captionVariant}/>)}
                </div>
                {/* CONVERSATION — quieter beats: floating bubbles & caption boxes in airy white space (webtoon flow) */}
                {!big && nonSfx.length>0 && (
                  <div style={{padding:"12px 16px 14px",display:"flex",flexDirection:"column",gap:11,alignItems:"center"}}>
                    {nonSfx.map((d,di)=>{
                      if (d.type==="narration") return (
                        <div key={di} style={{maxWidth:"86%"}}>
                          <NarrationBox fs={Math.max(14,readFs)} variant={captionVariant}>{d.text}</NarrationBox>
                        </div>
                      );
                      const isThought = d.type==="thought";
                      const isVillain = /villain|antagonist|enemy|evil/i.test(d.character||"");
                      if (isThought) return (
                        <div key={di} style={{maxWidth:"78%",width:"fit-content"}}>
                          <ThoughtCloud bg={isVillain?"#1a0010":"#fff"} stroke={isVillain?"#e84393":"#111"} color={isVillain?"#ffd9ec":"#141414"} fs={Math.max(14,readFs+1)}>{d.text}</ThoughtCloud>
                        </div>
                      );
                      const bc = isVillain ? "#b3005f" : "#141414";
                      return (
                        <div key={di} style={{maxWidth:"82%",width:"fit-content"}}>
                          <div style={{position:"relative",background:"#ffffff",border:`2.5px solid ${bc}`,borderRadius:"22px",padding:"11px 18px",boxShadow:"0 2px 7px rgba(0,0,0,0.18)"}}>
                            <div style={{position:"absolute",top:-10,left:"50%",transform:"translateX(-50%)",width:0,height:0,borderLeft:"8px solid transparent",borderRight:"8px solid transparent",borderBottom:`10px solid ${bc}`}}/>
                            <div style={{fontFamily:BUBBLE_FONT,textTransform:"uppercase",fontSize:`clamp(14px,3.6vw,${Math.max(15,readFs+2)}px)`,color:"#141414",lineHeight:1.25,fontWeight:700,textAlign:"center"}}>{d.text}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
          <div style={{padding:"40px 20px",textAlign:"center",background:"#000"}}>
            <div style={{fontSize:11,color:"rgba(255,255,255,0.3)",letterSpacing:"0.15em",textTransform:"uppercase",marginBottom:20}}>— End of Chapter {currentChapter} —</div>
            <div style={{display:"flex",justifyContent:"center",gap:12}}>
              {currentChapter>1&&<button onClick={()=>setCurrentChapter(c=>c-1)} style={{padding:"10px 24px",borderRadius:8,background:"rgba(255,255,255,0.08)",border:"0.5px solid rgba(255,255,255,0.15)",color:"#fff",fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>← Chapter {currentChapter-1}</button>}
              {currentChapter<totalChapters&&<button onClick={()=>{setCurrentChapter(c=>c+1);containerRef.current?.scrollTo(0,0);}} style={{padding:"10px 24px",borderRadius:8,background:`linear-gradient(135deg,${C.purple},${C.pink})`,border:"none",color:"#fff",fontSize:13,cursor:"pointer",fontFamily:"inherit",fontWeight:500}}>Chapter {currentChapter+1} →</button>}
              {currentChapter===totalChapters&&<button onClick={onBack} style={{padding:"10px 24px",borderRadius:8,background:`linear-gradient(135deg,${C.teal},${C.blue})`,border:"none",color:"#fff",fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>✓ Series complete</button>}
            </div>
          </div>
        </div>
      )}

      {!chapterMissing && readMode==="page"&&(
        <div style={{paddingTop:52,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",minHeight:"calc(100vh - 52px)"}}>
          {(() => {
            const panel = panels[currentPage];
            if (!panel) return null;
            const mood = getMood(panel.scene + " " + panel.mood);
            const palette = MOOD_PALETTES[mood];
            const imgSrc = panel.image
              ? (panel.image.startsWith("data:") ? panel.image : "data:image/png;base64,"+panel.image)
              : null;
            return (
              <div style={{width:"100%",maxWidth:680,position:"relative"}}>
                <div style={{minHeight:imgSrc?undefined:500,background:imgSrc?"#0a0a0a":`linear-gradient(160deg,${palette.bg} 0%,#111 100%)`,position:"relative",overflow:"hidden",display:"flex",alignItems:"center",justifyContent:"center"}}>
                  {imgSrc&&<img src={imgSrc} alt={panel.scene ? panel.scene.slice(0,120) : `Panel ${panel.number}`} style={{width:"100%",display:"block",filter:monoFilter}}/>}
                  {!imgSrc&&<div style={{position:"absolute",inset:0,background:`radial-gradient(ellipse at center,${palette.accent}88 0%,transparent 60%)`}}/>}
                  {((panel.dialogue||[]).filter(d=>d.type==="narration").length>0 || (thoughtStyle==="caption" && (panel.dialogue||[]).filter(d=>d.type==="thought").length>0))&&(
                    <div style={{position:"absolute",top:8,left:8,right:8,zIndex:11,display:"flex",flexDirection:"column",alignItems:"flex-start",gap:5}}>
                      {(panel.dialogue||[]).filter(d=>d.type==="narration").map((d,i)=>(
                        <div key={"n"+i} style={{alignSelf:"stretch",padding:"5px 12px",background:"rgba(0,0,0,0.72)",borderLeft:"3px solid rgba(245,158,11,0.6)",borderRadius:4}}>
                          <div style={{fontSize:10,color:"#f5c842",fontStyle:"italic",lineHeight:1.4}}>{d.text}</div>
                        </div>
                      ))}
                      {thoughtStyle==="caption" && (panel.dialogue||[]).filter(d=>d.type==="thought").map((d,i)=>(
                        <div key={"t"+i} style={{maxWidth:"80%",padding:"6px 12px",background:"rgba(255,255,255,0.95)",borderLeft:`3px solid ${C.purple}`,borderRadius:5,boxShadow:"0 2px 8px rgba(0,0,0,0.5)"}}>
                          <div style={{fontSize:11,color:"#141414",fontStyle:"italic",fontWeight:600,lineHeight:1.45}}>{d.text}</div>
                        </div>
                      ))}
                    </div>
                  )}
                  {(()=>{
                    const dialogue=(panel.dialogue||[]).filter(d=>d.type==="speech" || (thoughtStyle==="bubble" && d.type==="thought")).slice(0,4);
                    const n = dialogue.length;
                    const speakers = [...new Set(dialogue.map(b=>(b.character||"").toLowerCase()).filter(Boolean))];
                    const sideFor = (name) => {
                      const k=(name||"").toLowerCase();
                      if (speakers.length<=1 || !k) return { left:"50%", transform:"translateX(-50%)" };
                      return speakers.indexOf(k)%2===0 ? { left:"5%" } : { right:"5%" };
                    };
                    const TOP=8, BOTTOM=90, GAP=4;
                    const band = (BOTTOM - TOP - GAP*(n-1))/n;
                    return dialogue.map((d,si)=>{
                      const isVillain=/villain|antagonist|enemy|evil/i.test(d.character||"");
                      const isThought=d.type==="thought";
                      const bg=isVillain?"#1a0010":(isThought?"#fbfaff":"#ffffff");
                      const tc=isVillain?"#ffd9ec":"#0a0a0a";
                      const bc=isVillain?"#e84393":(isThought?"#7c5cff":"#111111");
                      const side=sideFor(d.character);
                      const badgeRight=side.right!==undefined;
                      const top = n===1 ? "16%" : `${TOP + si*(band+GAP)}%`;
                      return (
                        <div key={si} style={{position:"absolute",zIndex:10,top,...side,minWidth:110,maxWidth:"58%"}}>
                          <div style={{position:"relative"}}>
                            {n>1 && <span style={{position:"absolute",top:-9,[badgeRight?"right":"left"]:-9,width:19,height:19,borderRadius:"50%",background:"#111",color:"#fff",fontSize:11,lineHeight:"19px",textAlign:"center",fontWeight:700,zIndex:2,boxShadow:"0 1px 3px rgba(0,0,0,0.5)"}}>{si+1}</span>}
                            <div style={{background:bg,border:`2.5px solid ${bc}`,borderRadius:isThought?"46%/40%":"20px",padding:"8px 14px",boxShadow:"0 0 0 3px rgba(255,255,255,0.85), 0 3px 12px rgba(0,0,0,0.55)",textAlign:"center"}}>
                              {d.character&&<div style={{fontSize:10.5,fontWeight:800,color:isVillain?"#ff9ecb":(isThought?"#6d28d9":"#444"),textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:3,lineHeight:1.2}}>{isThought?`${d.character} · thinking`:d.character}</div>}
                              <div style={{fontSize:"clamp(14px,3.2vw,16px)",color:tc,lineHeight:1.35,fontWeight:700,fontFamily:"'DM Sans',Arial,sans-serif",textAlign:"center",wordBreak:"break-word",fontStyle:isThought?"italic":"normal"}}>{d.text}</div>
                            </div>
                            {isThought&&<div style={{position:"absolute",bottom:-13,left:16,display:"flex",flexDirection:"column",gap:2}}>{[5,3,2].map((s,ti)=><div key={ti} style={{width:s,height:s,borderRadius:"50%",background:bg,border:`1px solid ${bc}`}}/>)}</div>}
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
                <div style={{position:"absolute",left:0,top:0,bottom:0,width:"40%",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"flex-start",paddingLeft:16}}
                  onClick={()=>setCurrentPage(p=>Math.max(p-1,0))}>
                  {currentPage>0&&<div style={{fontSize:24,color:"rgba(255,255,255,0.3)"}}>‹</div>}
                </div>
                <div style={{position:"absolute",right:0,top:0,bottom:0,width:"40%",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"flex-end",paddingRight:16}}
                  onClick={()=>setCurrentPage(p=>Math.min(p+1,panels.length-1))}>
                  {currentPage<panels.length-1&&<div style={{fontSize:24,color:"rgba(255,255,255,0.3)"}}>›</div>}
                </div>
                <div style={{textAlign:"center",padding:"12px 0",fontSize:11,color:"rgba(255,255,255,0.3)"}}>
                  {currentPage+1} / {panels.length}
                  <span style={{margin:"0 10px",opacity:0.5}}>·</span>
                  <span style={{fontSize:10}}>Arrow keys to navigate</span>
                </div>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
};

export default MangaReader;

