import { useState } from "react";
import { useTheme } from "../ThemeContext.jsx";
import { askClaude, generatePanelImage, AGENT_STEP1, AGENT_STEP2, AGENT_STEP3, AGENT_STEP4, P_SCRIPT } from "../lib/claude.js";
import { Btn, Spinner, Tag } from "./UI.jsx";
import { LINE } from "../lib/agents.js";
import FactoryMap from "./FactoryMap.jsx";

const STYLES = ["PRISMA","JP-EN","KR-EN","CN-EN","US-EN","GL-EN"];
const MOODS  = ["dramatic","action","romance","mystery","horror","default"];
const GENRES = ["Shonen action","Dark fantasy","Romance","Sci-fi","Horror","Mystery","Historical","Sports"];
const TONES  = ["Epic & grand","Dark & gritty","Light & fun","Emotional & tender","Tense & suspenseful"];

// ─── Panel Agent ────────────────────────────────────────────────────────────
function PanelAgent() {
  const C = useTheme();
  const [scene, setScene]     = useState("");
  const [chars, setChars]     = useState("");
  const [style, setStyle]     = useState("JP-EN");
  const [mood, setMood]       = useState("dramatic");
  const [loading, setLoading] = useState(false);
  const [images, setImages]   = useState([]);
  const [count, setCount]     = useState(1);

  const generate = async () => {
    if (!scene.trim()) return;
    setLoading(true);
    const results = [];
    for (let i = 0; i < count; i++) {
      if (i > 0) await new Promise(r => setTimeout(r, 8000));
      const desc = `${scene}. Mood: ${mood}.`;
      const img = await generatePanelImage(desc, chars || "no specific characters", style);
      if (img) results.push(img);
      setImages([...results]);
    }
    setLoading(false);
  };

  const inp = { width:"100%", padding:"9px 12px", borderRadius:8, border:`0.5px solid ${C.border2}`, background:C.card, color:C.text, fontSize:13, fontFamily:"inherit", outline:"none", resize:"vertical" };

  return (
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20,alignItems:"start"}}>
      <div style={{display:"flex",flexDirection:"column",gap:12}}>
        <div>
          <div style={{fontSize:11,color:C.muted,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:5}}>Scene description</div>
          <textarea value={scene} onChange={e=>setScene(e.target.value)} rows={4} placeholder="A lone warrior stands on a crumbling bridge over a lava canyon, sword raised against a storm…" style={inp}/>
        </div>
        <div>
          <div style={{fontSize:11,color:C.muted,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:5}}>Characters (optional)</div>
          <textarea value={chars} onChange={e=>setChars(e.target.value)} rows={2} placeholder="Kael: tall, silver hair, red coat. Mira: small, dark eyes, daggers." style={{...inp,resize:"vertical"}}/>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          <div>
            <div style={{fontSize:11,color:C.muted,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:5}}>Style</div>
            <select value={style} onChange={e=>setStyle(e.target.value)} style={{...inp,resize:"none",cursor:"pointer"}}>
              {STYLES.map(s=><option key={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <div style={{fontSize:11,color:C.muted,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:5}}>Mood</div>
            <select value={mood} onChange={e=>setMood(e.target.value)} style={{...inp,resize:"none",cursor:"pointer"}}>
              {MOODS.map(m=><option key={m}>{m}</option>)}
            </select>
          </div>
        </div>
        <div>
          <div style={{fontSize:11,color:C.muted,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:5}}>Panels to generate: {count}</div>
          <input type="range" min={1} max={4} value={count} onChange={e=>setCount(Number(e.target.value))} style={{width:"100%",accentColor:C.purple}}/>
        </div>
        <Btn v="pri" onClick={generate} disabled={loading||!scene.trim()} sx={{padding:"11px 0",fontSize:13,justifyContent:"center",width:"100%"}}>
          {loading ? <><Spinner size={14}/> Generating panel {images.length+1}/{count}…</> : `🎨 Generate ${count} Panel${count>1?"s":""}`}
        </Btn>
      </div>
      <div>
        {images.length === 0 && !loading && (
          <div style={{aspectRatio:"3/2",background:C.card,border:`0.5px dashed ${C.border2}`,borderRadius:12,display:"flex",alignItems:"center",justifyContent:"center",color:C.muted,fontSize:13}}>
            Panel preview appears here
          </div>
        )}
        {loading && images.length === 0 && (
          <div style={{aspectRatio:"3/2",background:C.card,border:`0.5px solid ${C.border}`,borderRadius:12,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:12,color:C.muted}}>
            <Spinner size={28}/>
            <div style={{fontSize:12}}>Generating… this takes ~15s</div>
          </div>
        )}
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {images.map((img,i)=>(
            <div key={i} style={{position:"relative",borderRadius:10,overflow:"hidden",border:`0.5px solid ${C.border}`}}>
              <img src={img} style={{width:"100%",display:"block"}} alt={`Panel ${i+1}`}/>
              <a href={img} download={`panel-${i+1}.png`} style={{position:"absolute",top:8,right:8,background:"rgba(0,0,0,0.7)",color:"#fff",fontSize:11,padding:"4px 10px",borderRadius:6,textDecoration:"none",backdropFilter:"blur(4px)"}}>↓ Save</a>
            </div>
          ))}
          {loading && images.length > 0 && (
            <div style={{padding:16,background:C.card,borderRadius:10,border:`0.5px solid ${C.border}`,display:"flex",alignItems:"center",gap:10,color:C.muted,fontSize:12}}>
              <Spinner size={14}/>Generating panel {images.length+1}/{count}…
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Voice Agent ─────────────────────────────────────────────────────────────
const P_VOICE_AGENT = (name, role, personality, wound) =>
  `You are a dialogue director for manga. Create a precise voice profile for this character.
Return ONLY a raw JSON object. No markdown. Start with { end with }.

Character: ${name || "Unknown"}
Role: ${role || "protagonist"}
Personality: ${personality || "not specified"}
Core wound: ${wound || "not specified"}

{"voice_profile":{"speech_pattern":"how they construct sentences — short/long, direct/poetic, formal/street","verbal_tics":["a word or phrase they overuse","another habit"],"what_they_never_say":"topic or word they avoid at all costs","under_pressure":"how speech changes when stressed or scared","signature_line":"one line that perfectly captures their voice — the line they'd be remembered for","subtext":"what they mean vs what they say — their default deflection","accent_notes":"regional or cultural speech flavour if any"},"sample_dialogue":[{"situation":"casual conversation","line":"what they actually say"},{"situation":"under threat","line":"their response"},{"situation":"revealing vulnerability","line":"the rare honest moment"},{"situation":"pre-battle or high stakes","line":"what they say before the decisive moment"}],"contrast":"how their voice differs from the typical ${role || "protagonist"} — what makes them sound unique"}`;

function VoiceAgent() {
  const C = useTheme();
  const [name, setName]         = useState("");
  const [role, setRole]         = useState("protagonist");
  const [personality, setPersonality] = useState("");
  const [wound, setWound]       = useState("");
  const [loading, setLoading]   = useState(false);
  const [result, setResult]     = useState(null);

  const generate = async () => {
    setLoading(true); setResult(null);
    const r = await askClaude(P_VOICE_AGENT(name, role, personality, wound), ()=>{});
    setResult(r);
    setLoading(false);
  };

  const inp = { width:"100%", padding:"9px 12px", borderRadius:8, border:`0.5px solid ${C.border2}`, background:C.card, color:C.text, fontSize:13, fontFamily:"inherit", outline:"none" };

  return (
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20,alignItems:"start"}}>
      <div style={{display:"flex",flexDirection:"column",gap:12}}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          <div>
            <div style={{fontSize:11,color:C.muted,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:5}}>Character name</div>
            <input value={name} onChange={e=>setName(e.target.value)} placeholder="Kael Mortiss" style={inp}/>
          </div>
          <div>
            <div style={{fontSize:11,color:C.muted,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:5}}>Role</div>
            <select value={role} onChange={e=>setRole(e.target.value)} style={{...inp,cursor:"pointer"}}>
              {["protagonist","antagonist","mentor","rival","comic relief","love interest","mysterious stranger"].map(r=><option key={r}>{r}</option>)}
            </select>
          </div>
        </div>
        <div>
          <div style={{fontSize:11,color:C.muted,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:5}}>Personality traits</div>
          <input value={personality} onChange={e=>setPersonality(e.target.value)} placeholder="Ruthlessly pragmatic, secretly ashamed, dry humour" style={inp}/>
        </div>
        <div>
          <div style={{fontSize:11,color:C.muted,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:5}}>Core wound (optional)</div>
          <input value={wound} onChange={e=>setWound(e.target.value)} placeholder="Betrayed his entire unit to survive" style={inp}/>
        </div>
        <Btn v="pri" onClick={generate} disabled={loading||!name.trim()} sx={{padding:"11px 0",fontSize:13,justifyContent:"center",width:"100%"}}>
          {loading ? <><Spinner size={14}/> Building voice…</> : "🎭 Generate Voice Profile"}
        </Btn>
      </div>
      <div>
        {!result && !loading && (
          <div style={{padding:24,background:C.card,border:`0.5px dashed ${C.border2}`,borderRadius:12,color:C.muted,fontSize:13,textAlign:"center"}}>Voice profile appears here</div>
        )}
        {loading && <div style={{padding:24,background:C.card,border:`0.5px solid ${C.border}`,borderRadius:12,display:"flex",alignItems:"center",gap:12,color:C.muted}}><Spinner size={18}/>Building voice profile…</div>}
        {result && (
          <div style={{background:C.card,border:`0.5px solid ${C.border}`,borderRadius:12,overflow:"hidden"}}>
            <div style={{padding:"12px 16px",borderBottom:`0.5px solid ${C.border}`,background:`linear-gradient(135deg,${C.purple}18,${C.pink}08)`}}>
              <div style={{fontSize:14,fontWeight:600,color:C.text}}>{name}</div>
              <div style={{fontSize:11,color:C.muted,marginTop:2}}>{role}</div>
            </div>
            <div style={{padding:16,display:"flex",flexDirection:"column",gap:14}}>
              {result.voice_profile && <>
                <Row label="Speech pattern" val={result.voice_profile.speech_pattern} C={C}/>
                <Row label="Never says" val={result.voice_profile.what_they_never_say} C={C}/>
                <Row label="Under pressure" val={result.voice_profile.under_pressure} C={C}/>
                {result.voice_profile.verbal_tics?.length > 0 && (
                  <div><div style={{fontSize:10,color:C.muted,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:5}}>Verbal tics</div>
                  <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>{result.voice_profile.verbal_tics.map((t,i)=><Tag key={i} c={C.purple}>{t}</Tag>)}</div></div>
                )}
                {result.voice_profile.signature_line && (
                  <div style={{padding:"10px 14px",background:C.purple+"12",border:`0.5px solid ${C.purple}44`,borderRadius:8,fontSize:13,color:C.text,fontStyle:"italic"}}>
                    "{result.voice_profile.signature_line}"
                  </div>
                )}
                <Row label="Subtext" val={result.voice_profile.subtext} C={C}/>
              </>}
              {result.sample_dialogue?.length > 0 && (
                <div>
                  <div style={{fontSize:10,color:C.muted,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:8}}>Sample dialogue</div>
                  <div style={{display:"flex",flexDirection:"column",gap:8}}>
                    {result.sample_dialogue.map((d,i)=>(
                      <div key={i} style={{padding:"8px 12px",background:C.bg,borderRadius:8,border:`0.5px solid ${C.border}`}}>
                        <div style={{fontSize:10,color:C.muted,marginBottom:3,textTransform:"capitalize"}}>{d.situation}</div>
                        <div style={{fontSize:13,color:C.text,fontStyle:"italic"}}>"{d.line}"</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {result.contrast && <Row label="What makes them unique" val={result.contrast} C={C}/>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Prompt Agent ─────────────────────────────────────────────────────────────
const P_PROMPT_BATCH = (genre, tone, style, avoid) =>
  `You are a manga story seed generator. Generate 8 completely original, gripping story seeds.
Every seed must be completely different from each other and from common manga tropes.
${avoid ? `Avoid these themes: ${avoid}` : ""}
Return ONLY a raw JSON object. No markdown. Start with { end with }.

Genre: ${genre} | Tone: ${tone} | Style: ${style}

{"seeds":[
  {"seed":"one compelling sentence","hook":"what makes a reader desperate to see this","genre_feel":"2-3 word vibe","emoji":"one emoji","difficulty":"easy|medium|hard to write"},
  {"seed":"","hook":"","genre_feel":"","emoji":"","difficulty":""},
  {"seed":"","hook":"","genre_feel":"","emoji":"","difficulty":""},
  {"seed":"","hook":"","genre_feel":"","emoji":"","difficulty":""},
  {"seed":"","hook":"","genre_feel":"","emoji":"","difficulty":""},
  {"seed":"","hook":"","genre_feel":"","emoji":"","difficulty":""},
  {"seed":"","hook":"","genre_feel":"","emoji":"","difficulty":""},
  {"seed":"","hook":"","genre_feel":"","emoji":"","difficulty":""}
]}`;

function PromptAgent() {
  const C = useTheme();
  const [genre, setGenre]   = useState("Dark fantasy");
  const [tone, setTone]     = useState("Dark & gritty");
  const [style, setStyle]   = useState("JP-EN");
  const [avoid, setAvoid]   = useState("");
  const [loading, setLoad]  = useState(false);
  const [seeds, setSeeds]   = useState([]);
  const [saved, setSaved]   = useState([]);

  const generate = async () => {
    setLoad(true);
    const r = await askClaude(P_PROMPT_BATCH(genre, tone, style, avoid), ()=>{});
    if (r?.seeds) setSeeds(r.seeds.filter(s=>s.seed));
    setLoad(false);
  };

  const toggleSave = (s) => setSaved(prev => prev.find(x=>x.seed===s.seed) ? prev.filter(x=>x.seed!==s.seed) : [...prev, s]);

  const inp = { padding:"9px 12px", borderRadius:8, border:`0.5px solid ${C.border2}`, background:C.card, color:C.text, fontSize:13, fontFamily:"inherit", outline:"none" };
  const diffColor = {easy:C.teal, medium:C.gold, hard:"#e24b4a"};

  return (
    <div style={{display:"flex",flexDirection:"column",gap:16}}>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr auto",gap:10,alignItems:"end"}}>
        <div>
          <div style={{fontSize:11,color:C.muted,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:5}}>Genre</div>
          <select value={genre} onChange={e=>setGenre(e.target.value)} style={{...inp,width:"100%",cursor:"pointer"}}>
            {GENRES.map(g=><option key={g}>{g}</option>)}
          </select>
        </div>
        <div>
          <div style={{fontSize:11,color:C.muted,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:5}}>Tone</div>
          <select value={tone} onChange={e=>setTone(e.target.value)} style={{...inp,width:"100%",cursor:"pointer"}}>
            {TONES.map(t=><option key={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <div style={{fontSize:11,color:C.muted,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:5}}>Style</div>
          <select value={style} onChange={e=>setStyle(e.target.value)} style={{...inp,width:"100%",cursor:"pointer"}}>
            {STYLES.map(s=><option key={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <div style={{fontSize:11,color:C.muted,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:5}}>Avoid</div>
          <input value={avoid} onChange={e=>setAvoid(e.target.value)} placeholder="isekai, school setting…" style={{...inp,width:"100%"}}/>
        </div>
        <Btn v="pri" onClick={generate} disabled={loading} sx={{padding:"9px 18px",whiteSpace:"nowrap"}}>
          {loading ? <Spinner size={13}/> : "✦ Generate"}
        </Btn>
      </div>

      {loading && (
        <div style={{padding:24,background:C.card,border:`0.5px solid ${C.border}`,borderRadius:12,display:"flex",alignItems:"center",gap:12,color:C.muted,fontSize:13}}>
          <Spinner size={18}/>Generating 8 original seeds…
        </div>
      )}

      {seeds.length > 0 && (
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          {seeds.map((s,i)=>{
            const isSaved = saved.find(x=>x.seed===s.seed);
            return (
              <div key={i} style={{padding:"12px 14px",background:C.card,border:`0.5px solid ${isSaved?C.purple:C.border}`,borderRadius:10,transition:"border-color .15s",position:"relative"}}>
                <div style={{display:"flex",alignItems:"flex-start",gap:10,marginBottom:8}}>
                  <span style={{fontSize:22,flexShrink:0}}>{s.emoji||"💡"}</span>
                  <div style={{flex:1}}>
                    <div style={{fontSize:13,color:C.text,lineHeight:1.55,fontWeight:500}}>{s.seed}</div>
                  </div>
                </div>
                {s.hook && <div style={{fontSize:11,color:C.muted,lineHeight:1.5,marginBottom:8,fontStyle:"italic"}}>"{s.hook}"</div>}
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                  <div style={{display:"flex",gap:6}}>
                    {s.genre_feel && <Tag c={C.teal}>{s.genre_feel}</Tag>}
                    {s.difficulty && <Tag c={diffColor[s.difficulty]||C.muted}>{s.difficulty}</Tag>}
                  </div>
                  <button onClick={()=>toggleSave(s)} style={{fontSize:11,padding:"4px 10px",borderRadius:6,border:`0.5px solid ${isSaved?C.purple:C.border}`,background:isSaved?C.purple+"22":"transparent",color:isSaved?C.purple:C.muted,cursor:"pointer",fontFamily:"inherit",transition:"all .15s"}}>
                    {isSaved?"✓ Saved":"+ Save"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {saved.length > 0 && (
        <div style={{padding:"12px 16px",background:C.purple+"12",border:`0.5px solid ${C.purple}33`,borderRadius:10}}>
          <div style={{fontSize:11,color:C.purple,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:8}}>Saved seeds ({saved.length})</div>
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            {saved.map((s,i)=>(
              <div key={i} style={{display:"flex",alignItems:"center",gap:8,fontSize:13,color:C.text}}>
                <span>{s.emoji}</span>
                <span style={{flex:1}}>{s.seed}</span>
                <button onClick={()=>toggleSave(s)} style={{background:"transparent",border:"none",color:C.muted,cursor:"pointer",fontSize:16,lineHeight:1}}>×</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {seeds.length > 0 && !loading && (
        <div style={{textAlign:"center"}}>
          <button onClick={generate} style={{fontSize:12,padding:"8px 20px",borderRadius:8,border:`1px solid ${C.purple}`,background:C.purple+"18",color:C.purple,cursor:"pointer",fontFamily:"inherit",fontWeight:500}}>↻ Generate another batch</button>
        </div>
      )}
    </div>
  );
}

// ─── Story Agent ──────────────────────────────────────────────────────────────
// Standalone bench version of Studio's genStory: chains AGENT_STEP1-4 off one seed
// into a full story concept (cast, world, arc). onStory lets the Script Agent reuse it.
function StoryAgent({ onStory }) {
  const C = useTheme();
  const [seed, setSeed]   = useState("");
  const [genre, setGenre] = useState("Dark fantasy");
  const [tone, setTone]   = useState("Dark & gritty");
  const [style, setStyle] = useState("JP-EN");
  const [step, setStep]   = useState(0);     // 0 idle, 1-4 = building that stage
  const [story, setStory] = useState(null);

  const STEP_LABELS = ["", "Building the concept…", "Casting characters…", "Architecting the world…", "Structuring the arc…"];

  const generate = async () => {
    if (!seed.trim()) return;
    setStory(null); setStep(1);
    const s1 = await askClaude(AGENT_STEP1(seed, genre, tone, style), ()=>{});
    if (!s1) { setStep(0); return; }
    setStep(2); const s2 = await askClaude(AGENT_STEP2(s1), ()=>{}) || {};
    setStep(3); const s3 = await askClaude(AGENT_STEP3(s1, s2), ()=>{}) || {};
    setStep(4); const s4 = await askClaude(AGENT_STEP4(s1, s2, s3), ()=>{}) || {};
    const merged = { ...s1, ...s2, ...s3, ...s4 };
    setStory(merged); onStory?.(merged); setStep(0);
  };

  const inp = { width:"100%", padding:"9px 12px", borderRadius:8, border:`0.5px solid ${C.border2}`, background:C.card, color:C.text, fontSize:13, fontFamily:"inherit", outline:"none", resize:"vertical" };
  const loading = step > 0;

  return (
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20,alignItems:"start"}}>
      <div style={{display:"flex",flexDirection:"column",gap:12}}>
        <div>
          <div style={{fontSize:11,color:C.muted,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:5}}>Story idea / seed</div>
          <textarea value={seed} onChange={e=>setSeed(e.target.value)} rows={3} placeholder="A disgraced royal cartographer discovers the maps she forges are quietly rewriting the real world…" style={inp}/>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
          <div>
            <div style={{fontSize:11,color:C.muted,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:5}}>Genre</div>
            <select value={genre} onChange={e=>setGenre(e.target.value)} style={{...inp,resize:"none",cursor:"pointer"}}>{GENRES.map(g=><option key={g}>{g}</option>)}</select>
          </div>
          <div>
            <div style={{fontSize:11,color:C.muted,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:5}}>Tone</div>
            <select value={tone} onChange={e=>setTone(e.target.value)} style={{...inp,resize:"none",cursor:"pointer"}}>{TONES.map(t=><option key={t}>{t}</option>)}</select>
          </div>
          <div>
            <div style={{fontSize:11,color:C.muted,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:5}}>Style</div>
            <select value={style} onChange={e=>setStyle(e.target.value)} style={{...inp,resize:"none",cursor:"pointer"}}>{STYLES.map(s=><option key={s}>{s}</option>)}</select>
          </div>
        </div>
        <Btn v="pri" onClick={generate} disabled={loading||!seed.trim()} sx={{padding:"11px 0",fontSize:13,justifyContent:"center",width:"100%"}}>
          {loading ? <><Spinner size={14}/> {STEP_LABELS[step]} ({step}/4)</> : "📖 Build Story Concept"}
        </Btn>
      </div>
      <div>
        {!story && !loading && (
          <div style={{padding:24,background:C.card,border:`0.5px dashed ${C.border2}`,borderRadius:12,color:C.muted,fontSize:13,textAlign:"center"}}>Story concept appears here</div>
        )}
        {loading && (
          <div style={{padding:24,background:C.card,border:`0.5px solid ${C.border}`,borderRadius:12,display:"flex",alignItems:"center",gap:12,color:C.muted}}><Spinner size={18}/>{STEP_LABELS[step]}</div>
        )}
        {story && (
          <div style={{background:C.card,border:`0.5px solid ${C.border}`,borderRadius:12,overflow:"hidden"}}>
            <div style={{padding:"14px 16px",borderBottom:`0.5px solid ${C.border}`,background:`linear-gradient(135deg,${C.purple}18,${C.pink}08)`}}>
              <div style={{fontSize:16,fontWeight:700,fontFamily:"'Cinzel',serif",color:C.text}}>{story.title}</div>
              {story.tagline && <div style={{fontSize:12,color:C.purpleL||C.purple,marginTop:3,fontStyle:"italic"}}>{story.tagline}</div>}
              {story.genre_tags?.length > 0 && <div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:8}}>{story.genre_tags.map((t,i)=><Tag key={i} c={C.teal}>{t}</Tag>)}</div>}
            </div>
            <div style={{padding:16,display:"flex",flexDirection:"column",gap:14}}>
              <Row label="Logline" val={story.logline} C={C}/>
              {story.protagonist && <Row label={`Protagonist — ${story.protagonist.name||""}`} val={[story.protagonist.personality, story.protagonist.wound && `Wound: ${story.protagonist.wound}`, story.protagonist.goal && `Wants: ${story.protagonist.goal}`].filter(Boolean).join(" · ")} C={C}/>}
              {story.antagonist && <Row label={`Antagonist — ${story.antagonist.name||""}`} val={story.antagonist.motivation} C={C}/>}
              {story.setting && <Row label={`World — ${story.setting.world||""}`} val={story.setting.description} C={C}/>}
              <Row label="Central conflict" val={story.central_conflict} C={C}/>
              {story.chapter_one_beats?.length > 0 && (
                <div>
                  <div style={{fontSize:10,color:C.muted,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:6}}>Chapter 1 beats</div>
                  <div style={{display:"flex",flexDirection:"column",gap:4}}>{story.chapter_one_beats.map((b,i)=><div key={i} style={{fontSize:12,color:C.text,lineHeight:1.5}}>{i+1}. {b}</div>)}</div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Script Agent ─────────────────────────────────────────────────────────────
// Standalone bench version of Studio's genScript: turns a story into a paneled
// Chapter 1 via P_SCRIPT. Works from manual inputs, or loads the Story Agent's
// full concept (the factory hand-off) for a richer script.
function ScriptAgent({ story }) {
  const C = useTheme();
  const [title, setTitle]     = useState("");
  const [premise, setPremise] = useState("");
  const [hero, setHero]       = useState("");
  const [panelCount, setPanelCount] = useState(8);
  const [narrator, setNarrator]     = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult]   = useState(null);
  const [rich, setRich]       = useState(null);   // full story object loaded from Story Agent

  const loadStory = () => {
    if (!story) return;
    setRich(story);
    setTitle(story.title || "");
    setPremise(story.logline || story.chapter_one_hook || "");
    setHero(story.protagonist?.name || "");
  };
  // Any manual edit drops the rich object so the typed fields drive the script.
  const edit = (setter) => (e) => { setRich(null); setter(e.target.value); };

  const generate = async () => {
    setLoading(true); setResult(null);
    const s = rich || { title: title || "Untitled", logline: premise, chapter_one_hook: premise, protagonist: { name: hero || "the hero" } };
    const r = await askClaude(P_SCRIPT(s, panelCount, narrator), ()=>{});
    setResult(r);
    setLoading(false);
  };

  const inp = { width:"100%", padding:"9px 12px", borderRadius:8, border:`0.5px solid ${C.border2}`, background:C.card, color:C.text, fontSize:13, fontFamily:"inherit", outline:"none", resize:"vertical" };
  const moodColor = { dramatic:C.purple, action:"#e24b4a", romance:C.pink, mystery:C.teal, horror:"#8b3a3a", default:C.muted };

  return (
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20,alignItems:"start"}}>
      <div style={{display:"flex",flexDirection:"column",gap:12}}>
        {story && (
          <button onClick={loadStory} style={{alignSelf:"flex-start",fontSize:11,padding:"6px 12px",borderRadius:8,border:`0.5px solid ${rich?C.purple:C.border}`,background:rich?C.purple+"18":C.card,color:rich?C.purple:C.muted,cursor:"pointer",fontFamily:"inherit"}}>
            {rich ? `✓ Using Story Agent: ${rich.title}` : "↓ Load last Story Agent result"}
          </button>
        )}
        <div>
          <div style={{fontSize:11,color:C.muted,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:5}}>Story title</div>
          <input value={title} onChange={edit(setTitle)} placeholder="The Cartographer's Lie" style={inp}/>
        </div>
        <div>
          <div style={{fontSize:11,color:C.muted,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:5}}>Premise / logline</div>
          <textarea value={premise} onChange={edit(setPremise)} rows={3} placeholder="A royal mapmaker learns her forged maps rewrite reality — and someone is forcing her to redraw the kingdom." style={inp}/>
        </div>
        <div>
          <div style={{fontSize:11,color:C.muted,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:5}}>Protagonist name</div>
          <input value={hero} onChange={edit(setHero)} placeholder="Sera Vance" style={inp}/>
        </div>
        <div>
          <div style={{fontSize:11,color:C.muted,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:5}}>Panels: {panelCount}</div>
          <input type="range" min={4} max={12} value={panelCount} onChange={e=>setPanelCount(Number(e.target.value))} style={{width:"100%",accentColor:C.purple}}/>
        </div>
        <label style={{display:"flex",alignItems:"center",gap:8,fontSize:12,color:C.muted,cursor:"pointer"}}>
          <input type="checkbox" checked={narrator} onChange={e=>setNarrator(e.target.checked)} style={{accentColor:C.purple}}/>
          Allow narration captions
        </label>
        <Btn v="pri" onClick={generate} disabled={loading||(!rich&&!premise.trim())} sx={{padding:"11px 0",fontSize:13,justifyContent:"center",width:"100%"}}>
          {loading ? <><Spinner size={14}/> Writing {panelCount} panels…</> : "📝 Write Chapter 1 Script"}
        </Btn>
      </div>
      <div>
        {!result && !loading && (
          <div style={{padding:24,background:C.card,border:`0.5px dashed ${C.border2}`,borderRadius:12,color:C.muted,fontSize:13,textAlign:"center"}}>Paneled script appears here</div>
        )}
        {loading && (
          <div style={{padding:24,background:C.card,border:`0.5px solid ${C.border}`,borderRadius:12,display:"flex",alignItems:"center",gap:12,color:C.muted}}><Spinner size={18}/>Writing the chapter…</div>
        )}
        {result && (
          <div style={{background:C.card,border:`0.5px solid ${C.border}`,borderRadius:12,overflow:"hidden"}}>
            <div style={{padding:"14px 16px",borderBottom:`0.5px solid ${C.border}`,background:`linear-gradient(135deg,${C.purple}18,${C.pink}08)`}}>
              <div style={{fontSize:15,fontWeight:600,color:C.text}}>{result.chapter_title || "Chapter 1"}</div>
              {result.chapter_summary && <div style={{fontSize:12,color:C.muted,marginTop:3,lineHeight:1.5}}>{result.chapter_summary}</div>}
            </div>
            <div style={{padding:16,display:"flex",flexDirection:"column",gap:10,maxHeight:520,overflowY:"auto"}}>
              {(result.panels||[]).map((p,i)=>(
                <div key={i} style={{padding:"10px 12px",background:C.bg,borderRadius:8,border:`0.5px solid ${C.border}`}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:5}}>
                    <span style={{fontSize:11,fontWeight:600,color:C.muted}}>Panel {p.number||i+1}</span>
                    {p.mood && <Tag c={moodColor[p.mood]||C.muted}>{p.mood}</Tag>}
                  </div>
                  {p.scene_heading && <div style={{fontSize:10,color:C.muted,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:4}}>{p.scene_heading}</div>}
                  <div style={{fontSize:12,color:C.text,lineHeight:1.55,marginBottom:(p.dialogue?.length?6:0)}}>{p.scene}</div>
                  {(p.dialogue||[]).map((d,di)=>(
                    <div key={di} style={{fontSize:12,lineHeight:1.5,marginTop:2}}>
                      <span style={{color:C.purple,fontWeight:500}}>{d.character}{d.type&&d.type!=="speech"?` (${d.type})`:""}:</span>{" "}
                      <span style={{color:C.text,fontStyle:d.type==="thought"?"italic":"normal"}}>{d.text}</span>
                    </div>
                  ))}
                </div>
              ))}
              {result.chapter_end_hook && (
                <div style={{padding:"10px 14px",background:C.purple+"12",border:`0.5px solid ${C.purple}44`,borderRadius:8,fontSize:12,color:C.text,fontStyle:"italic"}}>
                  Cliffhanger: {result.chapter_end_hook}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Shared helper ────────────────────────────────────────────────────────────
function Row({label, val, C}) {
  if (!val) return null;
  return (
    <div>
      <div style={{fontSize:10,color:C.muted,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:3}}>{label}</div>
      <div style={{fontSize:13,color:C.text,lineHeight:1.6}}>{val}</div>
    </div>
  );
}

// ─── Main AgentsPage ──────────────────────────────────────────────────────────
export default function AgentsPage() {
  const C = useTheme();
  const [active, setActive] = useState("story");
  const [benchStory, setBenchStory] = useState(null);   // Story Agent output, handed to Script Agent
  const agent = LINE.find(a => a.id === active);         // stations come from the registry

  return (
    <div style={{maxWidth:960,margin:"0 auto"}}>
      <div style={{marginBottom:24}}>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:4}}>
          <div style={{width:8,height:8,borderRadius:"50%",background:`linear-gradient(135deg,${C.purple},${C.pink})`,boxShadow:`0 0 8px ${C.purple}88`}}/>
          <div style={{fontSize:11,color:C.purple,textTransform:"uppercase",letterSpacing:"0.12em",fontWeight:500}}>Admin Agents</div>
        </div>
        <div style={{fontSize:22,fontWeight:700,fontFamily:"'Cinzel',serif",color:C.text}}>The Factory Floor</div>
        <div style={{fontSize:13,color:C.muted,marginTop:4}}>Every station in the manga pipeline, runnable on its own</div>
      </div>

      <FactoryMap active={active} onPick={setActive}/>

      <div style={{background:C.surf,border:`0.5px solid ${C.border}`,borderRadius:14,padding:24}}>
        <div style={{marginBottom:18,paddingBottom:14,borderBottom:`0.5px solid ${C.border}`}}>
          <div style={{fontSize:16,fontWeight:600,color:C.text}}>{agent.icon} {agent.name}</div>
          <div style={{fontSize:12,color:C.muted,marginTop:2}}>{agent.blurb}</div>
        </div>
        {active === "prompts" && <PromptAgent/>}
        {active === "story"   && <StoryAgent onStory={setBenchStory}/>}
        {active === "script"  && <ScriptAgent story={benchStory}/>}
        {active === "voice"   && <VoiceAgent/>}
        {active === "panels"  && <PanelAgent/>}
      </div>
    </div>
  );
}
