import { useState, useEffect, useCallback, useRef } from "react";
import { SEED_LIB, GENRES, ORIGINS, rndCover, LANG_GROUPS } from "./constants.js";
import { useTheme, useThemeToggle } from "./ThemeContext.jsx";
import { useI18n } from "./lib/i18n.jsx";
import { DEMO, useDB, signIn, registerSession, ensureFreshToken, spendCredits, fetchPublishedStories, saveTranslation, saveChapter, deleteChapter, saveBible, logError } from "./lib/supabase.js";
import { setApiToken } from "./lib/claude.js";
import { Tag, Btn, Toast, CoverCard } from "./components/UI.jsx";
import { STATUS_COLOR, STATUS_DOT, RELEASE_MODE, isAgeVerified } from "./constants.js";
import AuthModal from "./components/AuthModal.jsx";
import Studio from "./components/Studio.jsx";
import CreatorDashboard from "./components/CreatorDashboard.jsx";
import MangaReader from "./components/MangaReader.jsx";
import AdminDashboard from "./components/AdminDashboard.jsx";
import AgentsPage from "./components/AgentsPage.jsx";
import PricingPage from "./components/PricingPage.jsx";
import AgeGate from "./components/AgeGate.jsx";
import LegalPage from "./components/LegalPage.jsx";
import { SUPPORT_EMAIL } from "./constants.js";
import { buildShelves } from "./lib/curation.js";

