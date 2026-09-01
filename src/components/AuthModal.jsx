import { useState } from "react";
import { DEMO, signUp, signIn } from "../lib/supabase.js";
import { Btn, Spinner } from "./UI.jsx";
import { useTheme } from "../ThemeContext.jsx";

export default function AuthModal({onAuth, onClose}) {
  const C = useTheme();
  const [mode,setMode] = useState("login");
  const [email,setEmail]=useState(""); const [pw,setPw]=useState(""); const [uname,setUname]=useState("");
  const [loading,setLoading]=useState(false); const [err,setErr]=useState("");

  const submit = async e => {
    e.preventDefault(); setErr(""); setLoading(true);
    try {
      const session = mode==="signup" ? await signUp(email,pw,uname) : await signIn(email,pw);
      onAuth(session, pw);
    } catch(e){ console.error("Auth error:", e); setErr(e.message || "Network error — check console"); } finally { setLoading(false); }
  };

  const inp = {width:"100%",padding:"9px 12px",borderRadius:8,border:`0.5px solid ${C.border2}`,background:C.card,color:C.text,fontSize:13,fontFamily:"inherit",outline:"none"};

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.8)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{background:C.surf,border:`0.5px solid ${C.border2}`,borderRadius:16,padding:"28px 32px",width:380,animation:"fadeUp .2s ease"}}>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:22}}>
          <div style={{width:32,height:32,borderRadius:8,background:`linear-gradient(135deg,${C.purple},${C.pink})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16}}>✦</div>
          <div style={{fontFamily:"'Cinzel',serif",fontSize:16,fontWeight:700}}>Manga<span style={{color:C.purple}}>MultiVerse</span></div>
        </div>
        <div style={{display:"flex",gap:0,marginBottom:20,background:C.card,borderRadius:9,padding:3}}>
          {["login","signup"].map(m=><button key={m} onClick={()=>{setMode(m);setErr("");}} style={{flex:1,padding:"7px 0",borderRadius:7,fontSize:12,border:"none",background:mode===m?C.purple:"transparent",color:mode===m?"#fff":C.muted,cursor:"pointer",fontFamily:"inherit",fontWeight:mode===m?500:400}}>{m==="login"?"Sign in":"Create account"}</button>)}
        </div>
        {DEMO && <div style={{padding:"8px 12px",borderRadius:7,background:C.gold+"18",border:`0.5px solid ${C.gold}44`,marginBottom:14,fontSize:11,color:C.gold}}>⚡ Demo mode — any email & password works</div>}
        <form onSubmit={submit}>
          {mode==="signup" && <div style={{marginBottom:12}}><div style={{fontSize:11,color:C.muted,marginBottom:4,textTransform:"uppercase",letterSpacing:"0.06em"}}>Username</div><input value={uname} onChange={e=>setUname(e.target.value)} placeholder="your_username" required style={inp}/></div>}
          <div style={{marginBottom:12}}><div style={{fontSize:11,color:C.muted,marginBottom:4,textTransform:"uppercase",letterSpacing:"0.06em"}}>Email</div><input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com" required autoComplete="email" style={inp}/></div>
          <div style={{marginBottom:14}}><div style={{fontSize:11,color:C.muted,marginBottom:4,textTransform:"uppercase",letterSpacing:"0.06em"}}>Password</div><input type="password" value={pw} onChange={e=>setPw(e.target.value)} placeholder="••••••••" required autoComplete={mode==="signup"?"new-password":"current-password"} style={inp}/></div>
          {err && <div style={{fontSize:12,color:"#e24b4a",padding:"7px 10px",background:"#e24b4a18",borderRadius:7,marginBottom:12}}>{err}</div>}
          <Btn type="submit" v="pri" disabled={loading} sx={{width:"100%",padding:"10px 0",fontSize:13}}>{loading?<Spinner size={14}/>:mode==="login"?"Sign in →":"Create account →"}</Btn>
        </form>
        <button onClick={onClose} style={{display:"block",width:"100%",marginTop:12,padding:"7px 0",background:"transparent",border:"none",color:C.muted,fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>Continue as guest</button>
      </div>
    </div>
  );
}

