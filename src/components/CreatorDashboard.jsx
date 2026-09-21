import { useState, useRef, useEffect } from "react";
import { useTheme } from "../ThemeContext.jsx";
import { askClaude, P_PARSE_UPLOAD } from "../lib/claude.js";
import { Tag, Btn, Spinner, CoverCard } from "./UI.jsx";

// This device's saved copy of a story's panel art, filtered to hosted (http) URLs — the only
// kind safe to sync into the DB row so EVERY reader (not just this browser) sees the panels.
const localArt = (id) => {
  try {
    const raw = JSON.parse(localStorage.getItem(`mv_panels_${id}`) || "null");
    if (!raw || typeof raw !== "object") return null;
    const http = Object.fromEntries(Object.entries(raw).filter(([, v]) => typeof v === "string" && v.startsWith("http")));
    return Object.keys(http).length ? http : null;
  } catch { return null; }
};

// A published story is "missing its art in the cloud" when it has panels but no panel_images
// were saved with the record — so readers on other devices see blank panels.
const needsArtSync = (s) =>
  s.status === "published" &&
  (s.script?.panels?.length > 0) &&
  Object.keys(s.script?.panel_images || {}).length === 0;

const CreatorDashboard = ({ auth, db, published, onShowAuth, onGoStudio, onViewStory, onEditStory, onSaveStory, onUnpublish, onDelete, setToast }) => {
  const C = useTheme();
  const [creatorTab, setCreatorTab] = useState("dashboard");
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadType, setUploadType] = useState("script");
  const [uploadParsed, setUploadParsed] = useState(null);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [uploadStep, setUploadStep] = useState("drop");
  const [dragOver, setDragOver] = useState(false);
  const [seriesName, setSeriesName] = useState("");
  const [agreement, setAgreement] = useState(false);
  const fileRef = useRef(null);
  const [syncing, setSyncing] = useState(null); // id currently re-syncing art
  const healed = useRef(new Set());             // ids we've already auto-healed this session

  // Push this device's saved panel art up to the story record so all readers can see it.
  // Fixes stories published before art was embedded in the DB, or any that shipped art-less.
  const resyncArt = async (s, silent = false) => {
    const art = localArt(s.id);
    if (!art) {
      if (!silent) setToast?.({ msg: `No local copy of "${s.title}"'s art on this device — reopen it in the Studio and regenerate the panels, then Update live.`, type: "warn" });
      return false;
    }
    if (!silent) setSyncing(s.id);
    try {
      await onSaveStory({ ...s, script: { ...(s.script || {}), panel_images: { ...(s.script?.panel_images || {}), ...art } } });
      if (!silent) setToast?.({ msg: `Panels re-synced for "${s.title}" — readers can see the art now ✓`, type: "ok" });
      return true;
    } catch (e) {
      if (!silent) setToast?.({ msg: `Couldn't sync art: ${e.message}`, type: "err" });
      return false;
    } finally { if (!silent) setSyncing(null); }
  };

  // Self-heal: when the dashboard loads, silently repair any published story that's missing its
  // cloud art but still has a local copy on this device.
  useEffect(() => {
    if (!auth) return;
    (db.stories || []).forEach(s => {
      if (needsArtSync(s) && !healed.current.has(s.id) && localArt(s.id)) {
        healed.current.add(s.id);
        resyncArt(s, true);
      }
    });
  }, [db.stories, auth]);

  if (!auth) return (
    <div style={{textAlign:"center",padding:"80px 20px"}}>
      <div style={{fontSize:40,marginBottom:16}}>✦</div>
      <div style={{fontSize:18,fontWeight:700,fontFamily:"'Cinzel',serif",marginBottom:8}}>Creator Portal</div>
      <div style={{fontSize:13,color:C.muted,maxWidth:400,margin:"0 auto 24px",lineHeight:1.7}}>
        Publish your original manga, manhwa, or manhua. Reach readers in 30 languages instantly with AI translation built in.
      </div>
      <Btn v="pri" onClick={onShowAuth} sx={{padding:"11px 32px",fontSize:14}}>Sign in to continue →</Btn>
    </div>
  );

  // A draft (AI-made, not yet published) reopens in the Studio editor to keep working on;
  // published or uploaded works open in the reader.
  const openStory = (s) => {
    if (s.status !== "published" && !s.upload_type && onEditStory) onEditStory(s);
    else onViewStory(s);
  };

  const readFile = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => resolve(e.target.result);
    reader.onerror = reject;
    if (file.type.startsWith("image/")) reader.readAsDataURL(file);
    else reader.readAsText(file);
  });

  const handleDrop = async (e) => {
    e.preventDefault(); setDragOver(false);
    const file = e.dataTransfer?.files?.[0] || e.target?.files?.[0];
    if (!file) return;
    setUploadFile(file);
    setUploadStep("drop");
  };

  const parseUpload = async () => {
    if (!uploadFile) return;
    setUploadLoading(true); setUploadParsed(null);
    try {
      const text = await readFile(uploadFile);
      const isImage = uploadFile.type.startsWith("image/");
      if (isImage) {
        setUploadParsed({
          title: seriesName || uploadFile.name.replace(/\.[^.]+$/, ""),
          author: auth.user.username,
          logline: "Uploaded manga pages — add description in editor",
          genre_tags: ["Action"],
          chapter_number: 1,
          chapter_title: "Chapter 1",
          characters: [],
          panels: [],
          content_warning: "none",
          _isImage: true,
          _imageData: text,
        });
      } else {
        const r = await askClaude(P_PARSE_UPLOAD(text, uploadType), ()=>{});
        if (r) setUploadParsed({...r, author: r.author || auth.user.username});
      }
      setUploadStep("preview");
    } catch(e) { setToast({msg:"Could not read file: "+e.message,type:"err"}); }
    finally { setUploadLoading(false); }
  };

  const publishUpload = async () => {
    if (!uploadParsed) return;
    const story = {
      title: uploadParsed.title || seriesName || "Untitled",
      logline: uploadParsed.logline,
      tagline: uploadParsed.logline?.slice(0,60),
      genre_tags: uploadParsed.genre_tags || [],
      author_name: auth.user.username,
      status: "published",
      emoji: "📖",
      cover_color: "#1a0d3e",
      chapters: 1,
      upload_type: uploadType,
      content_warning: uploadParsed.content_warning,
      script: {
        chapter_title: uploadParsed.chapter_title,
        panels: uploadParsed.panels,
        chapter_end_hook: "",
      },
      characters: uploadParsed.characters,
      published_at: new Date().toISOString(),
    };
    await onSaveStory(story);
    setToast({msg:`"${story.title}" published to the library!`,type:"ok"});
    setUploadStep("done");
  };

  const UPLOAD_TYPES = [
    {id:"script", icon:"📝", label:"Script / text file", desc:"Upload a .txt or .md file with your chapter script, story bible, or any text"},
    {id:"pages",  icon:"🖼", label:"Manga pages",        desc:"Upload individual page images (.jpg, .png) from your original work"},
    {id:"bible",  icon:"📚", label:"Series bible",       desc:"Upload your full world-building document, character sheets, story outline"},
  ];

  const CREATOR_TABS = [
    {id:"dashboard", label:"Dashboard"},
    {id:"upload",    label:"✦ Upload work"},
    {id:"series",    label:"My series"},
  ];

  return (
    <div>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20}}>
        <div>
          <div style={{fontSize:16,fontWeight:700,fontFamily:"'Cinzel',serif",marginBottom:2}}>Creator portal</div>
          <div style={{fontSize:12,color:C.muted}}>Welcome back, {auth.user.username}</div>
        </div>
        <div style={{display:"flex",gap:8}}>
          <Btn v="soft" onClick={onGoStudio}>✦ AI studio</Btn>
        </div>
      </div>

      <div style={{display:"flex",borderBottom:`0.5px solid ${C.border}`,marginBottom:22}}>
        {CREATOR_TABS.map(t=>(
          <button key={t.id} onClick={()=>setCreatorTab(t.id)} style={{padding:"8px 16px",fontSize:12,border:"none",borderBottom:`2px solid ${creatorTab===t.id?C.purple:"transparent"}`,background:"transparent",color:creatorTab===t.id?C.purple:t.label.startsWith("✦")?C.pink:C.muted,cursor:"pointer",fontFamily:"inherit",fontWeight:creatorTab===t.id?500:400}}>
            {t.label}
          </button>
        ))}
      </div>

      {creatorTab==="dashboard"&&(
        <div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:24}}>
            {[["Total series",db.stories.length],["Published",published.length],["Drafts",db.stories.filter(s=>s.status==="draft").length]].map(([l,v])=>(
              <div key={l} style={{background:C.surf,borderRadius:9,padding:"14px 16px",border:`0.5px solid ${C.border}`}}>
                <div style={{fontSize:11,color:C.muted,marginBottom:4}}>{l}</div>
                <div style={{fontSize:22,fontWeight:500}}>{v}</div>
              </div>
            ))}
          </div>

          <div style={{padding:"18px 22px",borderRadius:12,background:`linear-gradient(135deg,${C.purple}18,${C.pink}10)`,border:`0.5px solid ${C.purple}44`,marginBottom:22}}>
            <div style={{fontSize:14,fontWeight:600,marginBottom:6}}>🚀 Why publish on MangaMultiVerse?</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,fontSize:12,color:C.muted}}>
              {[
                ["🌐 30 languages","AI translates your work instantly — reach readers worldwide from day one"],
                ["🎭 Voice-accurate","Each character sounds unique in every language, not word-for-word"],
                ["📊 Reader analytics","See exactly where readers engage and where they drop off"],
                ["✦ You own it","Full copyright stays with you. Remove your work anytime"],
              ].map(([title,desc])=>(
                <div key={title} style={{padding:"10px 12px",background:C.card,borderRadius:8,border:`0.5px solid ${C.border}`}}>
                  <div style={{fontSize:12,fontWeight:500,color:C.text,marginBottom:3}}>{title}</div>
                  <div style={{fontSize:11,color:C.muted,lineHeight:1.5}}>{desc}</div>
                </div>
              ))}
            </div>
            <div style={{marginTop:14,fontSize:12,color:C.muted}}>
              Are you a publisher? <span style={{color:C.purple,cursor:"pointer"}} onClick={()=>setCreatorTab("upload")}>Upload your first chapter →</span>
            </div>
          </div>

          {db.stories.length === 0 ? (
            <div style={{textAlign:"center",padding:"40px 0",color:C.muted}}>
              <div style={{fontSize:32,marginBottom:12}}>📖</div>
              <div style={{fontSize:14,fontWeight:500,marginBottom:6}}>No series yet</div>
              <div style={{fontSize:12,marginBottom:20}}>Upload existing work or create something new with AI</div>
              <div style={{display:"flex",gap:10,justifyContent:"center"}}>
                <Btn v="pri" onClick={()=>setCreatorTab("upload")}>✦ Upload work</Btn>
                <Btn v="soft" onClick={onGoStudio}>✦ Create with AI</Btn>
              </div>
            </div>
          ):(
            <div>
              <div style={{fontSize:12,fontWeight:500,marginBottom:10}}>Your series</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12}}>
                {db.stories.slice(0,4).map(s=>(
                  <CoverCard key={s.id} item={s} aiMade onClick={()=>openStory(s)}/>
                ))}
              </div>
              {db.stories.length>4&&<div style={{textAlign:"center",marginTop:10}}><Btn onClick={()=>setCreatorTab("series")}>View all {db.stories.length} series →</Btn></div>}
            </div>
          )}
        </div>
      )}

      {creatorTab==="upload"&&(
        <div style={{maxWidth:640,margin:"0 auto"}}>
          {uploadStep==="done"?(
            <div style={{textAlign:"center",padding:"40px 0"}}>
              <div style={{fontSize:40,marginBottom:12}}>🎉</div>
              <div style={{fontSize:16,fontWeight:500,marginBottom:6}}>Published successfully!</div>
              <div style={{fontSize:13,color:C.muted,marginBottom:24}}>Your work is now live in the library. Readers around the world can find it.</div>
              <div style={{display:"flex",gap:10,justifyContent:"center"}}>
                <Btn v="pri" onClick={()=>{setUploadStep("drop");setUploadFile(null);setUploadParsed(null);}}>Upload another chapter</Btn>
                <Btn v="soft" onClick={()=>setCreatorTab("series")}>View my series</Btn>
              </div>
            </div>
          ):uploadStep==="preview"&&uploadParsed?(
            <div>
              <button onClick={()=>setUploadStep("drop")} style={{background:"transparent",border:"none",color:C.muted,cursor:"pointer",fontSize:12,fontFamily:"inherit",marginBottom:16}}>← Back</button>
              <div style={{fontSize:15,fontWeight:500,marginBottom:16}}>Review before publishing</div>
              <div style={{padding:16,background:C.card,borderRadius:10,border:`0.5px solid ${C.border}`,marginBottom:16}}>
                <div style={{fontSize:14,fontWeight:500,color:C.text,marginBottom:4}}>{uploadParsed.title}</div>
                <div style={{fontSize:12,color:C.muted,marginBottom:10,lineHeight:1.6}}>{uploadParsed.logline}</div>
                <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:10}}>
                  {(uploadParsed.genre_tags||[]).map(g=><Tag key={g} c={C.purple}>{g}</Tag>)}
                  <Tag c={uploadParsed.content_warning==="none"?C.teal:C.gold}>
                    {uploadParsed.content_warning==="none"?"All ages":uploadParsed.content_warning}
                  </Tag>
                </div>
                {uploadParsed.characters?.length>0&&(
                  <div>
                    <div style={{fontSize:10,color:C.muted,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:6}}>Characters detected</div>
                    <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                      {uploadParsed.characters.map(c=>(
                        <div key={c.name} style={{fontSize:11,padding:"3px 9px",borderRadius:6,background:C.surf,border:`0.5px solid ${C.border}`,color:C.text}}>
                          {c.name} <span style={{color:C.muted}}>· {c.role}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <div style={{padding:"14px 16px",background:C.gold+"10",borderRadius:9,border:`0.5px solid ${C.gold}44`,marginBottom:16}}>
                <div style={{fontSize:12,fontWeight:500,color:C.gold,marginBottom:8}}>⚠ Copyright declaration</div>
                <div style={{fontSize:12,color:C.muted,lineHeight:1.7,marginBottom:10}}>
                  By uploading, you confirm that:<br/>
                  • This is your original work or you have legal rights to publish it<br/>
                  • You are not uploading scans of copyrighted manga you do not own<br/>
                  • You retain full copyright — MangaMultiVerse does not claim ownership<br/>
                  • You can remove your work from the platform at any time
                </div>
                <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer"}}>
                  <input type="checkbox" checked={agreement} onChange={e=>setAgreement(e.target.checked)} style={{width:14,height:14,accentColor:C.purple}}/>
                  <span style={{fontSize:12,color:C.text}}>I confirm this is my original work and I have the right to publish it</span>
                </label>
              </div>
              <Btn v="pri" onClick={publishUpload} disabled={!agreement} sx={{width:"100%",padding:"12px 0",fontSize:14,justifyContent:"center"}}>
                ✦ Publish to MangaMultiVerse library →
              </Btn>
            </div>
          ):(
            <div>
              <div style={{fontSize:15,fontWeight:500,marginBottom:6}}>Upload your work</div>
              <div style={{fontSize:12,color:C.muted,marginBottom:20,lineHeight:1.6}}>
                Upload original manga, manhwa, or manhua. AI will read your script, identify characters, and make it ready for translation into 30 languages.
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr",gap:7,marginBottom:18}}>
                {UPLOAD_TYPES.map(t=>(
                  <div key={t.id} onClick={()=>setUploadType(t.id)} style={{padding:"12px 14px",borderRadius:9,border:`0.5px solid ${uploadType===t.id?C.purple:C.border}`,background:uploadType===t.id?C.purple+"12":C.card,cursor:"pointer",display:"flex",alignItems:"center",gap:12}}>
                    <span style={{fontSize:22}}>{t.icon}</span>
                    <div>
                      <div style={{fontSize:13,fontWeight:500,color:uploadType===t.id?C.purpleL:C.text}}>{t.label}</div>
                      <div style={{fontSize:11,color:C.muted}}>{t.desc}</div>
                    </div>
                    {uploadType===t.id&&<Tag c={C.purple} sx={{marginLeft:"auto"}}>Selected</Tag>}
                  </div>
                ))}
              </div>
              <div style={{marginBottom:14}}>
                <div style={{fontSize:11,color:C.muted,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:6}}>Series name (optional — AI will detect from file)</div>
                <input value={seriesName} onChange={e=>setSeriesName(e.target.value)} placeholder="e.g. Dragon Chronicles" style={{width:"100%",padding:"9px 13px",borderRadius:8,border:`0.5px solid ${C.border2}`,background:C.card,color:C.text,fontSize:13,fontFamily:"inherit",outline:"none"}}/>
              </div>
              <div
                onDrop={handleDrop}
                onDragOver={e=>{e.preventDefault();setDragOver(true);}}
                onDragLeave={()=>setDragOver(false)}
                onClick={()=>fileRef.current?.click()}
                style={{border:`2px dashed ${dragOver?C.purple:uploadFile?C.teal:C.border2}`,borderRadius:12,padding:"32px 20px",textAlign:"center",cursor:"pointer",background:dragOver?C.purple+"08":uploadFile?C.teal+"08":C.card,transition:"all .2s",marginBottom:16}}
              >
                <input ref={fileRef} type="file" accept=".txt,.md,.png,.jpg,.jpeg,.webp" style={{display:"none"}} onChange={handleDrop}/>
                <div style={{fontSize:32,marginBottom:10}}>{uploadFile?"✓":"📁"}</div>
                {uploadFile?(
                  <div>
                    <div style={{fontSize:13,fontWeight:500,color:C.teal}}>{uploadFile.name}</div>
                    <div style={{fontSize:11,color:C.muted,marginTop:3}}>{(uploadFile.size/1024).toFixed(1)} KB · Click to change</div>
                  </div>
                ):(
                  <div>
                    <div style={{fontSize:13,fontWeight:500,color:C.text}}>Drop your file here or click to browse</div>
                    <div style={{fontSize:11,color:C.muted,marginTop:4}}>Supports .txt, .md, .png, .jpg — max 10MB</div>
                  </div>
                )}
              </div>
              {uploadFile&&(
                uploadLoading?(
                  <div style={{display:"flex",alignItems:"center",gap:10,padding:"14px",background:C.card,borderRadius:9,border:`0.5px solid ${C.border}`}}>
                    <Spinner/><span style={{fontSize:13,color:C.muted}}>AI is reading your file…</span>
                  </div>
                ):(
                  <Btn v="pri" onClick={parseUpload} sx={{width:"100%",padding:"12px 0",fontSize:14,justifyContent:"center"}}>
                    ✦ Read & parse file →
                  </Btn>
                )
              )}
              <div style={{marginTop:20,padding:"12px 14px",background:C.surf,borderRadius:8,border:`0.5px solid ${C.border}`}}>
                <div style={{fontSize:11,fontWeight:500,color:C.text,marginBottom:6}}>📋 What AI does with your file</div>
                <div style={{fontSize:11,color:C.muted,lineHeight:1.8}}>
                  • Extracts title, characters, and story summary<br/>
                  • Identifies panel descriptions and dialogue<br/>
                  • Tags genre and content rating automatically<br/>
                  • Makes it ready for translation into 30 languages<br/>
                  • Your original file is never shared publicly
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {creatorTab==="series"&&(
        <div>
          {db.busy&&<div style={{display:"flex",alignItems:"center",gap:8,padding:"12px 0",color:C.muted,fontSize:13}}><Spinner size={14}/>Loading…</div>}
          {!db.busy&&db.stories.length===0?(
            <div style={{textAlign:"center",padding:"40px 0",color:C.muted}}>
              <div style={{fontSize:32,marginBottom:12}}>📖</div>
              <div style={{fontSize:14,fontWeight:500,marginBottom:16}}>No series yet</div>
              <div style={{display:"flex",gap:10,justifyContent:"center"}}>
                <Btn v="pri" onClick={()=>setCreatorTab("upload")}>✦ Upload work</Btn>
                <Btn v="soft" onClick={onGoStudio}>Create with AI</Btn>
              </div>
            </div>
          ):(
            <div>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
                <div style={{fontSize:12,fontWeight:500}}>{db.stories.length} series</div>
                <Btn v="soft" onClick={()=>setCreatorTab("upload")} sx={{fontSize:11}}>+ Upload new</Btn>
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                {db.stories.map(s=>(
                  <div key={s.id} style={{display:"flex",alignItems:"center",gap:14,padding:"12px 14px",background:C.card,border:`0.5px solid ${C.border}`,borderRadius:10,cursor:"pointer"}}
                    onMouseEnter={e=>e.currentTarget.style.borderColor=C.purple}
                    onMouseLeave={e=>e.currentTarget.style.borderColor=C.border}
                    onClick={()=>openStory(s)}>
                    <div style={{width:44,height:60,borderRadius:6,background:s.cover_color||"#1a0d3e",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,flexShrink:0}}>{s.emoji||"📖"}</div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:13,fontWeight:500,color:C.text,marginBottom:2}}>{s.title}</div>
                      <div style={{fontSize:11,color:C.muted,marginBottom:5,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.tagline||s.logline}</div>
                      <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>{(s.genre_tags||[]).slice(0,2).map(g=><Tag key={g} c={C.dim} sx={{color:C.muted}}>{g}</Tag>)}</div>
                    </div>
                    <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:5,flexShrink:0}}>
                      <Tag c={s.status==="published"?C.teal:C.gold}>{s.status}</Tag>
                      <div style={{fontSize:11,color:C.muted}}>{s.upload_type?"Uploaded":"AI-made"}</div>
                      <div style={{display:"flex",gap:5,flexWrap:"wrap",justifyContent:"flex-end"}}>
                        {!s.upload_type && onEditStory && (
                          <button onClick={e=>{e.stopPropagation();onEditStory(s);}}
                            style={{fontSize:10,padding:"3px 10px",borderRadius:6,border:`0.5px solid ${C.purple}66`,background:C.purple+"18",color:C.purpleL,cursor:"pointer",fontFamily:"inherit"}}>
                            ✎ Edit
                          </button>
                        )}
                        {needsArtSync(s) && (
                          localArt(s.id) ? (
                            <button onClick={e=>{e.stopPropagation();resyncArt(s);}} disabled={syncing===s.id}
                              title="This story's panels aren't saved to the cloud yet — readers see blanks. Click to push this device's art up."
                              style={{fontSize:10,padding:"3px 10px",borderRadius:6,border:`0.5px solid ${C.teal}66`,background:C.teal+"18",color:C.teal,cursor:syncing===s.id?"default":"pointer",fontFamily:"inherit",opacity:syncing===s.id?0.6:1}}>
                              {syncing===s.id?"Syncing…":"⟳ Sync art"}
                            </button>
                          ) : (
                            <span title="Panel art isn't saved to the cloud and no local copy is on this device. Reopen in the Studio and regenerate the panels, then Update live."
                              style={{fontSize:10,padding:"3px 10px",borderRadius:6,border:`0.5px solid ${C.gold}66`,background:C.gold+"18",color:C.gold,fontFamily:"inherit"}}>
                              ⚠ art missing
                            </span>
                          )
                        )}
                        {s.status==="published" && onUnpublish && (
                          <button onClick={e=>{e.stopPropagation();onUnpublish(s);}}
                            style={{fontSize:10,padding:"3px 10px",borderRadius:6,border:`0.5px solid ${C.gold}66`,background:C.gold+"18",color:C.gold,cursor:"pointer",fontFamily:"inherit"}}>
                            ⤓ Unpublish
                          </button>
                        )}
                        {onDelete && (
                          <button onClick={e=>{e.stopPropagation(); if(window.confirm(`Delete "${s.title}" permanently? This cannot be undone.`)) onDelete(s);}}
                            style={{fontSize:10,padding:"3px 10px",borderRadius:6,border:`0.5px solid #e0533d66`,background:"#e0533d18",color:"#e0533d",cursor:"pointer",fontFamily:"inherit"}}>
                            🗑 Delete
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default CreatorDashboard;