export default function MangaMultiVerse() {
  const C = useTheme();
  const { t, lang, setLang, translating } = useI18n();
  const [dark, toggleDark] = useThemeToggle();
  const [page,setPage]       = useState(() => localStorage.getItem("mv_page") || "home");
  const [dashTab,setDashTab] = useState("feed");
  const [readingList,setReadingList] = useState(() => {
    try { return JSON.parse(localStorage.getItem("mv_reading")||"[]"); } catch { return []; }
  });
  const [activity,setActivity] = useState([]);
  const [auth,setAuth] = useState(() => {
    try {
      const s = localStorage.getItem("mv_auth");
      if (!s) return null;
      const parsed = JSON.parse(s);
      if (!parsed?.user?.id || !parsed?.token) { localStorage.removeItem("mv_auth"); return null; }
      return parsed;
    } catch { localStorage.removeItem("mv_auth"); return null; }
  });
  const [showAuth,setShowAuth] = useState(false);
  const [editStory,setEditStory] = useState(null);
  const [fG,setFG]           = useState("All");
  const [fO,setFO]           = useState("All");
  const [q,setQ]             = useState("");
  const [sel,setSel]         = useState(null);
  const [reading,setReading] = useState(null);
  const [ageOk,setAgeOk]     = useState(isAgeVerified()); // 18+ confirmed for Mature content
  const [legalDoc,setLegalDoc] = useState("terms"); // which policy the Legal page shows
  const [toast,setToast]     = useState(null);

  const db = useDB(auth?.token, auth?.user?.id);

  // Public feed: every author's published stories (not just the signed-in user's)
  const [publicStories, setPublicStories] = useState([]);
  const refreshPublic = useCallback(() => {
    fetchPublishedStories().then(rows => { if (Array.isArray(rows)) setPublicStories(rows); });
  }, []);
  useEffect(() => {
    let active = true;
    fetchPublishedStories().then(rows => { if (active && Array.isArray(rows)) setPublicStories(rows); });
    return () => { active = false; };
  }, [auth?.user?.id]);

  // Merge the user's own published stories with the public feed, de-duped by id
  const myPublished = db.stories.filter(s=>s.status==="published");
  const publishedMap = new Map();
  [...publicStories, ...myPublished].forEach(s => publishedMap.set(s.id, s));
  const published = [...publishedMap.values()];
  const all = [...SEED_LIB, ...published];
  // ✨ Curator — reader-facing shelves from the published catalog (mirrors the curate agent). Cheap, instant.
  const shelves = buildShelves(published);

  // Deep link: /s/<id> (the sitemap + share URLs) opens that published story in the reader, once the
  // catalog has loaded. A ref makes it fire only once so it doesn't re-open after the user navigates.
  const deepLinkRef = useRef(false);
  useEffect(() => {
    if (deepLinkRef.current) return;
    const m = /^\/s\/([^/?#]+)/.exec(window.location.pathname || "");
    if (!m) { deepLinkRef.current = true; return; }
    const story = all.find(s => String(s.id) === decodeURIComponent(m[1]));
    if (story) { setReading(story); setPage("home"); deepLinkRef.current = true; }
  }, [published.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const filtered = all.filter(s=>{
    if(fG!=="All"&&!(s.genre_tags||[]).includes(fG)) return false;
    if(fO!=="All"&&s.origin!==fO) return false;
    if(q&&!s.title.toLowerCase().includes(q.toLowerCase())&&!(s.author||s.author_name||"").toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });

  useEffect(() => {
    try {
      if (auth?.user?.id && auth?.token) {
        localStorage.setItem("mv_auth", JSON.stringify({...auth, savedAt: Date.now()}));
      } else {
        localStorage.removeItem("mv_auth");
      }
    } catch {}
  }, [auth]);

  useEffect(() => {
    try { localStorage.setItem("mv_reading", JSON.stringify(readingList)); } catch {}
  }, [readingList]);

  const addToReading = (item) => {
    setReadingList(prev => {
      if (prev.find(r => r.id === item.id)) return prev;
      const entry = {...item, addedAt: new Date().toISOString(), progress: 0, status: "reading"};
      const next = [entry, ...prev];
      setActivity(a => [{type:"started", item, time: new Date().toISOString()}, ...a.slice(0,19)]);
      return next;
    });
    setToast({msg:`Added "${item.title}" to your list!`, type:"ok"});
  };

  const updateProgress = (id, chapter) => {
    setReadingList(prev => prev.map(r => r.id === id ? {...r, progress: chapter, lastRead: new Date().toISOString()} : r));
    const item = readingList.find(r => r.id === id);
    if (item) setActivity(a => [{type:"progress", item, chapter, time: new Date().toISOString()}, ...a.slice(0,19)]);
  };

  const onAuth = (s) => {
    setAuth(s);
    setShowAuth(false);
    try {
      localStorage.setItem("mv_auth", JSON.stringify({...s, savedAt: Date.now()}));
    } catch {}
    setToast({msg:`Welcome, ${s.user.username||s.user.email}! 👋`,type:"ok"});
  };

  const onSignOut = () => {
    setAuth(null);
    localStorage.removeItem("mv_auth");
    setToast({msg:"Signed out",type:"ok"});
  };

  // Keep the /api/* proxy layer's token in sync with the session, and reflect the server-charged
  // credit balance (x-mv-balance) or auth/credit errors returned by a proxy.
  useEffect(() => {
    setApiToken(auth?.token && auth.token !== "demo" ? auth.token : null, (b) => {
      if (typeof b === "number") setAuth(prev => prev ? { ...prev, user: { ...prev.user, credits: b } } : prev);
      else if (b === "out_of_credits") setToast({ msg: "You've reached your limit for now — please try again later.", type: "warn" });
      else if (b === "demo_limit") setToast({ msg: "You've hit today's demo limit — thanks for trying it! Full access is coming when we launch.", type: "warn" });
      else if (b === "auth") { setToast({ msg: "Please sign in to continue.", type: "warn" }); setShowAuth(true); }
    });
  }, [auth?.token]);

  // Observability: capture uncaught errors + unhandled promise rejections to the error sink so breakage
  // surfaces to the admin instead of dying in a tester's console. Best-effort (no-ops without the table).
  useEffect(() => {
    const uid = auth?.user?.id;
    const onErr = (e) => logError({ message: e?.message || "uncaught error", source: "window.onerror", stack: e?.error?.stack, url: e?.filename, userId: uid });
    const onRej = (e) => { const r = e?.reason; logError({ message: "unhandledrejection: " + (r?.message || String(r)), source: "unhandledrejection", stack: r?.stack, userId: uid }); };
    window.addEventListener("error", onErr);
    window.addEventListener("unhandledrejection", onRej);
    return () => { window.removeEventListener("error", onErr); window.removeEventListener("unhandledrejection", onRej); };
  }, [auth?.user?.id]);

  // Keep the request layer's session in sync so any 401 self-refreshes the JWT and retries.
  useEffect(() => {
    registerSession(auth?.refreshToken, (newToken, newRefreshTok) => {
      setAuth(prev => prev ? { ...prev, token: newToken, refreshToken: newRefreshTok } : prev);
      try {
        const stored = JSON.parse(localStorage.getItem("mv_auth") || "null");
        if (stored) localStorage.setItem("mv_auth", JSON.stringify({ ...stored, token: newToken, refreshToken: newRefreshTok, savedAt: Date.now() }));
      } catch {}
    }, () => {
      // Refresh token is dead — surface it clearly (once). Work stays saved locally; prompt re-login.
      if (auth?.token && auth?.token !== "demo") {
        setToast({ msg: "Session expired — sign in again to sync your work to the cloud (it's saved locally for now).", type: "warn" });
        setShowAuth(true);
      }
    });
  }, [auth?.refreshToken]);

  // On load, if the saved token is near expiry, proactively refresh — through the SAME de-duped path
  // as the reactive 401 retry, so the two can't race and rotate each other's refresh token into a
  // dead state. ensureFreshToken syncs auth + localStorage via registerSession's onRefresh callback
  // and fires the expiry notice (toast + sign-in) on genuine failure; it no-ops on transient errors.
  useEffect(() => {
    if (!auth?.token || auth?.token === "demo" || DEMO) return;
    try {
      const parsed = JSON.parse(localStorage.getItem("mv_auth") || "null");
      if (parsed && Date.now() - (parsed.savedAt || 0) > 55 * 60 * 1000) ensureFreshToken();
    } catch {}
  }, []);

  useEffect(() => {
    if (!auth?.token || auth?.token === "demo" || DEMO) return;
    const interval = setInterval(() => { ensureFreshToken(); }, 45 * 60 * 1000);
    return () => clearInterval(interval);
  }, [auth?.token]);

  const onSaveStory = async story => {
    if(!auth){ setShowAuth(true); throw new Error("Not signed in"); }
    const saved = await db.upsert({...story,author_name:auth.user.username});
    if (saved?.status === "published") refreshPublic(); // surface it to everyone right away
    return saved;
  };

  const onUseCredits = async (amount) => {
    // The server proxies are the sole credit charger in BOTH modes now (one-time per-account allotment,
    // enforced via spend_credits). They report the new balance via x-mv-balance → setApiToken's onBalance,
    // so the client must NOT decrement here (that would double-charge). No-op; display updates from onBalance.
    return auth?.user?.credits ?? 0;
  };

  const NAV = [
    {id:"home",label:t("nav.home")},
    {id:"library",label:t("nav.library")},
    {id:"studio",label:t("nav.studio")},
    {id:"creator",label:t("nav.creator")},
    ...((RELEASE_MODE || auth?.user?.role==="admin") ? [{id:"pricing",label:"Subscription"}] : []),
    ...(auth?.user?.role==="admin" ? [{id:"agents",label:"✦ Agents"}] : []),
    ...(auth?.user ? [{id:"dashboard",label:"⬡ Dashboard"}] : []),
  ];

  const go = id => { setPage(id); setSel(null); setReading(null); try { localStorage.setItem("mv_page", id); } catch {} };
  const goLegal = doc => { setLegalDoc(doc); go("legal"); window.scrollTo(0, 0); };

  // Load an existing story back into the Studio to edit (same record — no duplicate on save)
  const onEditStory = (s) => { setEditStory({...s, _loadedAt: Date.now()}); setSel(null); setReading(null); setPage("studio"); try { localStorage.setItem("mv_page","studio"); } catch {} };

  return (
    <div style={{background:C.bg,minHeight:"100vh",color:C.text,fontFamily:"'DM Sans',system-ui,sans-serif",fontSize:14}}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500&family=Cinzel:wght@500;700&display=swap" rel="stylesheet"/>
      {toast&&<Toast msg={toast.msg} type={toast.type} onDone={()=>setToast(null)}/>}
      {showAuth&&<AuthModal onAuth={onAuth} onClose={()=>setShowAuth(false)}/>}

      <div style={{borderBottom:`0.5px solid ${C.border}`,background:C.surf,position:"sticky",top:0,zIndex:40}}>
        <div style={{maxWidth:1100,margin:"0 auto",padding:"0 20px",display:"flex",alignItems:"center"}}>
          <div style={{display:"flex",alignItems:"center",gap:9,marginRight:24,padding:"12px 0",cursor:"pointer"}} onClick={()=>go("home")}>
            <div style={{width:30,height:30,borderRadius:8,background:`linear-gradient(135deg,${C.purple},${C.pink})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14}}>✦</div>
            <span style={{fontFamily:"'Cinzel',serif",fontSize:15,fontWeight:700,letterSpacing:"0.03em"}}>Manga<span style={{color:C.purple}}>MultiVerse</span></span>
          </div>
          <div style={{display:"flex",flex:1}}>
            {NAV.map(n=><button key={n.id} onClick={()=>go(n.id)} style={{padding:"14px 15px",fontSize:13,border:"none",borderBottom:`2px solid ${page===n.id?C.purple:"transparent"}`,background:"transparent",color:page===n.id?C.purple:n.id==="studio"?C.pink:C.muted,cursor:"pointer",fontFamily:"inherit",fontWeight:page===n.id?500:400,transition:"all .12s"}}>{n.label}</button>)}
          </div>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            {RELEASE_MODE && <div style={{position:"relative",display:"flex",alignItems:"center"}} title={t("lang.label")}>
              <span style={{position:"absolute",left:8,pointerEvents:"none",fontSize:12}}>🌐</span>
              <select value={lang} onChange={e=>setLang(e.target.value)} aria-label={t("lang.label")}
                style={{appearance:"none",padding:"6px 10px 6px 26px",borderRadius:8,border:`0.5px solid ${C.border2}`,background:C.card,color:C.muted,fontSize:12,fontFamily:"inherit",cursor:"pointer",maxWidth:130,outline:"none"}}>
                {LANG_GROUPS.map(g=>(<optgroup key={g.region} label={g.region}>{g.langs.map(l=><option key={l} value={l}>{l}</option>)}</optgroup>))}
              </select>
              {translating && <span style={{position:"absolute",right:-14,fontSize:10,color:C.purpleL}}>⟳</span>}
            </div>}
            <button onClick={toggleDark} title={dark?t("theme.toLight"):t("theme.toDark")} style={{width:32,height:32,borderRadius:8,border:`0.5px solid ${C.border2}`,background:C.card,color:C.muted,cursor:"pointer",fontSize:15,display:"flex",alignItems:"center",justifyContent:"center",transition:"all .15s"}}>{dark?"☀":"🌙"}</button>
            {auth?(
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <div style={{width:28,height:28,borderRadius:"50%",background:C.purple,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:500,color:"#fff"}}>{String(auth.user.username||auth.user.email)[0].toUpperCase()}</div>
                <span style={{fontSize:12,color:C.muted}}>{auth.user.username}</span>
                <Btn onClick={onSignOut} sx={{fontSize:11,padding:"4px 10px"}}>{t("auth.signOut")}</Btn>
              </div>
            ):<Btn v="soft" onClick={()=>setShowAuth(true)} sx={{fontSize:12}}>{t("auth.signIn")}</Btn>}
          </div>
        </div>
      </div>

      <div style={{maxWidth:1100,margin:"0 auto",padding:"24px 20px"}}>

        {page==="home"&&!sel&&!reading&&(
          <div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 300px",gap:20,alignItems:"start"}}>
              <div>
                <div style={{display:"flex",gap:0,borderBottom:`0.5px solid ${C.border}`,marginBottom:18}}>
                  {[["feed","Activity"],["reading","Reading List"],["stats","Stats"]].map(([id,label])=>(
                    <button key={id} onClick={()=>setDashTab(id)} style={{padding:"8px 18px",fontSize:12,border:"none",borderBottom:`2px solid ${dashTab===id?C.purple:"transparent"}`,background:"transparent",color:dashTab===id?C.purple:C.muted,cursor:"pointer",fontFamily:"inherit",fontWeight:dashTab===id?500:400}}>
                      {label}
                    </button>
                  ))}
                </div>

                {dashTab==="feed"&&(
                  <div>
                    {!auth&&(
                      <div style={{padding:"24px",background:`linear-gradient(135deg,${C.purple}18,${C.pink}0a)`,borderRadius:12,border:`0.5px solid ${C.purple}44`,marginBottom:16,textAlign:"center"}}>
                        <div style={{fontSize:28,marginBottom:8}}>✦</div>
                        <div style={{fontSize:16,fontWeight:700,fontFamily:"'Cinzel',serif",marginBottom:6}}>Welcome to MangaMultiVerse</div>
                        <div style={{fontSize:12,color:C.muted,marginBottom:16,lineHeight:1.7}}>{t("home.welcomeSub")}</div>
                        <div style={{display:"flex",gap:8,justifyContent:"center"}}>
                          <Btn v="pri" onClick={()=>setShowAuth(true)} sx={{padding:"9px 24px"}}>{t("auth.signIn")}</Btn>
                          <Btn v="soft" onClick={()=>go("library")} sx={{padding:"9px 24px"}}>{t("auth.browseLibrary")}</Btn>
                        </div>
                      </div>
                    )}
                    {auth&&(
                      <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:20}}>
                        {activity.length===0?(
                          <div style={{padding:"24px",background:C.card,borderRadius:10,border:`0.5px solid ${C.border}`,textAlign:"center"}}>
                            <div style={{fontSize:24,marginBottom:8}}>📖</div>
                            <div style={{fontSize:13,color:C.muted,marginBottom:12}}>Your activity feed is empty. Start reading something!</div>
                            <Btn v="soft" onClick={()=>go("library")}>Browse library →</Btn>
                          </div>
                        ):(
                          activity.map((a,i)=>(
                            <div key={i} style={{padding:"12px 14px",background:C.card,borderRadius:10,border:`0.5px solid ${C.border}`,display:"flex",alignItems:"center",gap:12}}>
                              <div style={{width:36,height:48,borderRadius:6,background:a.item?.cover_color||C.dim,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>{a.item?.emoji||"📖"}</div>
                              <div style={{flex:1}}>
                                <div style={{fontSize:12,color:C.text}}><span style={{color:C.purple,fontWeight:500}}>{auth.user.username}</span> {a.type==="started"?"started reading":"read chapter "+a.chapter+" of"} <span style={{fontWeight:500}}>{a.item?.title}</span></div>
                                <div style={{fontSize:10,color:C.muted,marginTop:2}}>{new Date(a.time).toLocaleDateString()}</div>
                              </div>
                              {a.type==="started"&&<Tag c={C.teal}>New</Tag>}
                              {a.type==="progress"&&<Tag c={C.purple}>Ch.{a.chapter}</Tag>}
                            </div>
                          ))
                        )}
                      </div>
                    )}
                    {/* ✨ Curator shelves — trending, fresh, and themed-by-genre rows (Netflix/Webtoon style). */}
                    {(() => {
                      const Shelf = ({ label, items, viewAll }) => (items && items.length) ? (
                        <div style={{marginBottom:22}}>
                          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
                            <div style={{fontSize:13,fontWeight:600,color:C.text}}>{label}</div>
                            {viewAll && <button onClick={()=>go("library")} style={{fontSize:11,color:C.purple,background:"transparent",border:"none",cursor:"pointer",fontFamily:"inherit"}}>View all →</button>}
                          </div>
                          <div style={{display:"flex",gap:10,overflowX:"auto",paddingBottom:6,scrollbarWidth:"thin"}}>
                            {items.map(item=>(
                              <div key={item.id} style={{width:148,flexShrink:0}}>
                                <CoverCard item={item} aiMade={!!item.author_name&&!item.author} onClick={()=>{setSel(item);setPage("library");}}/>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null;
                      return (
                        <div>
                          <Shelf label={`🔥 ${t("home.trending")}`} items={shelves.trending} viewAll />
                          <Shelf label="✦ Fresh from creators" items={shelves.fresh} />
                          {shelves.genreShelves.map(sh => <Shelf key={sh.genre} label={sh.genre} items={sh.items} />)}
                        </div>
                      );
                    })()}
                  </div>
                )}

                {dashTab==="reading"&&(
                  <div>
                    {!auth?(
                      <div style={{padding:24,background:C.card,borderRadius:10,border:`0.5px solid ${C.border}`,textAlign:"center"}}>
                        <div style={{fontSize:13,color:C.muted,marginBottom:12}}>Sign in to track your reading progress</div>
                        <Btn v="pri" onClick={()=>setShowAuth(true)}>Sign in</Btn>
                      </div>
                    ):(
                      <div>
                        <div style={{display:"flex",gap:6,marginBottom:14,flexWrap:"wrap"}}>
                          {["All","Reading","Completed","Paused","Planning"].map(s=>(
                            <button key={s} style={{fontSize:11,padding:"4px 12px",borderRadius:99,border:`0.5px solid ${C.border}`,background:s==="All"?C.purple+"22":"transparent",color:s==="All"?C.purpleL:C.muted,cursor:"pointer",fontFamily:"inherit"}}>
                              {s}
                              {s==="Reading"&&readingList.filter(r=>r.status==="reading").length>0&&(
                                <span style={{marginLeft:4,background:C.purple,color:"#fff",borderRadius:99,padding:"1px 5px",fontSize:9}}>{readingList.filter(r=>r.status==="reading").length}</span>
                              )}
                            </button>
                          ))}
                        </div>
                        {readingList.length===0?(
                          <div style={{padding:24,background:C.card,borderRadius:10,border:`0.5px solid ${C.border}`,textAlign:"center"}}>
                            <div style={{fontSize:32,marginBottom:10}}>📚</div>
                            <div style={{fontSize:13,color:C.muted,marginBottom:12}}>Your reading list is empty.<br/>Browse the library and add series to track!</div>
                            <Btn v="soft" onClick={()=>go("library")}>Browse library →</Btn>
                          </div>
                        ):(
                          <div style={{display:"flex",flexDirection:"column",gap:6}}>
                            {readingList.map(item=>(
                              <div key={item.id} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 14px",background:C.card,border:`0.5px solid ${C.border}`,borderRadius:10,cursor:"pointer"}}
                                onMouseEnter={e=>e.currentTarget.style.borderColor=C.purple}
                                onMouseLeave={e=>e.currentTarget.style.borderColor=C.border}
                                onClick={()=>{setSel(item);setPage("library");}}>
                                <div style={{width:40,height:54,borderRadius:6,background:item.cover_color||C.dim,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>{item.emoji||"📖"}</div>
                                <div style={{flex:1,minWidth:0}}>
                                  <div style={{fontSize:13,fontWeight:500,color:C.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{item.title}</div>
                                  <div style={{fontSize:10,color:C.muted,marginTop:2}}>{item.author_name||item.author||"Unknown"}</div>
                                  <div style={{marginTop:5,height:3,background:C.border,borderRadius:99,overflow:"hidden"}}>
                                    <div style={{height:"100%",background:`linear-gradient(90deg,${C.purple},${C.pink})`,width:`${Math.min(100,(item.progress/(item.chapters||1))*100)}%`,borderRadius:99}}/>
                                  </div>
                                  <div style={{fontSize:9,color:C.muted,marginTop:2}}>Ch. {item.progress||0} / {item.chapters||"?"}</div>
                                </div>
                                <div style={{display:"flex",flexDirection:"column",gap:4,alignItems:"flex-end",flexShrink:0}}>
                                  <Tag c={item.status==="completed"?C.teal:C.purple}>{item.status}</Tag>
                                  <div style={{display:"flex",gap:4}}>
                                    <button onClick={e=>{e.stopPropagation();updateProgress(item.id,(item.progress||0)+1);}} style={{fontSize:10,padding:"2px 8px",borderRadius:5,background:C.purple+"22",border:`0.5px solid ${C.purple}44`,color:C.purpleL,cursor:"pointer",fontFamily:"inherit"}}>+1</button>
                                    <button onClick={e=>{e.stopPropagation();setReading(item);}} style={{fontSize:10,padding:"2px 8px",borderRadius:5,background:C.teal+"18",border:`0.5px solid ${C.teal}44`,color:C.teal,cursor:"pointer",fontFamily:"inherit"}}>Read</button>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {dashTab==="stats"&&(
                  <div>
                    {!auth?(
                      <div style={{padding:24,background:C.card,borderRadius:10,border:`0.5px solid ${C.border}`,textAlign:"center"}}>
                        <div style={{fontSize:13,color:C.muted,marginBottom:12}}>Sign in to see your reading statistics</div>
                        <Btn v="pri" onClick={()=>setShowAuth(true)}>Sign in</Btn>
                      </div>
                    ):(
                      <div>
                        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:20}}>
                          {[
                            ["📚","Series read",readingList.length],
                            ["📖","Chapters read",readingList.reduce((a,r)=>a+(r.progress||0),0)],
                            ["✓","Completed",readingList.filter(r=>r.status==="completed").length],
                          ].map(([icon,label,val])=>(
                            <div key={label} style={{background:C.card,borderRadius:10,padding:"16px 14px",border:`0.5px solid ${C.border}`,textAlign:"center"}}>
                              <div style={{fontSize:24,marginBottom:6}}>{icon}</div>
                              <div style={{fontSize:22,fontWeight:700,color:C.text,marginBottom:2}}>{val}</div>
                              <div style={{fontSize:10,color:C.muted}}>{label}</div>
                            </div>
                          ))}
                        </div>
                        {readingList.length>0&&(()=>{
                          const genreCount = {};
                          readingList.forEach(r=>(r.genre_tags||[]).forEach(g=>{genreCount[g]=(genreCount[g]||0)+1;}));
                          const genres = Object.entries(genreCount).sort((a,b)=>b[1]-a[1]).slice(0,6);
                          const max = genres[0]?.[1]||1;
                          return genres.length>0&&(
                            <div style={{marginBottom:20}}>
                              <div style={{fontSize:12,fontWeight:500,color:C.text,marginBottom:12}}>Genre breakdown</div>
                              {genres.map(([g,count])=>(
                                <div key={g} style={{marginBottom:8}}>
                                  <div style={{display:"flex",justifyContent:"space-between",fontSize:11,marginBottom:3}}>
                                    <span style={{color:C.text}}>{g}</span>
                                    <span style={{color:C.muted}}>{count}</span>
                                  </div>
                                  <div style={{height:5,background:C.border,borderRadius:99,overflow:"hidden"}}>
                                    <div style={{height:"100%",background:`linear-gradient(90deg,${C.purple},${C.pink})`,width:`${(count/max)*100}%`,borderRadius:99,transition:"width .5s"}}/>
                                  </div>
                                </div>
                              ))}
                            </div>
                          );
                        })()}
                        <div style={{marginBottom:16}}>
                          <div style={{fontSize:12,fontWeight:500,color:C.text,marginBottom:10}}>Reading activity</div>
                          <div style={{display:"grid",gridTemplateColumns:"repeat(12,1fr)",gap:3}}>
                            {Array.from({length:84},(_,i)=>{
                              const hasActivity = activity.some(a=>{
                                const d = new Date(a.time);
                                const daysAgo = Math.floor((Date.now()-d)/86400000);
                                return daysAgo===i;
                              });
                              return <div key={i} style={{aspectRatio:"1",borderRadius:2,background:hasActivity?C.purple:C.border,opacity:hasActivity?0.9:0.4}} title={`${i} days ago`}/>;
                            })}
                          </div>
                          <div style={{fontSize:10,color:C.muted,marginTop:6}}>Last 84 days</div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div style={{display:"flex",flexDirection:"column",gap:14}}>
                {auth?(
                  <div style={{background:C.card,borderRadius:12,overflow:"hidden",border:`0.5px solid ${C.border}`}}>
                    <div style={{height:60,background:`linear-gradient(135deg,${C.purple},${C.pink})`,position:"relative"}}>
                      <div style={{position:"absolute",bottom:-20,left:14,width:40,height:40,borderRadius:"50%",background:C.purple,border:`2px solid ${C.card}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,fontWeight:700,color:"#fff"}}>
                        {String(auth.user.username||auth.user.email||"U")[0].toUpperCase()}
                      </div>
                    </div>
                    <div style={{padding:"26px 14px 14px"}}>
                      <div style={{fontSize:13,fontWeight:600,color:C.text}}>{auth.user.username}</div>
                      <div style={{fontSize:10,color:C.muted,marginBottom:10}}>Creator</div>
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6,marginBottom:12}}>
                        {[["Series",db.stories.length],["Reading",readingList.length],["Done",readingList.filter(r=>r.status==="completed").length]].map(([l,v])=>(
                          <div key={l} style={{textAlign:"center",background:C.surf,borderRadius:7,padding:"8px 4px"}}>
                            <div style={{fontSize:16,fontWeight:700,color:C.text}}>{v}</div>
                            <div style={{fontSize:9,color:C.muted}}>{l}</div>
                          </div>
                        ))}
                      </div>
                      <Btn v="soft" onClick={()=>go("creator")} sx={{width:"100%",justifyContent:"center",fontSize:11}}>View dashboard</Btn>
                    </div>
                  </div>
                ):(
                  <div style={{background:C.card,borderRadius:12,padding:"18px 16px",border:`0.5px solid ${C.border}`,textAlign:"center"}}>
                    <div style={{fontSize:22,marginBottom:8}}>✦</div>
                    <div style={{fontSize:13,fontWeight:500,marginBottom:6}}>Track your reading</div>
                    <div style={{fontSize:11,color:C.muted,marginBottom:12,lineHeight:1.6}}>Sign in to track progress, get recommendations, and access AI tools.</div>
                    <Btn v="pri" onClick={()=>setShowAuth(true)} sx={{width:"100%",justifyContent:"center"}}>Sign in / Register</Btn>
                  </div>
                )}
                {published.length>0&&(
                <div style={{background:C.card,borderRadius:12,padding:"14px",border:`0.5px solid ${C.border}`}}>
                  <div style={{fontSize:11,fontWeight:600,color:C.text,marginBottom:10,textTransform:"uppercase",letterSpacing:"0.07em"}}>Recently Updated</div>
                  <div style={{display:"flex",flexDirection:"column",gap:8}}>
                    {[...published].sort((a,b)=>new Date(b.updated_at||b.published_at||0)-new Date(a.updated_at||a.published_at||0)).slice(0,5).map((item)=>(
                      <div key={item.id} onClick={()=>{setSel(item);setPage("library");}} style={{display:"flex",gap:9,cursor:"pointer",padding:"4px 0"}}
                        onMouseEnter={e=>e.currentTarget.style.opacity="0.8"}
                        onMouseLeave={e=>e.currentTarget.style.opacity="1"}>
                        <div style={{width:32,height:44,borderRadius:4,background:item.cover_color||C.dim,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,flexShrink:0}}>{item.emoji||"📖"}</div>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:11,fontWeight:500,color:C.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{item.title}</div>
                          <div style={{fontSize:10,color:C.muted,marginTop:1}}>Ch. {item.chapters||1}</div>
                        </div>
                        <Tag c={C.teal} sx={{fontSize:9,alignSelf:"center"}}>New</Tag>
                      </div>
                    ))}
                  </div>
                </div>
                )}
                <div style={{background:C.card,borderRadius:12,padding:"14px",border:`0.5px solid ${C.border}`}}>
                  <div style={{fontSize:11,fontWeight:600,color:C.text,marginBottom:10,textTransform:"uppercase",letterSpacing:"0.07em"}}>Browse by genre</div>
                  <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
                    {["Action","Fantasy","Romance","Sci-fi","Horror","Sports","Historical","Thriller","Comedy","Drama"].map(g=>(
                      <button key={g} onClick={()=>{setFG(g);go("library");}} style={{fontSize:10,padding:"4px 9px",borderRadius:99,border:`0.5px solid ${C.border}`,background:"transparent",color:C.muted,cursor:"pointer",fontFamily:"inherit",transition:"all .12s"}}
                        onMouseEnter={e=>{e.target.style.borderColor=C.purple;e.target.style.color=C.purpleL;}}
                        onMouseLeave={e=>{e.target.style.borderColor=C.border;e.target.style.color=C.muted;}}>
                        {g}
                      </button>
                    ))}
                  </div>
                </div>
                <div style={{background:`linear-gradient(135deg,${C.purple}22,${C.pink}10)`,borderRadius:12,padding:"16px",border:`0.5px solid ${C.purple}44`}}>
                  <div style={{fontSize:13,fontWeight:600,marginBottom:4}}>✦ AI story studio</div>
                  <div style={{fontSize:11,color:C.muted,marginBottom:12,lineHeight:1.6}}>Create manga from a single sentence. Panels, scripts, translations — all AI-powered.</div>
                  <Btn v="pri" onClick={()=>go("studio")} sx={{width:"100%",justifyContent:"center",fontSize:11}}>Start creating →</Btn>
                </div>
                <div style={{background:C.card,borderRadius:12,padding:"14px",border:`0.5px solid ${C.border}`}}>
                  <div style={{fontSize:11,fontWeight:600,color:C.text,marginBottom:10,textTransform:"uppercase",letterSpacing:"0.07em"}}>Platform stats</div>
                  {[["📚 Series","2,441+"],["👥 Readers","186K"],["🌐 Languages","30"],["🤖 AI stories",db.stories.length.toString()]].map(([l,v])=>(
                    <div key={l} style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderBottom:`0.5px solid ${C.border}`,fontSize:11}}>
                      <span style={{color:C.muted}}>{l}</span>
                      <span style={{color:C.text,fontWeight:500}}>{v}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {page==="library"&&!reading&&(
          <div>
            {sel?(
              <div style={{animation:"fadeUp .2s ease"}}>
                <button onClick={()=>setSel(null)} style={{background:"transparent",border:"none",color:C.muted,cursor:"pointer",fontSize:12,padding:"0 0 16px",fontFamily:"inherit",display:"flex",alignItems:"center",gap:4}}>{t("library.back")}</button>
                <div style={{borderRadius:14,overflow:"hidden",marginBottom:20,position:"relative",background:sel.cover_color||rndCover(),minHeight:160}}>
                  <div style={{position:"absolute",inset:0,background:"linear-gradient(to right, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.4) 60%, transparent 100%)"}}/>
                  <div style={{position:"relative",zIndex:1,padding:"24px 24px",display:"flex",gap:18,alignItems:"flex-start"}}>
                    <div style={{width:90,height:120,borderRadius:8,background:"rgba(0,0,0,0.4)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:48,border:"1px solid rgba(255,255,255,0.1)",flexShrink:0}}>{sel.emoji||"📖"}</div>
                    <div style={{flex:1}}>
                      <div style={{fontSize:22,fontWeight:700,fontFamily:"'Cinzel',serif",color:"#fff",marginBottom:4,lineHeight:1.2}}>{sel.title}</div>
                      <div style={{fontSize:12,color:"rgba(255,255,255,0.6)",marginBottom:8}}>by {sel.author_name||sel.author||"Unknown author"}</div>
                      <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:10}}>
                        {(sel.genre_tags||[]).map(g=><Tag key={g} c={C.purple}>{g}</Tag>)}
                        <Tag c={STATUS_COLOR[sel.status]||C.teal}>{STATUS_DOT[sel.status]||"🟢"} {sel.status||"ongoing"}</Tag>
                      </div>
                      <div style={{display:"flex",gap:6}}>
                        <button onClick={()=>setReading(sel)} style={{padding:"8px 20px",borderRadius:8,background:`linear-gradient(135deg,${C.purple},${C.pink})`,border:"none",color:"#fff",fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>▶ Read now</button>
                        <button onClick={()=>addToReading(sel)} style={{padding:"8px 16px",borderRadius:8,background:readingList.find(r=>r.id===sel.id)?"rgba(29,158,117,0.2)":"rgba(255,255,255,0.1)",border:`0.5px solid ${readingList.find(r=>r.id===sel.id)?"rgba(29,158,117,0.5)":"rgba(255,255,255,0.2)"}`,color:readingList.find(r=>r.id===sel.id)?"#1d9e75":"#fff",fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>
                          {readingList.find(r=>r.id===sel.id)?"✓ In list":"+ Add to list"}
                        </button>
                        {auth?.user?.id && sel.author_id===auth.user.id && !sel.author && (
                          <button onClick={()=>onEditStory(sel)} style={{padding:"8px 16px",borderRadius:8,background:"rgba(168,85,247,0.2)",border:"0.5px solid rgba(168,85,247,0.5)",color:"#fff",fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>✎ Edit</button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginBottom:16}}>
                  {[["Chapters",sel.chapters||0],["Rating",`⭐ ${sel.rating||"New"}`],["Reads",sel.views||"—"],["Languages",`🌐 ${sel.langs||1}`]].map(([l,v])=>(
                    <div key={l} style={{background:C.card,borderRadius:8,padding:"10px 12px",border:`0.5px solid ${C.border}`,textAlign:"center"}}>
                      <div style={{fontSize:14,fontWeight:600,color:C.text}}>{v}</div>
                      <div style={{fontSize:10,color:C.muted,marginTop:2}}>{l}</div>
                    </div>
                  ))}
                </div>
                {(sel.logline||sel.tagline)&&(
                  <div style={{marginBottom:16,padding:"12px 14px",background:C.card,borderRadius:10,border:`0.5px solid ${C.border}`,borderLeft:`3px solid ${C.purple}`}}>
                    <div style={{fontSize:10,color:C.muted,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:6}}>Synopsis</div>
                    <div style={{fontSize:13,color:C.text,lineHeight:1.7}}>{sel.logline||sel.tagline}</div>
                  </div>
                )}
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:16,padding:"10px 14px",background:C.card,borderRadius:9,border:`0.5px solid ${C.border}`}}>
                  <span style={{fontSize:11,color:C.muted,flexShrink:0}}>🌐 Read in:</span>
                  <div style={{display:"flex",gap:5,flexWrap:"wrap",flex:1}}>
                    {["English","Korean","Japanese","Spanish","French"].map(l=>(
                      <button key={l} style={{fontSize:10,padding:"3px 9px",borderRadius:6,border:`0.5px solid ${C.border}`,background:l==="English"?C.purple+"22":"transparent",color:l==="English"?C.purpleL:C.muted,cursor:"pointer",fontFamily:"inherit"}}>{l}</button>
                    ))}
                  </div>
                </div>
                <div style={{fontSize:12,fontWeight:600,color:C.text,marginBottom:10}}>Chapters</div>
                <div style={{display:"flex",flexDirection:"column",gap:4}}>
                  {Array.from({length:Math.min(sel.chapters||1,8)},(_,i)=>i+1).map(n=>(
                    <div key={n} onClick={()=>setReading(sel)}
                      style={{display:"flex",alignItems:"center",gap:12,padding:"10px 14px",border:`0.5px solid ${C.border}`,borderRadius:9,cursor:"pointer",background:C.card,transition:"border-color .12s"}}
                      onMouseEnter={e=>e.currentTarget.style.borderColor=C.purple}
                      onMouseLeave={e=>e.currentTarget.style.borderColor=C.border}>
                      <div style={{width:34,height:34,borderRadius:7,background:n===1?C.purple:C.surf,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,color:n===1?"#fff":C.muted,fontWeight:600,flexShrink:0}}>{n}</div>
                      <div style={{flex:1}}>
                        <div style={{fontSize:13,fontWeight:500,color:C.text}}>Chapter {n}{n===1?" — Start here":""}</div>
                        <div style={{fontSize:10,color:C.muted,marginTop:1}}>Available · {(sel.genre_tags||["Action"])[0]}</div>
                      </div>
                      <Tag c={n===1?C.purple:C.teal}>{n===1?"Start →":"Read"}</Tag>
                    </div>
                  ))}
                  {(sel.chapters||1)>8&&(
                    <div style={{textAlign:"center",padding:"8px",fontSize:11,color:C.muted}}>+ {(sel.chapters||1)-8} more chapters</div>
                  )}
                </div>
                {published.filter(s=>s.id!==sel.id).length>0&&(
                <div style={{marginTop:24,paddingTop:16,borderTop:`0.5px solid ${C.border}`}}>
                  <div style={{fontSize:12,fontWeight:600,color:C.text,marginBottom:10}}>More like this</div>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10}}>
                    {published.filter(s=>s.id!==sel.id).slice(0,4).map(item=>(
                      <CoverCard key={item.id} item={item} aiMade onClick={()=>setSel(item)}/>
                    ))}
                  </div>
                </div>
                )}
              </div>
            ):(
              <div>
                <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16,flexWrap:"wrap"}}>
                  <input value={q} onChange={e=>setQ(e.target.value)} placeholder={t("library.searchPlaceholder")} style={{flex:1,minWidth:180,padding:"8px 14px",borderRadius:8,border:`0.5px solid ${C.border2}`,background:C.card,color:C.text,fontSize:13,fontFamily:"inherit",outline:"none"}}/>
                  <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>{GENRES.map(g=><button key={g} onClick={()=>setFG(g)} style={{fontSize:11,padding:"5px 10px",borderRadius:7,border:`0.5px solid ${fG===g?C.purple:C.border}`,background:fG===g?C.purple+"22":"transparent",color:fG===g?C.purpleL:C.muted,cursor:"pointer",fontFamily:"inherit"}}>{g}</button>)}</div>
                  <div style={{display:"flex",gap:5}}>{ORIGINS.map(o=><button key={o} onClick={()=>setFO(o)} style={{fontSize:11,padding:"5px 10px",borderRadius:7,border:`0.5px solid ${fO===o?C.pink:C.border}`,background:fO===o?C.pink+"22":"transparent",color:fO===o?C.pink:C.muted,cursor:"pointer",fontFamily:"inherit"}}>{o}</button>)}</div>
                </div>
                <div style={{fontSize:11,color:C.muted,marginBottom:14}}>{filtered.length} series · {published.length} creator-published</div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12}}>{filtered.map(item=><CoverCard key={item.id} item={item} aiMade={!!item.author_name&&!item.author} onClick={()=>setSel(item)}/>)}</div>
              </div>
            )}
          </div>
        )}

        {reading && reading.content_rating==="mature" && !ageOk && (
          <AgeGate onVerified={()=>setAgeOk(true)} onCancel={()=>{setReading(null);setSel(reading);}}/>
        )}
        {reading && !(reading.content_rating==="mature" && !ageOk) && (
          <MangaReader story={reading} onBack={()=>{setReading(null);setSel(reading);}} signedIn={!!(auth?.token && auth.token!=="demo")} reporterId={auth?.user?.id} user={auth?.user}/>
        )}

        {page==="studio"&&<Studio user={auth?.user} credits={auth?.user?.credits} onUseCredits={onUseCredits} drafts={db.stories.filter(s=>s.status==="draft")} myStoryCount={db.stories.length} onSave={onSaveStory} onSaveTranslations={async (storyId, map)=>{ for (const [lang,data] of Object.entries(map||{})) await saveTranslation(storyId, lang, data, auth?.token); }} onSaveChapter={async (storyId, number, script, status)=>saveChapter(storyId, number, script, status, auth?.token)} onDeleteChapter={async (storyId, number)=>deleteChapter(storyId, number, auth?.token)} onSaveBible={async (storyId, data, prefs)=>saveBible(storyId, data, prefs, auth?.token)} onRequestAuth={()=>setShowAuth(true)} editStory={editStory} onEditConsumed={()=>setEditStory(null)} onPublished={()=>{ refreshPublic(); setDashTab("feed"); go("home"); }}/>}

        {page==="dashboard"&&auth?.user&&<AdminDashboard auth={auth} published={published} db={db} onOpenStory={onEditStory} onModerated={refreshPublic}/>}
        {page==="agents"&&auth?.user?.role==="admin"&&<AgentsPage/>}
        {page==="pricing"&&<PricingPage auth={auth} onRequestAuth={()=>setShowAuth(true)}/>}
        {page==="legal"&&<LegalPage doc={legalDoc} onDoc={setLegalDoc}/>}

        {page==="creator"&&(
          <CreatorDashboard
            auth={auth}
            db={db}
            published={published}
            onShowAuth={()=>setShowAuth(true)}
            onGoStudio={()=>go("studio")}
            onViewStory={(s)=>{setSel(s);setPage("library");}}
            onEditStory={onEditStory}
            onSaveStory={onSaveStory}
            onUnpublish={async (s)=>{ await onSaveStory({...s, status:"draft"}); refreshPublic(); setToast({msg:`"${s.title}" unpublished — moved back to your drafts`,type:"ok"}); }}
            onDelete={async (s)=>{ await db.remove(s.id); try{ localStorage.removeItem(`mv_panels_${s.id}`); }catch{} refreshPublic(); if(sel?.id===s.id) setSel(null); setToast({msg:`"${s.title}" deleted`,type:"ok"}); }}
            setToast={setToast}
          />
        )}
      </div>

      <div style={{borderTop:`0.5px solid ${C.border}`,marginTop:48,padding:"18px 20px 26px",textAlign:"center",fontSize:11,color:C.muted}}>
        <div style={{display:"flex",gap:14,justifyContent:"center",flexWrap:"wrap",marginBottom:8}}>
          <button onClick={()=>goLegal("terms")} style={{background:"transparent",border:"none",color:C.muted,cursor:"pointer",fontSize:11,fontFamily:"inherit",padding:0}}>Terms</button>
          <button onClick={()=>goLegal("privacy")} style={{background:"transparent",border:"none",color:C.muted,cursor:"pointer",fontSize:11,fontFamily:"inherit",padding:0}}>Privacy</button>
          <button onClick={()=>goLegal("content")} style={{background:"transparent",border:"none",color:C.muted,cursor:"pointer",fontSize:11,fontFamily:"inherit",padding:0}}>Content Policy</button>
          <a href={`mailto:${SUPPORT_EMAIL}`} style={{color:C.muted,textDecoration:"none",fontSize:11}}>Contact</a>
        </div>
        MangaMultiVerse · Read, create, and share stories in every language · Beta
      </div>
    </div>
  );
}



