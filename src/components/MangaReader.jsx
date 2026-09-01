import { useState, useRef, useEffect } from "react";
import { MOOD_PALETTES, getMood } from "../constants.js";
import { useTheme } from "../ThemeContext.jsx";

const buildPanels = (story, panelImages = {}) => {
  const title = story.title || "Untitled";
  const tagline = story.tagline || "";
  const genre = (story.genre_tags||[])[0] || "";

  const introPanel = {
    number: 0, panel_type: "full_page", scene: "title card", mood: "dramatic",
    dialogue: [], visual_notes: "", image: null, _isTitle: true,
    _title: title, _tagline: tagline, _genre: genre, _chapterNum: 1,
    _chapterTitle: story.script?.chapter_title || "Chapter 1",
  };

  const outroPanel = {
    number: 9999, panel_type: "full_page", scene: "end card", mood: "dramatic",
    dialogue: [], visual_notes: "", image: null, _isOutro: true,
    _title: title, _tagline: tagline, _endHook: story.script?.chapter_end_hook || "",
  };

  const script = story.script;
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

const MangaReader = ({ story, onBack, panelImages }) => {
  const C = useTheme();
  const [readMode, setReadMode] = useState("scroll");
  const [currentPage, setCurrentPage] = useState(0);
  const [lang, setLang] = useState("English");
  const [showNav, setShowNav] = useState(true);
  const [currentChapter, setCurrentChapter] = useState(1);
  const [fontSize, setFontSize] = useState(13);
  // Prefer images passed in; else load persisted images for this story
  const images = panelImages || (() => {
    try { return JSON.parse(localStorage.getItem(`mv_panels_${story.id}`) || "{}"); } catch { return {}; }
  })();
  const panels = buildPanels(story, images);
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
    <div ref={containerRef} style={{background:"#000",minHeight:"100vh",margin:"-24px -20px",padding:0,position:"relative"}}
      onMouseMove={resetNavTimer} onClick={resetNavTimer}>

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
          <select value={lang} onChange={e=>setLang(e.target.value)}
            style={{fontSize:11,padding:"4px 8px",borderRadius:6,border:"0.5px solid rgba(255,255,255,0.2)",background:"rgba(255,255,255,0.1)",color:"#fff",fontFamily:"inherit",cursor:"pointer"}}>
            {["English","Korean","Japanese","Spanish","French","Arabic","Portuguese","German"].map(l=><option key={l}>{l}</option>)}
          </select>
          <div style={{display:"flex",alignItems:"center",gap:4}}>
            <button onClick={()=>setFontSize(f=>Math.max(10,f-1))} style={{background:"rgba(255,255,255,0.1)",border:"none",color:"#fff",cursor:"pointer",width:22,height:22,borderRadius:4,fontSize:14,lineHeight:1}}>−</button>
            <button onClick={()=>setFontSize(f=>Math.min(18,f+1))} style={{background:"rgba(255,255,255,0.1)",border:"none",color:"#fff",cursor:"pointer",width:22,height:22,borderRadius:4,fontSize:14,lineHeight:1}}>+</button>
          </div>
        </div>
        <div style={{height:2,background:"rgba(255,255,255,0.1)"}}>
          <div style={{height:"100%",background:`linear-gradient(90deg,${C.purple},${C.pink})`,
            width:readMode==="page"?`${((currentPage+1)/panels.length)*100}%`:"100%",
            transition:"width .3s"}}/>
        </div>
      </div>

      {readMode==="scroll"&&(
        <div style={{paddingTop:52,maxWidth:720,margin:"0 auto",background:"#000"}}>
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
                  <div style={{fontSize:13,color:C.purple,letterSpacing:"0.15em",textTransform:"uppercase",fontFamily:"'Cinzel',serif"}}>{panel._chapterTitle || "Chapter 1"}</div>
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
            const cleanSpeeches = cleanDlg.filter(d => d.type==="speech" || (thoughtStyle==="bubble" && d.type==="thought"));
            const cleanThoughts = thoughtStyle==="caption" ? cleanDlg.filter(d => d.type==="thought") : [];
            const cleanSfx = cleanDlg.filter(d => d.type==="sfx");
            const cleanNarr = cleanDlg.filter(d => d.type==="narration");

            const imgSrc = panel.image
              ? (panel.image.startsWith("data:") ? panel.image : "data:image/png;base64,"+panel.image)
              : null;

            return (
              <div key={panel.number} style={{marginBottom:1, position:"relative"}}>
                <div style={{
                  minHeight: imgSrc ? undefined : h, width:"100%",
                  background: imgSrc ? "#0a0a0a" : `linear-gradient(160deg, ${palette.bg} 0%, #111 100%)`,
                  position:"relative", overflow:"hidden",
                }}>
                  {/* Render the panel at its natural aspect ratio (tall webtoon / wide comic) — no cropping */}
                  {imgSrc&&<img src={imgSrc} alt={`Panel ${panel.number}`} style={{width:"100%",display:"block"}}/>}
                  {!imgSrc&&<div style={{position:"absolute",inset:0,background:`radial-gradient(ellipse at 50% 40%, ${palette.accent}88 0%, transparent 60%)`}}/>}
                  {!imgSrc&&mood==="action"&&(
                    <svg style={{position:"absolute",inset:0,width:"100%",height:"100%",opacity:0.06,pointerEvents:"none"}} viewBox="0 0 720 280">
                      {Array.from({length:18},(_,li)=>{const cx=360,cy=140,a=(li/18)*Math.PI*2;return <line key={li} x1={cx} y1={cy} x2={cx+Math.cos(a)*900} y2={cy+Math.sin(a)*900} stroke={palette.accent} strokeWidth="1.5"/>;})}
                    </svg>
                  )}
                  {(cleanNarr.length>0||cleanThoughts.length>0)&&(
                    <div style={{position:"absolute",top:0,left:0,right:0,zIndex:12,display:"flex",flexDirection:"column",alignItems:"flex-start",gap:6,padding:"8px 10px 0",pointerEvents:"none"}}>
                      {cleanNarr.map((d,ni)=>(
                        <div key={"n"+ni} style={{alignSelf:"stretch",background:"rgba(0,0,0,0.85)",borderLeft:"3px solid rgba(245,158,11,0.6)",padding:"7px 14px",borderRadius:4}}>
                          <div style={{fontSize:fontSize,color:"#f5c842",fontStyle:"italic",lineHeight:1.5,fontFamily:"'DM Sans',Arial,sans-serif",direction:"ltr"}}>{d.text}</div>
                        </div>
                      ))}
                      {cleanThoughts.map((d,ti)=>(
                        <div key={"t"+ti} style={{maxWidth:"80%",background:"rgba(255,255,255,0.95)",borderLeft:`3px solid ${C.purple}`,borderRadius:5,padding:"7px 13px",boxShadow:"0 3px 10px rgba(0,0,0,0.5)"}}>
                          <div style={{fontSize:fontSize,color:"#141414",fontStyle:"italic",fontWeight:600,lineHeight:1.5,fontFamily:"'DM Sans',Arial,sans-serif",direction:"ltr"}}>{d.text}</div>
                        </div>
                      ))}
                    </div>
                  )}
                  {cleanSfx.map((d,si)=>(
                    <div key={si} style={{position:"absolute",zIndex:11,top:"50%",left:"50%",transform:`translate(-50%,-50%) rotate(${si%2===0?"-5":"3"}deg)`,fontSize:h>300?64:42,fontWeight:900,color:"#e84393",fontFamily:"'Cinzel',serif",letterSpacing:"0.06em",textShadow:"3px 3px 0 #000, 0 0 30px rgba(232,67,147,0.8)",lineHeight:1,whiteSpace:"nowrap",pointerEvents:"none",userSelect:"none"}}>
                      {d.text}
                    </div>
                  ))}
                  {cleanSpeeches.map((d,si)=>{
                    const pos = BUBBLE_POS[si%BUBBLE_POS.length];
                    const isVillain = /villain|antagonist|enemy|evil/i.test(d.character||"");
                    const isThought = d.type==="thought";
                    const bg = isVillain?"rgba(15,0,10,0.95)":"rgba(255,255,255,0.96)";
                    const tc = isVillain?"#ffccee":"#111";
                    const bc = isVillain?"#e84393":"rgba(0,0,0,0.2)";
                    const tLeft = pos.right?"auto":pos.transform?"50%":"20px";
                    const tRight = pos.right?"20px":"auto";
                    const tTx = pos.transform?"translateX(-50%)":"none";
                    return (
                      <div key={si} style={{position:"absolute",zIndex:10,...pos}}>
                        <div style={{position:"relative",display:"inline-block"}}>
                          <div style={{background:bg,border:`1.5px solid ${bc}`,borderRadius:isThought?"40%/35%":"999px",padding:"6px 13px",boxShadow:"0 2px 10px rgba(0,0,0,0.6)",minWidth:36,maxWidth:"100%"}}>
                            {isThought&&d.character&&<div style={{fontSize:9,fontWeight:700,color:tc,opacity:0.55,textAlign:"center",marginBottom:2}}>{d.character} (thinking)</div>}
                            <div style={{fontSize:fontSize,color:tc,lineHeight:1.4,fontWeight:600,fontFamily:"'DM Sans',Arial,sans-serif",direction:"ltr",textAlign:"center",whiteSpace:"normal",fontStyle:isThought?"italic":"normal"}}>
                              {d.text}
                            </div>
                          </div>
                          {!isThought&&(
                            <div style={{position:"absolute",bottom:-8,left:tLeft,right:tRight,transform:tTx,width:0,height:0,borderLeft:"6px solid transparent",borderRight:"6px solid transparent",borderTop:`8px solid ${bg}`,filter:"drop-shadow(0 1px 1px rgba(0,0,0,0.4))"}}/>
                          )}
                          {isThought&&(
                            <div style={{position:"absolute",bottom:-14,left:tLeft,display:"flex",flexDirection:"column",gap:2,alignItems:"center"}}>
                              {[5,3,2].map((s,ti)=><div key={ti} style={{width:s,height:s,borderRadius:"50%",background:bg}}/>)}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
          <div style={{padding:"40px 20px",textAlign:"center",background:"#000"}}>
            <div style={{fontSize:11,color:"rgba(255,255,255,0.3)",letterSpacing:"0.15em",textTransform:"uppercase",marginBottom:20}}>— End of Chapter {currentChapter} —</div>
            <div style={{display:"flex",justifyContent:"center",gap:12}}>
              {currentChapter>1&&<button onClick={()=>setCurrentChapter(c=>c-1)} style={{padding:"10px 24px",borderRadius:8,background:"rgba(255,255,255,0.08)",border:"0.5px solid rgba(255,255,255,0.15)",color:"#fff",fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>← Chapter {currentChapter-1}</button>}
              {currentChapter<totalChapters&&<button onClick={()=>{setCurrentChapter(c=>c+1);window.scrollTo(0,0);}} style={{padding:"10px 24px",borderRadius:8,background:`linear-gradient(135deg,${C.purple},${C.pink})`,border:"none",color:"#fff",fontSize:13,cursor:"pointer",fontFamily:"inherit",fontWeight:500}}>Chapter {currentChapter+1} →</button>}
              {currentChapter===totalChapters&&<button onClick={onBack} style={{padding:"10px 24px",borderRadius:8,background:`linear-gradient(135deg,${C.teal},${C.blue})`,border:"none",color:"#fff",fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>✓ Series complete</button>}
            </div>
          </div>
        </div>
      )}

      {readMode==="page"&&(
        <div style={{paddingTop:52,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",minHeight:"calc(100vh - 52px)"}}>
          {(() => {
            const panel = panels[currentPage];
            if (!panel) return null;
            const mood = getMood(panel.scene + " " + panel.mood);
            const palette = MOOD_PALETTES[mood];
            return (
              <div style={{width:"100%",maxWidth:680,position:"relative"}}>
                <div style={{minHeight:500,background:`linear-gradient(160deg,${palette.bg} 0%,#111 100%)`,position:"relative",overflow:"hidden",display:"flex",alignItems:"center",justifyContent:"center"}}>
                  <div style={{position:"absolute",inset:0,background:`radial-gradient(ellipse at center,${palette.accent}88 0%,transparent 60%)`}}/>
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
                    const dialogue=(panel.dialogue||[]).filter(d=>d.type==="speech" || (thoughtStyle==="bubble" && d.type==="thought"));
                    const BPOS=[{top:"12%",left:"8%"},{top:"12%",right:"8%"},{bottom:"18%",left:"8%"},{bottom:"18%",right:"8%"}];
                    return dialogue.slice(0,4).map((d,si)=>{
                      const pos=BPOS[si%BPOS.length];
                      const isVillain=/villain|antagonist|enemy|evil/i.test(d.character||"");
                      const isThought=d.type==="thought";
                      const bg=isVillain?"rgba(15,0,10,0.95)":"rgba(255,255,255,0.96)";
                      const tc=isVillain?"#ffccee":"#111";
                      const bc=isVillain?"#e84393":"rgba(0,0,0,0.2)";
                      return (
                        <div key={si} style={{position:"absolute",zIndex:10,...pos,maxWidth:"38%"}}>
                          <div style={{position:"relative",display:"inline-block"}}>
                            <div style={{background:bg,border:`1.5px solid ${bc}`,borderRadius:isThought?"40%/35%":"999px",padding:"5px 11px",boxShadow:"0 2px 10px rgba(0,0,0,0.6)",maxWidth:"100%"}}>
                              {d.character&&<div style={{fontSize:9,fontWeight:700,color:tc,opacity:0.6,marginBottom:2}}>{isThought?`${d.character} (thinking)`:d.character}</div>}
                              <div style={{fontSize:11,color:tc,lineHeight:1.4,fontWeight:600,fontFamily:"'DM Sans',Arial,sans-serif",textAlign:"center",fontStyle:isThought?"italic":"normal"}}>{d.text}</div>
                            </div>
                            {!isThought&&<div style={{position:"absolute",bottom:-7,left:"50%",transform:"translateX(-50%)",width:0,height:0,borderLeft:"5px solid transparent",borderRight:"5px solid transparent",borderTop:`7px solid ${bg}`}}/>}
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

