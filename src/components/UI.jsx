import { useEffect } from "react";
import { STATUS_COLOR, STATUS_DOT, rndCover, isAgeVerified } from "../constants.js";
import { useTheme } from "../ThemeContext.jsx";

export const Tag = ({c, children, sx={}}) => {
  const C = useTheme();
  const col = c || C.purple;
  return <span style={{fontSize:10,padding:"2px 8px",borderRadius:99,background:col+"22",color:col,border:`0.5px solid ${col}44`,fontWeight:500,whiteSpace:"nowrap",...sx}}>{children}</span>;
};

export const Btn = ({children,onClick,v="ghost",disabled,type="button",sx={}}) => {
  const C = useTheme();
  const vs = {
    ghost: {bg:"transparent", bd:`0.5px solid ${C.border2}`, cl:C.muted},
    pri:   {bg:`linear-gradient(135deg,${C.purple},${C.pink})`, bd:"none", cl:"#fff"},
    soft:  {bg:C.purple+"22", bd:`0.5px solid ${C.purple}44`, cl:C.purpleL},
    teal:  {bg:C.teal+"18", bd:`0.5px solid ${C.teal}44`, cl:C.teal},
  };
  const s = vs[v]||vs.ghost;
  return <button type={type} onClick={onClick} disabled={disabled} style={{padding:"7px 16px",borderRadius:8,fontSize:12,cursor:disabled?"default":"pointer",fontFamily:"inherit",fontWeight:500,transition:"all .15s",opacity:disabled?.5:1,background:s.bg,border:s.bd,color:s.cl,...sx}}>{children}</button>;
};

export const Field = ({label,value,editing,onChange,multiline}) => {
  const C = useTheme();
  if (editing && onChange) {
    const inp = { width:"100%", padding:"6px 9px", borderRadius:6, border:`0.5px solid ${C.border2}`, background:C.surf, color:C.text, fontSize:12, fontFamily:"inherit", outline:"none", lineHeight:1.5, resize:"vertical" };
    return <div style={{marginBottom:9}}>
      <div style={{fontSize:10,color:C.muted,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:3}}>{label}</div>
      {multiline
        ? <textarea value={value||""} onChange={e=>onChange(e.target.value)} rows={3} style={inp}/>
        : <input value={value||""} onChange={e=>onChange(e.target.value)} style={inp}/>}
    </div>;
  }
  return value ? <div style={{marginBottom:9}}><div style={{fontSize:10,color:C.muted,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:2}}>{label}</div><div style={{fontSize:12,color:C.text,lineHeight:1.65}}>{value}</div></div> : null;
};

export const Sec = ({title,accent,children}) => {
  const C = useTheme();
  const a = accent || C.purple;
  return <div style={{marginBottom:16}}><div style={{display:"flex",alignItems:"center",gap:7,marginBottom:8}}><div style={{width:3,height:14,borderRadius:99,background:a}}/><span style={{fontSize:12,fontWeight:500,color:C.text}}>{title}</span></div>{children}</div>;
};

export const Spinner = ({size=16}) => {
  const C = useTheme();
  return <svg width={size} height={size} viewBox="0 0 16 16" style={{animation:"spin .8s linear infinite",flexShrink:0}}><circle cx="8" cy="8" r="6" fill="none" stroke={C.purple} strokeWidth="2" strokeDasharray="20 8" strokeLinecap="round"/><style>{`@keyframes spin{to{transform:rotate(360deg)}}@keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}`}</style></svg>;
};

