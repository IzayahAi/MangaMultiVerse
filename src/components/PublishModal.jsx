import { useState } from "react";
import { LANGS, rndCover } from "../constants.js";
import { Tag, Btn, Spinner } from "./UI.jsx";
import { useTheme } from "../ThemeContext.jsx";

export default function PublishModal({story, onPublish, onClose, saving}) {
  const C = useTheme();
  const [autoLangs,setAuto] = useState(["Spanish","French","German","Portuguese"]);
  const tog = l => setAuto(p => p.includes(l)?p.filter(x=>x!==l):[...p,l]);
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
        <div style={{marginBottom:20}}>
          <div style={{fontSize:10,color:C.muted,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:8}}>Auto-translate to (AI handles these on publish)</div>
          <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
            {LANGS.filter(l=>l!=="English").map(l=><button key={l} onClick={()=>tog(l)} style={{fontSize:11,padding:"4px 10px",borderRadius:7,border:`0.5px solid ${autoLangs.includes(l)?C.purple:C.border}`,background:autoLangs.includes(l)?C.purple+"22":"transparent",color:autoLangs.includes(l)?C.purpleL:C.muted,cursor:"pointer",fontFamily:"inherit"}}>{l}</button>)}
          </div>
          <div style={{fontSize:11,color:C.muted,marginTop:7}}>+ {autoLangs.length} language{autoLangs.length!==1?"s":""} selected — story will be live in all of them</div>
        </div>
        <div style={{display:"flex",gap:10}}>
          <Btn onClick={onClose} sx={{flex:1}}>Cancel</Btn>
          <Btn v="pri" onClick={()=>onPublish(autoLangs)} disabled={saving} sx={{flex:2,justifyContent:"center"}}>{saving?<><Spinner size={13}/>Publishing…</>:"✦ Publish to library →"}</Btn>
        </div>
      </div>
    </div>
  );
}
