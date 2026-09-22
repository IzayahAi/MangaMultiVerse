import { useState, useEffect } from "react";
import { LANG_GROUPS, RECOMMENDED_LANGS, rndCover, TRANSLATION_ENABLED } from "../constants.js";
import { fetchTranslatedLangs } from "../lib/supabase.js";
import { Tag, Btn, Spinner } from "./UI.jsx";
import { useTheme } from "../ThemeContext.jsx";

export default function PublishModal({story, onPublish, onClose, saving, progress, canTranslate = TRANSLATION_ENABLED, maxLangs = 999}) {
  const C = useTheme();
  const [autoLangs,setAuto] = useState(["Spanish","French","German","Portuguese"]);
  const [storedLangs,setStoredLangs] = useState([]); // already translated → pre-selected + marked ✓
  const tog = l => setAuto(p => p.includes(l)?p.filter(x=>x!==l):[...p,l]);
  const ALL_LANGS = LANG_GROUPS.flatMap(g=>g.langs).filter(l=>l!=="English");
  const allSelected = autoLangs.length >= ALL_LANGS.length;
  // Remember the languages this story is already translated into: pre-select them so you don't have
  // to re-pick every publish (they're skipped, not re-translated, so it costs nothing).
  useEffect(() => {
    if (!story?.id) return;
    let active = true;
    fetchTranslatedLangs(story.id).then(ls => {
      if (!active) return;
      const arr = Array.isArray(ls) ? ls.filter(l => l !== "English") : [];
      setStoredLangs(arr);
      if (arr.length) setAuto(prev => [...new Set([...prev, ...arr])]);
    });
    return () => { active = false; };
  }, [story?.id]);
  const checks = [[true,"Story concept generated"],[!!story.script,"Chapter 1 script written"],[!!story.character_brief,"Character design brief created"],[true,"Original language set (English)"]];
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.85)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
      <div style={{background:C.surf,border:`0.5px solid ${C.border2}`,borderRadius:16,padding:"24px 28px",width:"100%",maxWidth:540,animation:"fadeUp .2s ease",maxHeight:"90vh",overflowY:"auto"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20}}>
          <div style={{fontSize:15,fontWeight:500,color:C.text}}>✦ Publish to MangaMultiVerse</div>
          <button onClick={onClose} style={{background:"transparent",border:"none",color:C.muted,cursor:"pointer",fontSize:20,lineHeight:1}}>×</button>
        </div>
        <div style={{display:"flex",gap:14,padding:14,background:C.card,borderRadius:10,border:`0.5px solid ${C.border}`,marginBottom:18}}>
          <div style={{width:66,height:90,borderRadius:8,background:story.cover_color||rndCover(),display:"flex",alignItems:"center",justifyContent:"center",fontSize:30,flexShrink:0}}>{story.emoji||"📖"}</div>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:14,fontWeight:500,color:C.text,marginBottom:3}}>{story.title}</div>
            <div style={{fontSize:11,color:C.muted,fontStyle:"italic",marginBottom:8,lineHeight:1.5}}>{story.tagline}</div>
            <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>{(story.genre_tags||[]).map(g=><Tag key={g} c={C.purple}>{g}</Tag>)}</div>
          </div>
        </div>
        <div style={{marginBottom:18}}>
          <div style={{fontSize:10,color:C.muted,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:10}}>Checklist</div>
          {checks.map(([done,label],i)=><div key={i} style={{display:"flex",alignItems:"center",gap:9,padding:"7px 0",borderBottom:`0.5px solid ${C.border}`,fontSize:12}}><span style={{fontSize:14,color:done?C.teal:C.muted}}>{done?"✓":"○"}</span><span style={{color:done?C.text:C.muted,flex:1}}>{label}</span>{!done&&<Tag c={C.gold}>Optional</Tag>}</div>)}
        </div>
        {canTranslate ? (
        <div style={{marginBottom:20}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
            <div style={{fontSize:10,color:C.muted,textTransform:"uppercase",letterSpacing:"0.07em"}}>Languages readers can translate into</div>
            <button onClick={()=>setAuto(allSelected?[]:ALL_LANGS)} style={{fontSize:10,padding:"4px 11px",borderRadius:7,border:`0.5px solid ${allSelected?C.border2:C.purple}`,background:allSelected?"transparent":C.purple+"18",color:allSelected?C.muted:C.purpleL,cursor:"pointer",fontFamily:"inherit",fontWeight:500,whiteSpace:"nowrap"}}>
              {allSelected?"Clear all":`Select all ${ALL_LANGS.length}`}
            </button>
          </div>
          <div style={{maxHeight:220,overflowY:"auto",paddingRight:4}}>
            {[{region:"✦ Recommended",langs:RECOMMENDED_LANGS,rec:true},...LANG_GROUPS].map(g=>{
              const opts=g.langs.filter(l=>l!=="English");
              if(!opts.length) return null;
              return (
                <div key={g.region} style={{marginBottom:10}}>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:5}}>
                    <div style={{fontSize:9,color:g.rec?C.purpleL:C.muted,textTransform:"uppercase",letterSpacing:"0.08em",fontWeight:g.rec?700:400,opacity:g.rec?1:0.8}}>{g.region}</div>
                    {g.rec && <button onClick={()=>setAuto(p=>[...new Set([...p,...RECOMMENDED_LANGS])])} style={{fontSize:9,padding:"2px 8px",borderRadius:6,border:`0.5px solid ${C.purple}`,background:C.purple+"18",color:C.purpleL,cursor:"pointer",fontFamily:"inherit"}}>Select these</button>}
                  </div>
                  <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                    {opts.map(l=>{
                      const done=storedLangs.includes(l), sel=autoLangs.includes(l);
                      return <button key={l} onClick={()=>tog(l)} title={done?"Already translated — will be skipped":""} style={{fontSize:11,padding:"4px 10px",borderRadius:7,border:`0.5px solid ${done?C.teal:sel?C.purple:C.border}`,background:done?C.teal+"1e":sel?C.purple+"22":"transparent",color:done?C.teal:sel?C.purpleL:C.muted,cursor:"pointer",fontFamily:"inherit"}}>{done?"✓ ":""}{l}</button>;
                    })}
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{fontSize:11,color:C.muted,marginTop:7}}>{autoLangs.length} language{autoLangs.length!==1?"s":""} pre-translated at publish (instant for readers) · readers can still translate into any of the {LANG_GROUPS.reduce((n,g)=>n+g.langs.length,0)} languages on demand</div>
          {autoLangs.length>=12 && <div style={{fontSize:10.5,color:C.gold,marginTop:5}}>⚠ Pre-translating {autoLangs.length} languages runs {autoLangs.length} translation passes — publishing will take a few minutes.</div>}
        </div>
        ) : (
          <div style={{marginBottom:20,fontSize:11,color:C.muted,padding:"10px 12px",background:C.card,borderRadius:8,border:`0.5px solid ${C.border}`}}>Published in English. Multi-language translation is a Pro feature — upgrade to pre-translate your manga.</div>
        )}
        {saving && progress && <div style={{fontSize:12,color:C.purpleL,marginBottom:12,textAlign:"center"}}>{progress}</div>}
        <div style={{display:"flex",gap:10}}>
          <Btn onClick={onClose} sx={{flex:1}} disabled={saving}>Cancel</Btn>
          <Btn v="pri" onClick={()=>onPublish(canTranslate?autoLangs.slice(0,maxLangs):[])} disabled={saving} sx={{flex:2,justifyContent:"center"}}>{saving?<><Spinner size={13}/>{progress?"Translating…":"Publishing…"}</>:"✦ Publish to library →"}</Btn>
        </div>
      </div>
    </div>
  );
}