export const Toast = ({msg,type="ok",onDone}) => {
  const C = useTheme();
  useEffect(()=>{ const t=setTimeout(onDone,type==="warn"?5000:3200); return ()=>clearTimeout(t); },[]);
  const col = type==="err"?"#e24b4a":type==="warn"?C.gold:C.teal;
  const icon = type==="err"?"✕":type==="warn"?"⚠":"✓";
  return (
    <div style={{position:"fixed",bottom:24,left:"50%",transform:"translateX(-50%)",background:C.card,border:`0.5px solid ${col}`,borderRadius:10,padding:"10px 20px",fontSize:13,color:C.text,zIndex:999,animation:"fadeUp .2s ease",display:"flex",alignItems:"center",gap:9,maxWidth:480,boxShadow:"0 8px 32px rgba(0,0,0,0.3)"}}>
      <span style={{color:col,fontSize:14}}>{icon}</span>
      <span style={{flex:1}}>{msg}</span>
      {type==="warn"&&<button onClick={onDone} style={{background:"transparent",border:"none",color:C.muted,cursor:"pointer",fontSize:16,lineHeight:1,flexShrink:0}}>×</button>}
    </div>
  );
};

export const CoverCard = ({item,onClick,aiMade}) => {
  const C = useTheme();
  const statusColor = {ongoing:C.teal, completed:C.blue, hiatus:C.gold, published:C.teal};
  const mature = item.content_rating === "mature";
  const gated = mature && !isAgeVerified(); // blur the art for unverified viewers (kids)
  return (
    <div onClick={onClick} style={{cursor:"pointer",borderRadius:12,overflow:"hidden",border:`0.5px solid ${C.border}`,background:C.card,transition:"transform .2s,box-shadow .2s",position:"relative"}}
      onMouseEnter={e=>{e.currentTarget.style.transform="translateY(-4px)";e.currentTarget.style.boxShadow=`0 12px 32px rgba(0,0,0,0.15)`;e.currentTarget.style.borderColor=C.border2;}}
      onMouseLeave={e=>{e.currentTarget.style.transform="";e.currentTarget.style.boxShadow="";e.currentTarget.style.borderColor=C.border;}}>
      <div style={{height:150,background:`linear-gradient(160deg, ${item.cover_color||rndCover()}, ${item.cover_color||rndCover()}99)`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:52,position:"relative",overflow:"hidden",filter:gated?"blur(14px)":"none"}}>
        <div style={{position:"absolute",inset:0,background:"linear-gradient(to bottom, transparent 40%, rgba(0,0,0,0.7))"}}/>
        {item.emoji||"📖"}
        {aiMade && <div style={{position:"absolute",top:8,left:8,zIndex:1}}><Tag c={C.purple}>✦ AI</Tag></div>}
        {!gated && <div style={{position:"absolute",bottom:8,left:10,right:10,zIndex:1}}>
          <div style={{fontSize:12,fontWeight:600,color:"#fff",lineHeight:1.3,textShadow:"0 1px 4px rgba(0,0,0,0.8)",overflow:"hidden",display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical"}}>{item.title}</div>
        </div>}
      </div>
      {mature && <div style={{position:"absolute",top:8,right:8,zIndex:2,fontSize:9,fontWeight:700,color:"#fff",background:"#e24b4a",padding:"2px 6px",borderRadius:5,letterSpacing:"0.03em"}}>18+</div>}
      {gated && <div style={{position:"absolute",top:0,left:0,right:0,height:150,zIndex:2,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:4,color:"#fff",pointerEvents:"none"}}>
        <div style={{fontSize:24}}>🔞</div>
        <div style={{fontSize:11,fontWeight:600}}>Mature · 18+</div>
        <div style={{fontSize:9,opacity:0.8}}>Confirm your age to view</div>
      </div>}
      <div style={{padding:"8px 10px"}}>
        <div style={{fontSize:10,color:C.muted,marginBottom:5}}>{item.author_name||item.author||"—"}</div>
        <div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:6}}>{(item.genre_tags||[]).slice(0,2).map(g=><Tag key={g} c={C.dim} sx={{color:C.muted,fontSize:9}}>{g}</Tag>)}</div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",fontSize:10,color:C.muted}}>
          <span style={{color:statusColor[item.status]||C.teal}}>{STATUS_DOT[item.status]||"🟢"} {item.status||"ongoing"}</span>
          <span>⭐{item.rating||"—"}</span>
          <span>{item.chapters||0}ch</span>
        </div>
      </div>
    </div>
  );
};
