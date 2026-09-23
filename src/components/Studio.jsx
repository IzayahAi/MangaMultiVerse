import { useState, useRef, useEffect } from "react";
import { SEEDS, rndEmoji, rndCover, MOOD_PALETTES, getMood, LANG_GROUPS, RECOMMENDED_LANGS, STYLE_NATIVE, MAX_LANGS_PER_PUBLISH, TRANSLATION_ENABLED, DEMO_MAX_STORIES, DEMO_MAX_CHAPTERS, RELEASE_MODE, featuresFor, DEFAULT_RATING } from "../constants.js";
import { useTheme } from "../ThemeContext.jsx";
import {
  askClaude, generatePanelImage, trainCharacterLora,
  generateElevenAudio, pickElevenVoice, HAS_ELEVEN, ELEVEN_VOICE_OPTIONS,
  AGENT_STEP1, AGENT_STEP2, AGENT_STEP3, AGENT_STEP4,
  P_SCRIPT, P_SCRIPT_BATCH, P_CHAPTER, P_BIBLE_UPDATE, P_CHAR, P_VOICES, P_TRANSLATE, translateChapter, translateUpdated,
  P_TRENDING_SEEDS, P_PERSONAL_SEEDS, P_MORE_LIKE_THIS, P_WIZARD_BUILD, P_EASTER_EGG,
} from "../lib/claude.js";
import { fetchTranslatedLangs, fetchTranslation, fetchChapters, fetchChapter, fetchBible } from "../lib/supabase.js";
import { Tag, Btn, Field, Sec, Spinner, Toast } from "./UI.jsx";
import { BUBBLE_FONT, isBigPanel, onArtBubbles, ThoughtCloud, spreadShots, spreadCellSpan, buildCharIntros, firstAppearances, CharIntroCard, NarrationBox } from "./mangaBubbles.jsx";
import PublishModal from "./PublishModal.jsx";

const Studio = ({user, credits, onUseCredits, drafts, myStoryCount = 0, onSave, onSaveTranslations, onSaveChapter, onDeleteChapter, onSaveBible, onRequestAuth, editStory, onEditConsumed, onPublished}) => {
  const C = useTheme();
  const DRAFT_KEY = "mv_studio_draft";
  const savedDraft = (() => { try { return JSON.parse(localStorage.getItem(DRAFT_KEY) || "null"); } catch { return null; } })();

  const [step,setStep]     = useState(savedDraft?.step || "seed");
  const [seed,setSeed]     = useState(savedDraft?.seed || "");
  const [genre,setGenre]   = useState(savedDraft?.genre || "Shonen action");
  const [tone,setTone]     = useState(savedDraft?.tone || "Epic & grand");
  const [style,setStyle]   = useState(savedDraft?.style || "PRISMA");
  const [demographic,setDemographic] = useState(savedDraft?.demographic || "Shōnen");
  const [stream,setStream] = useState("");
  const [story,setStory]   = useState(savedDraft?.story || null);
  const [script,setScript] = useState(savedDraft?.script || null);
  const [cb,setCb]         = useState(savedDraft?.cb || null);
  const [loading,setLoad]  = useState(false);
  const [tab,setTab]       = useState(savedDraft?.tab || "concept");
  const [showPub,setShowPub]= useState(false);
  const [publishing,setPub] = useState(false);
  const [pubProgress,setPubProgress] = useState(""); // "Translating to French… (2/5)" during publish
  const [toast,setToast]   = useState(null);
  const [tool,setTool]     = useState("story");
  const [voices,setVoices] = useState(savedDraft?.voices || null);
  const [agentStep,setAgentStep] = useState(0);
  const [panelImages,setPanelImages] = useState({});
  const [panelsLoading,setPanelsLoading] = useState(false);
  // First-appearance character intro nameplates for the reader preview.
  const charIntroMap = firstAppearances(script?.panels, buildCharIntros({ ...(story||{}), script }));
  const captionVariant = style === "US-EN" ? "comic" : "manga"; // Comics art style → hand-lettered caption boxes
  const [panelProgress,setPanelProgress] = useState(0);
  const [translation,setTranslation] = useState(savedDraft?.translation || null);
  const [transLangs,setTransLangs] = useState(savedDraft?.transLangs || []); // languages to pre-translate
  const [transLoading,setTransLoading] = useState(false);
  const [transProgress,setTransProgress] = useState("");
  const [storedLangs,setStoredLangs] = useState([]); // languages already saved in the translations store
  const ALL_TRANS = LANG_GROUPS.flatMap(g=>g.langs).filter(l=>l!=="English");
  const togTrans = l => setTransLangs(p => p.includes(l) ? p.filter(x=>x!==l) : [...p,l]);
  const [recMode,setRecMode]         = useState("seeds");
  const [trendingSeeds,setTrending]  = useState([]);
  const [trendingLoading,setTrendingLoad] = useState(false);
  const [moreLike,setMoreLike]       = useState([]);
  const [moreLikeLoading,setMoreLikeLoad] = useState(false);
  const [personalSeeds,setPersonal]  = useState([]);
  const [personalLoading,setPersonalLoad] = useState(false);
  const [wizard,setWizard]           = useState({hero:"",want:"",obstacle:"",world:"",twist:""});
  const [wizardResult,setWizardResult] = useState(null);
  const [wizardLoading,setWizardLoad]  = useState(false);
  const [panelCount,setPanelCount]     = useState(savedDraft?.panelCount || 50);
  const [useNarrator,setUseNarrator]   = useState(savedDraft?.useNarrator || false);
  const [thoughtStyle,setThoughtStyle] = useState(savedDraft?.thoughtStyle || "caption"); // "caption" (webtoon) | "bubble" (comic)
  const [scriptProgress,setScriptProgress] = useState("");
  const [editingId,setEditingId]       = useState(savedDraft?.editingId || null);
  const [editStatus,setEditStatus]     = useState(savedDraft?.editStatus || null);
  const [chapterNum,setChapterNum]     = useState(savedDraft?.chapterNum || 1); // chapter currently open in the editor
  const [chapterCount,setChapterCount] = useState(savedDraft?.chapterCount || 1); // total chapters that exist for this story
  const [chapterBusy,setChapterBusy]   = useState(false); // generating/switching a chapter
  const [bible,setBible]               = useState(null);  // Story Brain: living bible for this story
  const [bibleBusy,setBibleBusy]       = useState(false); // bible being (re)built from a chapter
  const [regenPanel,setRegenPanel]     = useState(null); // panel.number currently regenerating
  const [training,setTraining]         = useState(false); // character LoRA training in progress
  const [trainStatus,setTrainStatus]   = useState("");    // training progress message
  const [coverArt,setCoverArt]         = useState(savedDraft?.coverArt || null); // {url, caption, scene} — bonus non-canon cover
  const [coverLoading,setCoverLoading] = useState(false);
  const [editMode,setEditMode]         = useState(false); // manual editing of text fields
  const [speaking,setSpeaking]         = useState(null);  // which voice is currently playing
  const [voiceOverrides,setVoiceOverrides] = useState(savedDraft?.voiceOverrides || {}); // { character: elevenVoiceId }
  const [volume,setVolume]             = useState(() => { const v = parseFloat(localStorage.getItem("mv_voice_volume")); return isNaN(v) ? 0.6 : v; });
  const ref                = useRef(null);
  const audioRef           = useRef(null);
  const playTokenRef       = useRef(null);
  const autoSaveRef        = useRef(null); // debounce timer for cloud auto-save
  const lastSavedSigRef    = useRef("");   // skip redundant auto-saves

  useEffect(()=>{ if(stream) ref.current?.scrollIntoView({behavior:"smooth"}); },[stream]);

  // Persist draft so a refresh doesn't wipe in-progress work
  useEffect(() => {
    try {
      if (story || seed) {
        localStorage.setItem(DRAFT_KEY, JSON.stringify({ step, seed, genre, tone, style, demographic, story, script, cb, voices, translation, transLangs, tab, panelCount, useNarrator, thoughtStyle, editingId, editStatus, voiceOverrides, coverArt }));
      }
    } catch {}
  }, [step, seed, genre, tone, style, demographic, story, script, cb, voices, translation, transLangs, tab, editingId, editStatus, voiceOverrides, thoughtStyle, coverArt]);

  // Which languages are already pre-translated in the store — so we can skip them and save tokens.
  useEffect(() => {
    const sid = editingId || story?.id;
    if (!sid) { setStoredLangs([]); return; }
    let active = true;
    fetchTranslatedLangs(sid).then(ls => { if (active) setStoredLangs(Array.isArray(ls) ? ls : []); });
    return () => { active = false; };
  }, [editingId, story?.id, tab]);

  // Load an existing story sent in for editing (from the Creator dashboard / story page)
  useEffect(() => {
    if (!editStory?._loadedAt) return;
    // support_characters may live on the story, or (for remote-synced stories) stashed in script.
    setStory({...editStory, support_characters: editStory.support_characters || editStory.script?.support_characters || []});
    setScript(editStory.script || null);
    if (editStory.script?.thought_style) setThoughtStyle(editStory.script.thought_style);
    setCb(editStory.character_brief || null);
    setCoverArt(editStory.cover_art || editStory.script?.cover_art || null);
    setVoices(editStory.voices || null);
    setEditingId(editStory.id || null);
    setEditStatus(editStory.status || null);
    setChapterNum(1);
    setChapterCount(editStory.chapters || 1);
    // Discover any chapters 2+ that live in the chapters table (best-effort).
    if (editStory.id) fetchChapters(editStory.id).then(rows => {
      if (Array.isArray(rows) && rows.length) setChapterCount(Math.max(editStory.chapters || 1, ...rows.map(r => r.number || 1)));
    });
    // Load this story's living bible (Story Brain), if any.
    if (editStory.id) fetchBible(editStory.id).then(row => { if (row?.data) setBible(row.data); }); else setBible(null);
    // Restore any panel images saved for this story
    try {
      const saved = localStorage.getItem(`mv_panels_${editStory.id}`);
      setPanelImages(saved ? JSON.parse(saved) : {});
    } catch { setPanelImages({}); }
    setStep("story");
    setTab(editStory.script ? "script" : "concept");
    onEditConsumed?.();
  }, [editStory?._loadedAt]);

  // Seeds are NO LONGER auto-generated on mount — that fired a Claude call (token spend) before the user
  // did anything. The seed screen shows a "✦ Load AI-generated trending seeds" button instead (fetchTrending),
  // so generation only happens when the user asks for it.

  // Demo/beta: creating requires a signed-in account so all generated manga saves to the cloud and is
  // ready to publish at launch. Reading stays open to guests. Returns false (and prompts sign-in) if
  // the visitor isn't signed in.
  // Effective per-plan features (demo defaults when the gate is off). Drives the tier gates below.
  const feat = featuresFor(user);
  // Premium HD audio (ElevenLabs) needs the env kill-switch on AND the user's plan to include voice.
  const voiceOn = HAS_ELEVEN && feat.voice;
  // Guests get write-your-own only (no seed prompts/suggestions); signed-in creators keep the full tools.
  const effMode = user ? recMode : "write";

  const requireAuth = () => {
    if (user) return true;
    setToast({ msg: "Create a free account to save your manga — no payment, it's just yours to keep.", type: "warn" });
    onRequestAuth?.();
    return false;
  };

  const gen = async (prompt, onDone) => {
    if (!requireAuth()) return;
    setLoad(true); setStream("");
    const r = await askClaude(prompt, (text) => setStream(text));
    setLoad(false);
    if(r) onDone(r);
  };

  const genStory = async () => {
    if(!seed.trim()) return;
    if (!requireAuth()) return;
    // Demo cap: a creator can make up to DEMO_MAX_CHAPTERS manga (each is a Chapter 1). Editing an
    // existing one (editingId set) is always allowed; only NEW creations count. Unlimited at launch.
    if (!editingId && feat.maxStories != null && (myStoryCount || 0) >= feat.maxStories) {
      setToast({ msg: RELEASE_MODE
        ? `Your plan includes ${feat.maxStories} stor${feat.maxStories === 1 ? "y" : "ies"} — upgrade for unlimited, or add chapters to what you've made.`
        : `Demo limit: ${DEMO_MAX_STORIES} stories max (up to ${DEMO_MAX_CHAPTERS} chapters each). Add chapters to what you've made — full access opens at launch.`, type: "warn" });
      return;
    }
    setStep("gen"); setStory(null); setScript(null); setCb(null);
    setVoices(null); setTranslation(null);
    const emoji = rndEmoji(); const cover_color = rndCover();

    setAgentStep(1);
    const s1 = await askClaude(AGENT_STEP1(seed,genre,tone,style,demographic), ()=>{});
    if (!s1) {
      setStep("seed");
      setToast({msg:"Step 1 failed — check your API key in Vercel env vars",type:"err"});
      return;
    }
    setStory({...s1, emoji, cover_color});

    setAgentStep(2);
    const s2 = await askClaude(AGENT_STEP2(s1), ()=>{});
    if (s2) setStory(prev => ({...prev, ...s2}));

    setAgentStep(3);
    const s3 = await askClaude(AGENT_STEP3(s1, s2||{}), ()=>{});
    if (s3) setStory(prev => ({...prev, ...s3}));

    setAgentStep(4);
    const s4 = await askClaude(AGENT_STEP4(s1, s2||{}, s3||{}), ()=>{});
    if (s4) setStory(prev => ({...prev, ...s4}));

    setStory(prev => {
      const fix = arr => Array.isArray(arr) ? arr : (arr ? String(arr).split(",").map(s=>s.trim()).filter(Boolean) : []);
      const fixStr = val => {
        if (val === null || val === undefined) return val;
        if (typeof val !== "object") return val;
        const strs = Object.values(val).filter(v => typeof v === "string");
        return strs.length ? strs.join(" · ") : Object.values(val).map(v => typeof v === "object" ? Object.values(v).join(" ") : String(v)).join(" · ");
      };
      const fixCharacter = c => {
        if (!c || typeof c !== "object") return c;
        const out = {};
        for (const [k, v] of Object.entries(c)) out[k] = typeof v === "object" && v !== null ? fixStr(v) : v;
        return out;
      };
      return {
        ...prev,
        themes: fix(prev.themes),
        genre_tags: fix(prev.genre_tags),
        comparable_works: fix(prev.comparable_works),
        story_arc: Array.isArray(prev.story_arc) ? prev.story_arc.map(a => ({
          act: a.act || a.beat || a.phase || a.title || Object.keys(a)[0] || "Act",
          beats: typeof a.beats === "string" ? a.beats : fixStr(a) || "",
        })) : [],
        support_characters: Array.isArray(prev.support_characters) ? prev.support_characters : [],
        subplots: fix(prev.subplots),
        chapter_one_beats: fix(prev.chapter_one_beats),
        factions: Array.isArray(prev.factions) ? prev.factions : [],
        protagonist: fixCharacter(prev.protagonist),
        antagonist: fixCharacter(prev.antagonist),
        visual_style_notes: fixStr(prev.visual_style_notes),
        central_conflict: fixStr(prev.central_conflict),
        logline: fixStr(prev.logline),
        chapter_one_hook: fixStr(prev.chapter_one_hook),
        tagline: fixStr(prev.tagline),
        setting: prev.setting && typeof prev.setting === "object" ? {
          ...prev.setting,
          description: fixStr(prev.setting.description),
          unique_element: fixStr(prev.setting.unique_element),
        } : prev.setting,
      };
    });

    setAgentStep(0);
    setStep("story");
    setTab("concept");
    onUseCredits?.(4); // 4 agent steps
  };

  // Strip narration boxes when the creator has the narrator turned off (belt-and-suspenders)
  const stripNarration = (panels) => useNarrator ? panels : (panels||[]).map(p => ({...p, dialogue: (p.dialogue||[]).filter(d => d.type !== "narration")}));

  const genScript = async () => {
    if (!requireAuth()) return;
    setTab("script"); setLoad(true); setScript(null); setScriptProgress("");
    const BATCH = 6; // panels per Claude call — smaller batches avoid truncation now that scenes are richer
    const batches = Math.ceil(panelCount / BATCH);

    if (batches === 1) {
      // Small chapter — single call
      const r = await askClaude(P_SCRIPT(story, panelCount, useNarrator, demographic), t => setStream(t));
      setLoad(false);
      if (r) { r.panels = stripNarration(r.panels); setScript(r); updateBible(chapterNum, r); }
      return;
    }

    // Large chapter — batched
    let allPanels = [];
    let chapterTitle = "";
    let chapterSummary = "";
    let chapterEndHook = "";
    let prevSummary = "Chapter begins — introduce the world and protagonist.";

    // Rich running recap so each batch continues the exact story thread (last few panels + a key line)
    const buildRecap = (panels) => panels.slice(-5).map(p => {
      const line = (p.dialogue||[]).find(d => d.text)?.text;
      return `[${p.number}] ${(p.scene||"").slice(0,110)}${line?` — "${line}"`:""}`;
    }).join(' ');

    for (let b = 0; b < batches; b++) {
      const start = b * BATCH + 1;
      const end = Math.min(start + BATCH - 1, panelCount);
      setScriptProgress(`Writing panels ${start}–${end} of ${panelCount}…`);

      if (b === 0) {
        // First batch — get full structure
        const r = await askClaude(P_SCRIPT(story, end - start + 1, useNarrator, demographic), t => setStream(t));
        if (!r) { setLoad(false); setScriptProgress(""); return; }
        chapterTitle = r.chapter_title || "";
        chapterSummary = r.chapter_summary || "";
        chapterEndHook = r.chapter_end_hook || "";
        allPanels = r.panels || [];
        prevSummary = buildRecap(allPanels);
      } else {
        // Subsequent batches — get panel array only, continuing the exact thread.
        // Retry a failed batch a couple times (with backoff) so a transient backend blip doesn't leave a
        // half-written chapter — the failure mode that stopped a script mid-way at panel ~42.
        let raw = null;
        for (let attempt = 0; attempt < 3 && !raw; attempt++) {
          if (attempt > 0) { setScriptProgress(`Writing panels ${start}–${end} of ${panelCount}… (retry ${attempt})`); await new Promise(r => setTimeout(r, 1500 * attempt)); }
          raw = await askClaude(P_SCRIPT_BATCH(story, start, end, panelCount, prevSummary, useNarrator, demographic), t => setStream(t));
        }
        if (!raw) { setToast({ msg: `Couldn't write panels ${start}–${end} (backend hiccup). Script saved up to panel ${allPanels.length} — hit ↻ Rewrite to try again.`, type: "warn" }); break; }
        // raw might be an array or wrapped object
        const panels = Array.isArray(raw) ? raw : (raw.panels || []);
        allPanels = [...allPanels, ...panels];
        prevSummary = buildRecap(allPanels);
        if (raw.chapter_end_hook) chapterEndHook = raw.chapter_end_hook;
      }
    }

    setLoad(false);
    setScriptProgress("");
    if (allPanels.length > 0) {
      const builtCh = { chapter_title: chapterTitle, chapter_summary: chapterSummary, panels: stripNarration(allPanels), chapter_end_hook: chapterEndHook };
      setScript(builtCh); updateBible(chapterNum, builtCh);
    }
  };
  const genChar     = () => { setTab("char");   gen(P_CHAR(story),   r=>setCb(r)); };
  const genVoices   = () => {
    if (RELEASE_MODE && !feat.voice) { setToast({ msg: "Character voices are a Pro feature — upgrade to add them.", type: "warn" }); return; }
    setTab("voices"); gen(P_VOICES(story), r=>setVoices(r));
  };
  // Translate the chapter into EVERY selected language (batched 12 panels/call), save each to the
  // translations store so readers get them instantly, and preview the last one.
  const genTranslate = async () => {
    if (!feat.translate) { setToast({ msg: RELEASE_MODE ? "Translation is a Pro feature — upgrade to unlock other languages." : "Translation is English-only during the demo — it opens up at launch.", type: "warn" }); return; }
    if (!requireAuth()) return;
    if (!script?.panels?.length || !transLangs.length) return;
    setTransLoading(true); setTranslation(null);
    const sid = editingId || story?.id;
    // A stored language is re-checked against the current script: panels whose dialogue changed since
    // it was translated (e.g. you edited a line or fixed a panel) get re-translated; unchanged panels
    // are reused, so nothing already-done is paid for twice.
    let existing = storedLangs;
    if (sid) { try { existing = await fetchTranslatedLangs(sid); } catch { existing = storedLangs; } }
    const todo = transLangs.filter(l => l !== "English");
    const savedMap = {}; let lastPreview = null;
    let fresh = 0, patched = 0, upToDate = 0;
    for (let li = 0; li < todo.length; li++) {
      const lang = todo[li];
      const wasStored = existing.includes(lang);
      try {
        const prev = wasStored && sid ? await fetchTranslation(sid, lang) : null;
        const data = await translateUpdated(script, lang, voices, story, prev,
          (d, t) => setTransProgress(`${lang} (${li + 1}/${todo.length}) · ${d}/${t} batches`));
        if (data) {
          lastPreview = data;
          if (data._updated === 0) { upToDate++; }          // stored & nothing stale → skip save
          else { savedMap[lang] = data; if (prev) patched++; else fresh++; }
        }
      } catch (e) { console.warn(`translate ${lang}:`, e.message); }
    }
    setTransProgress("");
    if (sid && Object.keys(savedMap).length) {
      try { await onSaveTranslations?.(sid, savedMap); } catch (e) { console.warn("save translations:", e.message); }
      try { const ls = await fetchTranslatedLangs(sid); setStoredLangs(Array.isArray(ls) ? ls : []); } catch {}
    }
    setTransLoading(false);
    if (lastPreview) setTranslation(lastPreview);
    const saved = fresh + patched;
    const parts = [];
    if (fresh) parts.push(`${fresh} new`);
    if (patched) parts.push(`${patched} updated for edited panels`);
    if (upToDate) parts.push(`${upToDate} already current`);
    if (saved) setToast({ msg: (sid ? `Translations saved — ${parts.join(" · ")}` : `Translated ${saved} language${saved>1?"s":""} · save or publish to store them`), type: "ok" });
    else setToast({ msg: upToDate ? `All ${upToDate} selected language${upToDate>1?"s are":" is"} up to date — no panels changed` : "No languages to translate", type: upToDate ? "ok" : "warn" });
  };

  // Build the [description, characterContext] for a single panel — injecting only the
  // characters actually in that scene so the image matches the story.
  const buildPanelImager = (charBrief) => {
    const brief = charBrief?.design_brief;
    const cast = {}; // { lowercaseName: {name, sheet} }
    const addCast = (name, sheet) => { if (name && sheet) cast[name.toLowerCase()] = { name, sheet }; };
    // Detailed, labelled identity block — the more specific and consistent the tokens, the less the
    // face/outfit drifts between panels. "ALWAYS identical" nudges the model to reuse the same design.
    addCast(story?.protagonist?.name, brief
      ? `${story?.protagonist?.name} (protagonist, ALWAYS identical appearance) — build: ${brief.body_type||""}; face: ${brief.face||""}; eyes: ${brief.eyes||""}; hair: ${brief.hair||""}; always wearing: ${brief.default_outfit||""}${brief.signature_accessory?`; signature item: ${brief.signature_accessory}`:""}`
      : story?.protagonist?.name && `${story.protagonist.name} (protagonist, ALWAYS identical appearance): ${story.protagonist.appearance}`);
    addCast(story?.antagonist?.name, story?.antagonist?.name && `${story.antagonist.name} (antagonist, ALWAYS identical appearance): ${story.antagonist.appearance}`);
    (story?.support_characters||[]).forEach(c => addCast(c.name, c.name && `${c.name} (ALWAYS identical appearance): ${c.appearance || c.hook || c.role || ""}`));

    // Resolve a loosely-written name ("Kaito", "the boy Kaito") to a cast member — tolerant of
    // spelling variants ("Blackthorn" ~ "Blackthorne") via a ≤1-edit match on shared name tokens,
    // but still returns null for a genuinely different/invented name (which then falls to inference).
    const lev1 = (a, b) => {
      if (a === b) return true;
      const la = a.length, lb = b.length;
      if (Math.abs(la - lb) > 1) return false;
      let i = 0, j = 0, edits = 0;
      while (i < la && j < lb) {
        if (a[i] === b[j]) { i++; j++; }
        else { if (++edits > 1) return false; if (la > lb) i++; else if (lb > la) j++; else { i++; j++; } }
      }
      return edits + (la - i) + (lb - j) <= 1;
    };
    const tokens = (s) => s.split(/\s+/).filter(t => t.length > 2);
    const resolveName = (nm) => {
      const low = (nm || "").toLowerCase().trim();
      if (!low) return null;
      if (cast[low]) return cast[low];
      const qTok = tokens(low);
      for (const key of Object.keys(cast)) {
        if (key === low) return cast[key];
        const kTok = tokens(key);
        if (qTok.some(q => kTok.some(k => lev1(q, k)))) return cast[key]; // shared first/last name (±1 typo)
      }
      return null;
    };

    // Who is actually in the frame. Prefer the script's explicit per-panel `cast`;
    // fall back to the old scene/dialogue name-matching for drafts written before `cast` existed.
    // Legacy heuristic: infer presence from speakers + scene text (for drafts written before `cast`).
    const heuristicCast = (panel) => {
      const out = []; const seen = new Set();
      const push = (c) => { if (c && !seen.has(c.name)) { seen.add(c.name); out.push(c); } };
      const speakers = (panel.dialogue || []).map(d => (d.character || "").toLowerCase()).filter(Boolean);
      const sceneLc = (panel.scene || "").toLowerCase();
      for (const key of Object.keys(cast)) {
        const first = key.split(/\s+/)[0];
        const inSpeakers = speakers.some(sp => sp === key || sp.split(/\s+/)[0] === first || (first.length > 2 && sp.includes(first)));
        const inScene = sceneLc.includes(key) || (first.length > 2 && sceneLc.includes(first));
        if (inSpeakers || inScene) push(cast[key]);
      }
      return out;
    };

    // Who is actually in the frame. Prefer the script's explicit per-panel `cast`;
    // fall back to the heuristic when `cast` is absent OR when none of its names resolve
    // (a name the story object never defined — e.g. an ungenerated support character) so a
    // populated conversation panel never renders as an empty landscape.
    const castInPanel = (panel) => {
      if (Array.isArray(panel.cast) && panel.cast.length) {
        const out = []; const seen = new Set();
        panel.cast.forEach(nm => { const c = resolveName(nm); if (c && !seen.has(c.name)) { seen.add(c.name); out.push(c); } });
        if (out.length) return out;
        // Every explicit name failed to resolve — don't leave the frame empty; infer instead.
        const inferred = heuristicCast(panel);
        if (inferred.length) { console.warn("Panel cast unresolved:", panel.cast, "→ inferred", inferred.map(c=>c.name)); return inferred; }
        return out; // genuinely nobody we can identify
      }
      if (Array.isArray(panel.cast)) return []; // explicit empty cast = intentional no-people frame
      return heuristicCast(panel); // legacy draft: no cast field at all
    };

    // Stable seed per character name → FLUX re-rolls the SAME identity for that character
    // in every panel they lead, which is the single biggest lever on look-consistency.
    const seedFor = (name) => {
      const s = (name || "").toLowerCase();
      let h = 2166136261;
      for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
      return Math.abs(h) % 2147483647;
    };

    // overrideScene: render a single SHOT of a spread panel instead of the whole panel's scene.
    return (panel, prevPanel, overrideScene) => {
      const isShot = !!overrideScene;
      const base = overrideScene || panel.scene || panel.scene_description || panel.composition || 'manga panel';
      // Ground the environment so panels show the WORLD, not a character on a blank background.
      const world = story?.setting?.world ? ` World/setting: ${story.setting.world}${story.setting.description?` — ${String(story.setting.description).slice(0,90)}`:''}.` : "";
      // Big/action beats get a dense, detailed cinematic composition (Part A: denser single images).
      const dense = isBigPanel(panel) ? " Dense, highly detailed cinematic composition: multiple figures mid-motion, dynamic foreshortening, speed and impact lines, flying debris, intricate detailed background." : "";
      // Visual continuity: nudge consecutive panels to share the same setting/lighting so the chapter reads as one flowing scene
      const cont = (prevPanel && !isShot) ? ` Same location, lighting, and art continuity as the preceding moment: ${(prevPanel.scene||'').slice(0,120)}` : "";
      const present = castInPanel(panel);
      // Everyone who SPEAKS in this panel must be drawn, so the picture matches the conversation.
      const spoken = (panel.dialogue || []).filter(d => d.type === "speech" || d.type === "thought");
      for (const d of spoken) { const c = resolveName(d.character); if (c && !present.some(p => p.name === c.name)) present.push(c); }
      // Translate the dialogue beat into VISUAL direction (expressions/pose), never literal text.
      // Skip for individual shots — a shot is pure imagery; dialogue belongs to the whole spread.
      let convo = "";
      const speakers = [...new Set(spoken.map(d => d.character).filter(Boolean))];
      if (speakers.length && !isShot) {
        const talking = spoken.some(d => d.type === "speech");
        convo = talking
          ? ` This is a conversation beat: ${speakers.join(" and ")} ${speakers.length > 1 ? "talking to each other, mid-exchange" : "speaking"} — show them with mouths/expressions and body language that match a "${panel.mood || 'dramatic'}" tone, others reacting.`
          : ` ${speakers[0]} is deep in thought — show a pensive, internal expression matching a "${panel.mood || 'dramatic'}" tone.`;
      }
      const description = `${base}.${world}${dense} Mood: ${panel.mood || 'dramatic'}. Shot: ${panel.panel_type || 'half_page'}.${convo}${cont}`;
      const characterContext = present.length ? present.map(p => p.sheet).join('. ') : "no characters in frame — focus entirely on the environment and atmosphere";
      // Seed the panel off the PROTAGONIST whenever they're in frame (so their look is requested
      // identically across all their panels), else off the most prominent character present.
      const protName = story?.protagonist?.name;
      const lead = present.find(p => p.name === protName) || present[0];
      const seed = lead ? seedFor(lead.name) : undefined;
      // Use the trained character LoRA only when the protagonist is the lead in this frame.
      const lora = (lead && lead.name === protName && charBrief?.lora?.url) ? charBrief.lora : null;
      return [description, characterContext, seed, lora];
    };
  };

  // Train a per-character LoRA so the protagonist looks IDENTICAL across every panel.
  // Draws a reference sheet, trains a small model, and stores the weights on the character brief.
  const lockCharacter = async () => {
    if (training) return;
    let brief = cb;
    if (!brief && story?.protagonist?.name) {
      setTraining(true); setTrainStatus("Designing character…");
      brief = await askClaude(P_CHAR(story), () => {});
      if (brief) { setCb(brief); onUseCredits?.(1); }
    }
    if (!brief) { setToast({ msg: "Generate a script/character first, then lock the character.", type: "warn" }); return; }
    setTraining(true);
    try {
      const lora = await trainCharacterLora(brief, style, story?.protagonist?.name, (m) => setTrainStatus(m));
      const next = { ...brief, lora };
      setCb(next);
      onUseCredits?.(5);
      setToast({ msg: "✅ Character locked. Regenerate panels to apply the consistent look.", type: "success" });
    } catch (e) {
      console.error("LoRA training failed:", e);
      setToast({ msg: `Couldn't lock character: ${e.message}. Panels still use seed-matching.`, type: "warn" });
    } finally {
      setTraining(false); setTrainStatus("");
    }
  };

  // Generate a bonus NON-CANON "cover request" easter egg for the chapter intro (One Piece SBS style).
  const generateEasterEgg = async () => {
    if (coverLoading) return;
    if (!story?.protagonist?.name) { setToast({ msg: "Create the story first, then add a cover.", type: "warn" }); return; }
    setCoverLoading(true);
    try {
      const idea = await askClaude(P_EASTER_EGG(story), () => {});
      if (!idea?.scene) throw new Error("couldn't dream one up");
      const brief = cb?.design_brief;
      const castStr = [
        story.protagonist?.name && (brief
          ? `${story.protagonist.name}: ${brief.body_type||""}, ${brief.hair||""}, ${brief.eyes||""}, wearing ${brief.default_outfit||""}`
          : `${story.protagonist.name}: ${story.protagonist.appearance||""}`),
        story.antagonist?.name && `${story.antagonist.name}: ${story.antagonist.appearance||""}`,
        ...(story.support_characters||[]).map(c => `${c.name}: ${c.appearance||""}`),
      ].filter(Boolean).join('. ').slice(0, 700);
      const lora = cb?.lora?.url ? cb.lora : null;
      const url = await generatePanelImage(`Bonus non-canon cover illustration (not part of the story): ${idea.scene}`, castStr, style, 424242, lora);
      if (!url) throw new Error("image service didn't return art");
      setCoverArt({ url, caption: idea.caption || "", scene: idea.scene });
      onUseCredits?.(1);
      setToast({ msg: "🎁 Easter-egg cover added to the chapter intro.", type: "success" });
    } catch (e) {
      setToast({ msg: `Couldn't make the cover: ${e.message}`, type: "warn" });
    } finally {
      setCoverLoading(false);
    }
  };

  // A valid SPREAD has 2-4 sub-scene ("shots") strings; returns them, else null (normal panel).
  const panelShots = (panel) => {
    const s = Array.isArray(panel?.shots) ? panel.shots.filter(x => typeof x === "string" && x.trim().length > 3) : [];
    return s.length >= 2 ? s.slice(0, 4) : null;
  };

  // Generate the image(s) for one panel — a single image, or one per shot for a spread.
  // Spread images are keyed "<number>.<shotIndex>"; single images keep the integer key. Returns true if any rendered.
  // seedBump lets a manual Redo re-roll to a genuinely DIFFERENT image each click (pass it a random
  // number); the initial full generation passes 0 so panels keep their stable, consistent seeds.
  const genImagesForPanel = async (panel, imager, prev, seedBump = 0) => {
    const shots = panelShots(panel);
    if (shots) {
      const done = new Array(shots.length).fill(false);
      // Up to 3 passes — retry ONLY the shots that failed, so one Redo fills every cell even when
      // a shot blips (timeout/rate limit). Vary the seed each pass so a bad roll doesn't repeat.
      for (let pass = 0; pass < 3; pass++) {
        for (let si = 0; si < shots.length; si++) {
          if (done[si]) continue;
          const [d, cc, seed, lora] = imager(panel, prev, shots[si]);
          const shotSeed = Number.isFinite(seed) ? (seed + seedBump + si * 7919 + pass * 131) % 2147483647 : undefined;
          const img = await generatePanelImage(d, cc, style, shotSeed, lora);
          if (img) { done[si] = true; setPanelImages(p => ({ ...p, [`${panel.number}.${si}`]: img })); }
          await new Promise(r => setTimeout(r, 450));
        }
        if (done.every(Boolean)) break;
        await new Promise(r => setTimeout(r, 900)); // breathe before retrying the stragglers
      }
      return done.some(Boolean);
    }
    // Single panel — retry a couple times if it blips.
    for (let pass = 0; pass < 3; pass++) {
      const [d, cc, seed, lora] = imager(panel, prev);
      const s = Number.isFinite(seed) ? (seed + seedBump + pass * 131) % 2147483647 : undefined;
      const img = await generatePanelImage(d, cc, style, s, lora);
      if (img) { setPanelImages(p => ({ ...p, [panel.number]: img })); return true; }
      await new Promise(r => setTimeout(r, 900));
    }
    return false;
  };

  // Regenerate a single panel's image(s) (creator didn't like what it made)
  const regenerateOnePanel = async (panel) => {
    if (!requireAuth()) return;
    if (regenPanel) return; // one at a time
    setRegenPanel(panel.number);
    // try/finally so the "in progress" flag ALWAYS clears — otherwise one thrown error would jam the
    // guard above and block every future Redo. We DON'T pre-delete the old image: genImagesForPanel
    // overwrites each shot in place as the new one lands, so the panel keeps showing its current art
    // the whole time and a failed/blipped regen leaves the old image intact instead of a blank.
    try {
      const imager = buildPanelImager(cb);
      const pIdx = (script?.panels||[]).findIndex(p => p.number === panel.number);
      const prev = pIdx > 0 ? script.panels[pIdx-1] : null;
      // Random seed bump so every Redo click yields a genuinely NEW image (better odds of a text-free roll).
      const ok = await genImagesForPanel(panel, imager, prev, Math.floor(Math.random() * 2000000000));
      if (ok) {
        setPanelImages(cur => { persistPanels(editingId || story?.id, cur); return cur; });
        onUseCredits?.(1);
      } else {
        setToast({msg:"Couldn't regenerate that panel — try again",type:"warn"});
      }
    } catch (e) {
      console.warn("regenerate panel failed:", e?.message);
      setToast({msg:"Couldn't regenerate that panel — try again",type:"warn"});
    } finally {
      setRegenPanel(null);
    }
  };

  // Throw away the current draft's panel art and restore the PUBLISHED cloud version (the panels the
  // story was opened with). Lets you regenerate/fine-tune freely, then bail out cleanly if it went bad.
  const revertToPublished = () => {
    const published = story?.script?.panel_images || {};
    if (!Object.keys(published).length) { setToast({msg:"No published panels to revert to yet.",type:"warn"}); return; }
    if (!window.confirm("Discard your current draft panel changes and restore the published version?")) return;
    setPanelImages(published);
    persistPanels(editingId || story?.id, published);
    setToast({msg:"Restored the published panels ✓",type:"ok"});
  };

  const genPanels = async () => {
    if (!requireAuth()) return;
    if (!script?.panels) return;
    // Guard the destructive "regenerate ALL" — it replaces every panel. To fix a few, use ↻ Redo.
    if (Object.keys(panelImages).length &&
        !window.confirm(`Regenerate ALL ${script.panels.length} panels? This replaces every current panel image.\n\nTo fix only a few panels, click Cancel and use ↻ Redo on each panel instead.`)) return;
    setPanelImages({}); setPanelProgress(0); setPanelsLoading(true);
    setTab("reader");

    // Auto-design the character first if it hasn't been done — this is what keeps
    // the character looking consistent across every panel.
    let charBrief = cb;
    if (!charBrief && story?.protagonist?.name) {
      setScriptProgress("Designing character for consistency…");
      const r = await askClaude(P_CHAR(story), ()=>{});
      if (r) { charBrief = r; setCb(r); onUseCredits?.(1); }
      setScriptProgress("");
    }

    const imager = buildPanelImager(charBrief);
    const panels = script.panels;
    let done = 0;      // panels attempted
    let succeeded = 0; // panels that actually produced an image

    // Fast-but-balanced: 2 panels in parallel with a short gap. FLUX (fast) + this modest
    // concurrency keeps well clear of the rate limit while cutting generation time ~4-5x.
    const PARALLEL = 2;
    let aborted = false;
    for (let i = 0; i < panels.length; i += PARALLEL) {
      const batch = panels.slice(i, i + PARALLEL);
      await Promise.all(batch.map(async (panel, j) => {
        const globalIdx = i + j;
        const ok = await genImagesForPanel(panel, imager, globalIdx > 0 ? panels[globalIdx-1] : null);
        if (ok) succeeded++;
        done++;
        setPanelProgress(Math.round((done / panels.length) * 100));
      }));
      // If the very first batch produced nothing, the image service is down/timing out —
      // stop instead of hanging for minutes, and tell the user clearly.
      if (i === 0 && succeeded === 0) { aborted = true; break; }
      if (i + PARALLEL < panels.length) await new Promise(r => setTimeout(r, 1500));
    }
    setPanelsLoading(false);
    if (succeeded > 0) onUseCredits?.(succeeded); // only charge for panels that actually rendered

    if (aborted) {
      setToast({ msg: "🎨 Image service (Together AI) is temporarily unavailable — your story, script, and voices are all saved. Try 'Generate panels' again in a bit.", type: "warn" });
      return;
    }
    if (succeeded < panels.length) {
      setToast({ msg: `Generated ${succeeded}/${panels.length} panels — the image service dropped a few. Use ↻ Redo on any blanks, or regenerate later.`, type: "warn" });
    }
    // Persist images so the reader can show them after a refresh — cloud AND local, immediately.
    const sid = editingId || story?.id;
    if (sid) setPanelImages(current => { persistPanels(sid, current); return current; });
  };

  const fetchTrending = async () => {
    setTrendingLoad(true);
    const r = await askClaude(P_TRENDING_SEEDS((genre||"").split(" + ")[0].trim() || genre, style), ()=>{});
    if (r?.seeds) setTrending(r.seeds);
    setTrendingLoad(false);
  };

  const fetchPersonal = async () => {
    if (!drafts.length) return;
    setPersonalLoad(true);
    const history = drafts.slice(0,5).map(s=>`${s.title} (${(s.genre_tags||[]).join(',')})`).join('; ');
    const r = await askClaude(P_PERSONAL_SEEDS(history), ()=>{});
    if (r?.seeds) setPersonal(r.seeds);
    setPersonalLoad(false);
  };

  const fetchMoreLike = async () => {
    if (!story) return;
    setMoreLikeLoad(true);
    const r = await askClaude(P_MORE_LIKE_THIS(story), ()=>{});
    if (r?.recommendations) setMoreLike(r.recommendations);
    setMoreLikeLoad(false);
  };

  const buildFromWizard = async () => {
    if (!wizard.hero || !wizard.want || !wizard.obstacle) return;
    setWizardLoad(true);
    const r = await askClaude(P_WIZARD_BUILD(wizard), ()=>{});
    if (r) setWizardResult(r);
    setWizardLoad(false);
  };

  const reset = () => { setStep("seed"); setSeed(""); setStory(null); setScript(null); setCb(null); setStream(""); setPanelImages({}); setMoreLike([]); setWizardResult(null); setVoices(null); setTranslation(null); setEditingId(null); setEditStatus(null); setEditMode(false); setVoiceOverrides({}); setThoughtStyle("caption"); try { localStorage.removeItem(DRAFT_KEY); } catch {} };

  // ── Manual field editing ───────────────────────────────────────────────
  // Set a (possibly nested) field on the story, e.g. "title" or "protagonist.name" or "setting.world".
  const editStoryField = (keyPath, val) => setStory(prev => {
    const next = { ...prev }; const parts = keyPath.split(".");
    let o = next;
    for (let i = 0; i < parts.length - 1; i++) { o[parts[i]] = { ...(o[parts[i]] || {}) }; o = o[parts[i]]; }
    o[parts[parts.length - 1]] = val;
    return next;
  });
  const editPanelField = (idx, key, val) => setScript(prev => { const panels = [...prev.panels]; panels[idx] = { ...panels[idx], [key]: val }; return { ...prev, panels }; });
  const editDialogue = (pIdx, dIdx, key, val) => setScript(prev => { const panels = [...prev.panels]; const dia = [...(panels[pIdx].dialogue || [])]; dia[dIdx] = { ...dia[dIdx], [key]: val }; panels[pIdx] = { ...panels[pIdx], dialogue: dia }; return { ...prev, panels }; });
  const addDialogue = (pIdx) => setScript(prev => { const panels = [...prev.panels]; const dia = [...(panels[pIdx].dialogue || []), { character: story?.protagonist?.name || "", type: "speech", text: "" }]; panels[pIdx] = { ...panels[pIdx], dialogue: dia }; return { ...prev, panels }; });
  const removeDialogue = (pIdx, dIdx) => setScript(prev => { const panels = [...prev.panels]; const dia = (panels[pIdx].dialogue || []).filter((_, j) => j !== dIdx); panels[pIdx] = { ...panels[pIdx], dialogue: dia }; return { ...prev, panels }; });
  const editBriefField = (key, val) => setCb(prev => { const hasWrap = !!prev?.design_brief; const b = { ...(hasWrap ? prev.design_brief : prev), [key]: val }; return hasWrap ? { ...prev, design_brief: b } : b; });
  const editVoiceField = (i, key, val) => setVoices(prev => { const vs = [...prev.voices]; vs[i] = { ...vs[i], [key]: val }; return { ...prev, voices: vs }; });
  const editVoiceLine = (i, j, val) => setVoices(prev => { const vs = [...prev.voices]; const lines = [...(vs[i].example_lines || [])]; lines[j] = val; vs[i] = { ...vs[i], example_lines: lines }; return { ...prev, voices: vs }; });

  // Set playback volume — persist and apply live to anything currently playing
  const changeVolume = (v) => {
    setVolume(v);
    try { localStorage.setItem("mv_voice_volume", String(v)); } catch {}
    if (audioRef.current) audioRef.current.volume = v;
  };

  // Stop any in-flight playback (both engines)
  const stopSpeaking = () => {
    playTokenRef.current = null; // invalidate any in-flight HD fetch
    try { if (window.speechSynthesis) window.speechSynthesis.cancel(); } catch {}
    if (audioRef.current) { try { audioRef.current.pause(); } catch {}; audioRef.current = null; }
    setSpeaking(null);
  };

  // ── Voice playback — ElevenLabs HD when available, else the browser engine ──
  const speakVoice = async (v) => {
    if (speaking === v.character) { stopSpeaking(); return; }
    stopSpeaking();
    const lines = (v.example_lines && v.example_lines.length ? v.example_lines : [v.catchphrase].filter(Boolean));
    if (!lines.length) { setToast({ msg: "No sample lines to play", type: "warn" }); return; }

    if (voiceOn) {
      setSpeaking(v.character);
      const token = Symbol("play");
      playTokenRef.current = token;
      // Gender/appearance hint from the matching story character improves voice casting
      const nm = (v.character||"").toLowerCase();
      const hint = [story?.protagonist, story?.antagonist].find(c => c && (c.name||"").toLowerCase().includes(nm.split(" ")[0]))?.appearance || "";
      const voiceId = voiceOverrides[v.character] || pickElevenVoice(v, hint);
      const text = lines.slice(0, 4).join(" … ");
      const url = await generateElevenAudio(text, voiceId);
      if (!url) { setToast({ msg: "HD voice failed — using built-in voice", type: "warn" }); return speakVoiceBrowser(v, lines); }
      if (playTokenRef.current !== token) { URL.revokeObjectURL(url); return; } // stopped/replaced mid-fetch
      const audio = new Audio(url);
      audio.volume = volume;
      audioRef.current = audio;
      audio.onended = () => { URL.revokeObjectURL(url); audioRef.current = null; setSpeaking(null); };
      audio.onerror = () => { URL.revokeObjectURL(url); audioRef.current = null; setSpeaking(null); };
      audio.play().catch(() => { setSpeaking(null); });
      return;
    }
    speakVoiceBrowser(v, lines);
  };

  // Browser Web Speech fallback
  const speakVoiceBrowser = (v, lines) => {
    if (typeof window === "undefined" || !window.speechSynthesis) { setToast({ msg: "Voice playback isn't supported in this browser", type: "warn" }); return; }
    const synth = window.speechSynthesis;
    synth.cancel();
    // Map character traits → pitch/rate so voices sound distinct
    const role = (v.role || "").toLowerCase();
    const core = ((v.personality_core || "") + " " + (v.speech_style || "")).toLowerCase();
    let pitch = 1, rate = 1;
    if (role.includes("antagonist") || /cold|menac|ruthless|dark|villain|deep/.test(core)) { pitch = 0.7; rate = 0.92; }
    else if (/child|young|bright|cheer|energetic|hyper|excit/.test(core)) { pitch = 1.4; rate = 1.12; }
    else if (/calm|wise|gentle|soft|weary|old/.test(core)) { pitch = 0.95; rate = 0.9; }
    else if (role.includes("narrator")) { pitch = 0.9; rate = 0.95; }
    const voicesList = synth.getVoices();
    const enVoices = voicesList.filter(vo => /en/i.test(vo.lang));
    const pick = enVoices[Math.abs((v.character||"").split("").reduce((a,c)=>a+c.charCodeAt(0),0)) % Math.max(1, enVoices.length)];
    setSpeaking(v.character);
    let idx = 0;
    const speakNext = () => {
      if (idx >= lines.length) { setSpeaking(null); return; }
      const u = new SpeechSynthesisUtterance(String(lines[idx]));
      u.pitch = pitch; u.rate = rate; u.volume = volume; if (pick) u.voice = pick;
      u.onend = () => { idx++; speakNext(); };
      u.onerror = () => { setSpeaking(null); };
      synth.speak(u);
    };
    speakNext();
  };

  // Hosted (http) panel image URLs only — safe to sync with the story so EVERY viewer sees the art.
  // Skips data: URIs (device-local, too large to embed in the DB row).
  const publicPanelImages = () => Object.fromEntries(
    Object.entries(panelImages).filter(([, v]) => typeof v === "string" && v.startsWith("http"))
  );

  // Persist generated panel images under a story id so the reader can show them later — locally
  // immediately, AND to the cloud (fire-and-forget), so art isn't lost if the creator navigates away
  // before the 5s autoSave debounce fires. Chapter scripts had this exact bug (see genChapter's
  // "persist IMMEDIATELY" comment) — this closes the same gap for panel art. Skips the cloud push for
  // Ch.1 of an already-published story, same rule autoSave follows (needs an explicit Update-live).
  const persistPanels = (id, images = panelImages) => {
    if (!id || !Object.keys(images).length) return;
    try {
      const json = JSON.stringify(images);
      if (json.length < 10 * 1024 * 1024) localStorage.setItem(`mv_panels_${id}`, json);
    } catch {}
    const pub = Object.fromEntries(Object.entries(images).filter(([, v]) => typeof v === "string" && v.startsWith("http")));
    if (!Object.keys(pub).length) return;
    const commonFields = { thought_style: thoughtStyle, cover_art: coverArt, support_characters: story?.support_characters, native_language: STYLE_NATIVE[style] || "English", layout: (style==="GL-EN"||style==="PRISMA") ? "webtoon" : "classic", mono: style==="JP-EN", art_style: style, panel_images: pub };
    if (chapterNum > 1) {
      onSaveChapter?.(id, chapterNum, { ...script, ...commonFields }, "draft")?.catch?.(() => {});
    } else if (editStatus !== "published") {
      onSave?.({ ...story, id, script: script ? { ...script, ...commonFields } : script, character_brief: cb, cover_art: coverArt, voices, status: "draft", author_name: user?.username || story?.author_name || "Anonymous" })?.catch?.(() => {});
    }
  };

  // Reopen a saved draft to keep working on it — restores script, character, cover, voices,
  // its saved panel images, AND its id/status so the next Save UPDATES it instead of duplicating.
  const loadDraft = (s) => {
    setStory({ ...s, support_characters: s.support_characters || s.script?.support_characters || [] });
    setScript(s.script || null);
    // Restore the art style so Redo/regenerate uses the SAME model + prompt the story was made with
    // (else a JP-EN manga gets re-drawn as the default style — wrong look and the no-text path skipped).
    if (s.script?.art_style) setStyle(s.script.art_style);
    else if (s.script?.mono) setStyle("JP-EN");
    if (s.script?.thought_style) setThoughtStyle(s.script.thought_style);
    setCb(s.character_brief || null);
    setCoverArt(s.cover_art || s.script?.cover_art || null);
    setVoices(s.voices || null);
    setEditingId(s.id || null);
    setEditStatus(s.status || null);
    // Load saved panel art: the story's PUBLISHED/committed copy in the DB (script.panel_images) is the
    // source of truth and WINS, so opening a story shows the saved version — not stray local regens that
    // were never published. localStorage only fills panels the DB doesn't have (unpublished drafts).
    try {
      const local = JSON.parse(localStorage.getItem(`mv_panels_${s.id}`) || "null");
      const fromDB = s.script?.panel_images || {};
      setPanelImages({ ...(local && typeof local === "object" ? local : {}), ...fromDB });
    } catch { setPanelImages(s.script?.panel_images || {}); }
    setStep("story");
    setTab(s.script?.panels?.length ? "reader" : "concept");
  };

  const save = async () => {
    if (!user) { onRequestAuth(); return; }
    if (chapterNum > 1) { const ok = await persistChapterN("draft"); setToast({ msg: ok ? `Chapter ${chapterNum} draft saved ✓` : "Chapter save failed", type: ok ? "ok" : "err" }); return; }
    const s = await onSave({...story, script: script ? {...script, thought_style: thoughtStyle, cover_art: coverArt, support_characters: story?.support_characters, native_language: STYLE_NATIVE[style] || "English", layout: (style==="GL-EN"||style==="PRISMA") ? "webtoon" : "classic", mono: style==="JP-EN", art_style: style, panel_images: publicPanelImages()} : script, character_brief:cb, cover_art:coverArt, voices, status:"draft", author_name:user.username});
    setStory(prev => ({...prev, id:s.id}));
    setEditingId(s.id); setEditStatus("draft");
    persistPanels(s.id);
    setToast({msg: editStatus==="published" ? "Saved as draft — unpublished until you update live" : "Draft saved ✓", type:"ok"});
  };

  // Cloud auto-save: quietly persist DRAFTS to the creator's account as they work, so nothing is ever
  // lost and every demo creation is in Supabase ready to publish at launch. Never auto-touches a
  // published story (that needs an explicit Update-live), never runs mid-generation, and skips no-op
  // re-saves. Same record each time (via story.id), so no duplicates.
  const autoSave = async () => {
    if (!user || !story) return;
    const pub = publicPanelImages();
    const sig = JSON.stringify({ ch: chapterNum, t: story.title, pc: script?.panels?.length || 0, pi: Object.keys(pub).length, cb: !!cb, v: !!voices, cov: !!coverArt });
    if (sig === lastSavedSigRef.current) return;
    try {
      // Chapter 2+ auto-saves to the chapters table (as a draft) even if the STORY is published — the
      // chapter has its own status, so writing a new chapter never unpublishes the series.
      if (chapterNum > 1) { const ok = await persistChapterN("draft"); if (ok) lastSavedSigRef.current = sig; return; }
      if (editStatus === "published") return; // Ch.1 of a published story: don't auto-unpublish (needs Update-live)
      const s = await onSave({ ...story, script: script ? { ...script, thought_style: thoughtStyle, cover_art: coverArt, support_characters: story?.support_characters, native_language: STYLE_NATIVE[style] || "English", layout: (style==="GL-EN"||style==="PRISMA") ? "webtoon" : "classic", mono: style==="JP-EN", art_style: style, panel_images: pub } : script, character_brief: cb, cover_art: coverArt, voices, status: "draft", author_name: user.username });
      if (s?.id) { if (!editingId) setEditingId(s.id); if (!story.id) setStory(prev => prev ? { ...prev, id: s.id } : prev); persistPanels(s.id); }
      lastSavedSigRef.current = sig;
    } catch (e) { console.warn("auto-save:", e.message); }
  };

  useEffect(() => {
    if (!user || !story) return;
    if (chapterNum === 1 && editStatus === "published") return; // Ch.1 of a published story: manual Update-live only
    if (loading || panelsLoading || transLoading || agentStep || regenPanel || scriptProgress || chapterBusy) return; // never mid-generation
    clearTimeout(autoSaveRef.current);
    autoSaveRef.current = setTimeout(autoSave, 5000);
    return () => clearTimeout(autoSaveRef.current);
  }, [story, script, cb, voices, coverArt, panelImages, user, editStatus, chapterNum, chapterBusy, loading, panelsLoading, transLoading, agentStep, regenPanel, scriptProgress]);

  // Save edits straight to the live published chapter (same record, live immediately)
  const updateLive = async () => {
    if (!user) { onRequestAuth(); return; }
    if (chapterNum > 1) { setPub(true); try { const ok = await persistChapterN("published"); setToast({ msg: ok ? `Chapter ${chapterNum} updated live ✓` : "Update failed", type: ok ? "ok" : "err" }); } finally { setPub(false); } return; }
    if (script?.panels?.length && !Object.keys(publicPanelImages()).length &&
        !window.confirm("This chapter has no saved panel art yet, so readers on other devices will see empty panels.\n\nGenerate panels first — update live anyway?")) return;
    setPub(true);
    try {
      const saved = await onSave({...story, script: script ? {...script, thought_style: thoughtStyle, cover_art: coverArt, support_characters: story?.support_characters, native_language: STYLE_NATIVE[style] || "English", layout: (style==="GL-EN"||style==="PRISMA") ? "webtoon" : "classic", mono: style==="JP-EN", art_style: style, panel_images: publicPanelImages()} : script, character_brief:cb, cover_art:coverArt, voices, status:"published", author_name:user?.username||story.author_name||"Anonymous", updated_at:new Date().toISOString()});
      persistPanels(saved?.id);
      setStory(prev => ({...prev, id:saved.id}));
      setEditingId(saved.id); setEditStatus("published");
      setToast({msg:`"${story.title}" updated live ✓`,type:"ok"});
    } catch(e){ setToast({msg:"Update failed: "+e.message,type:"err"}); }
    finally { setPub(false); }
  };

  // Pre-generate the chapter's translations for the chosen languages at publish time, so every reader
  // gets them INSTANTLY (no live translate call). Batched 12 panels/call like the reader; returns
  // { [lang]: {language, chapter_title, panels:[…]} } saved to the separate translations store.
  const pregenerateTranslations = async (langs) => {
    const out = {};
    if (!TRANSLATION_ENABLED) return out; // demo: English only — skip all pre-translation to save tokens
    if (!langs?.length || !script?.panels?.length) return out;
    // Already-stored languages are refreshed, not skipped: only panels whose dialogue changed since
    // they were translated get re-translated (redrawn/edited panels), so re-publishing stays cheap
    // but never ships a stale translation.
    const sid = editingId || story?.id;
    let existing = [];
    if (sid) { try { existing = await fetchTranslatedLangs(sid); } catch {} }
    // Cap how many languages one publish pre-translates (mirror of api/_pricing.js LIMITS).
    const todo = langs.filter(l => l !== "English").slice(0, MAX_LANGS_PER_PUBLISH);
    for (let li = 0; li < todo.length; li++) {
      const lang = todo[li];
      try {
        const prev = existing.includes(lang) && sid ? await fetchTranslation(sid, lang) : null;
        const data = await translateUpdated(script, lang, voices, story, prev,
          (d, t) => setPubProgress(`Translating to ${lang}… (${li + 1}/${todo.length}) · ${d}/${t}`));
        // Only ship what actually changed — skip re-saving a language that's already current.
        if (data && data._updated !== 0) out[lang] = data;
      } catch (e) { console.warn(`Pre-translate ${lang} failed:`, e.message); }
    }
    setPubProgress("");
    return out;
  };

  const publish = async (langs, rating = DEFAULT_RATING) => {
    // Don't let a chapter ship with panels but no hosted art — readers would see blanks.
    if (script?.panels?.length && !Object.keys(publicPanelImages()).length &&
        !window.confirm("This chapter has no saved panel art yet, so readers on other devices will see empty panels.\n\nGenerate panels first for the full experience — publish anyway?")) return;
    // Chapter 2+ publishes to the chapters table (its own row), not the story record.
    if (chapterNum > 1) {
      setPub(true);
      try { const ok = await persistChapterN("published"); if (ok) { setShowPub(false); setToast({ msg: `Chapter ${chapterNum} is live 🎉`, type: "ok" }); onPublished?.(story); } else setToast({ msg: "Publish failed", type: "err" }); }
      finally { setPub(false); }
      return;
    }
    setPub(true);
    try {
      const translations = await pregenerateTranslations(langs);
      const saved = await onSave({...story, script: script ? {...script, thought_style: thoughtStyle, cover_art: coverArt, support_characters: story?.support_characters, native_language: STYLE_NATIVE[style] || "English", layout: (style==="GL-EN"||style==="PRISMA") ? "webtoon" : "classic", mono: style==="JP-EN", art_style: style, panel_images: publicPanelImages()} : script, character_brief:cb, cover_art:coverArt, voices, status:"published", content_rating:rating, author_name:user?.username||"Anonymous", langs:1+langs.length, published_at:new Date().toISOString()});
      // Store translations in their OWN table (keyed by the saved story id) — never in the story record.
      if (Object.keys(translations).length) { try { await onSaveTranslations?.(saved.id, translations); } catch(e){ console.warn("save translations:", e.message); } }
      persistPanels(saved?.id);
      setStory(prev => ({...prev, id:saved.id}));
      setEditingId(saved.id); setEditStatus("published");
      setShowPub(false);
      setToast({msg:`"${story.title}" is live on the homepage 🎉`,type:"ok"});
      onPublished?.(saved);   // take the creator to the homepage to see it live
    } catch(e){ setToast({msg:"Publish failed: "+e.message,type:"err"}); }
    finally{ setPub(false); }
  };

  // ── Multi-chapter series ──────────────────────────────────────────────────────
  // The current chapter's full script payload (script + panel art + presentation meta), shared by every
  // save path so Chapter 1 (story record) and Chapter 2+ (chapters table) store the exact same shape.
  const chapterScript = () => script ? { ...script, thought_style: thoughtStyle, cover_art: coverArt, support_characters: story?.support_characters, native_language: STYLE_NATIVE[style] || "English", layout: (style==="GL-EN"||style==="PRISMA") ? "webtoon" : "classic", mono: style==="JP-EN", art_style: style, panel_images: publicPanelImages() } : script;

  // Save the CURRENT chapter when it's 2+ (Chapter 1 always flows through the story record via save/publish).
  // Bumps the story's `chapters` count so the reader knows how many exist. Returns true on success.
  const persistChapterN = async (status) => {
    const sid = editingId || story?.id;
    if (!sid) { setToast({ msg: "Save the story once before adding chapters.", type: "warn" }); return false; }
    const ok = await onSaveChapter?.(sid, chapterNum, chapterScript(), status);
    // Chapter 2+ art lives in the chapters table (inside script.panel_images) — that's the durable copy.
    const newCount = Math.max(chapterCount, chapterNum);
    if (newCount !== (story?.chapters || 1)) {
      setChapterCount(newCount);
      try { await onSave({ ...story, id: sid, chapters: newCount, author_name: user?.username || story?.author_name || "Anonymous" }); } catch {}
    }
    return ok !== false;
  };

  // Load a chapter into the editor. Ch.1 = the story record's script; Ch.n = the chapters table.
  const switchChapter = async (n) => {
    if (n === chapterNum) return;
    setChapterBusy(true);
    try {
      if (n === 1) {
        setScript(story?.script || null);
        try { const ls = localStorage.getItem(`mv_panels_${editingId||story?.id}`); setPanelImages(ls ? JSON.parse(ls) : (story?.script?.panel_images || {})); } catch { setPanelImages(story?.script?.panel_images || {}); }
      } else {
        const row = await fetchChapter(editingId || story?.id, n);
        if (row?.script) { setScript(row.script); setPanelImages(row.script.panel_images || {}); }
        else { setScript(null); setPanelImages({}); }
      }
      setChapterNum(n);
      setTab("reader");
    } finally { setChapterBusy(false); }
  };

  // Delete the LATEST chapter (2+) — removes its row, drops the story's count, and returns to the
  // previous chapter. Chapter 1 can't be deleted (it IS the story). Fixes an unwanted/phantom chapter.
  const deleteChapterN = async () => {
    const sid = editingId || story?.id;
    const del = chapterCount;
    if (!sid || del <= 1) return;
    if (!window.confirm(`Delete Chapter ${del}? This can't be undone.`)) return;
    setChapterBusy(true);
    try {
      await onDeleteChapter?.(sid, del);
      const target = del - 1; // the now-latest remaining chapter
      if (target === 1) {
        setScript(story?.script || null);
        try { const ls = localStorage.getItem(`mv_panels_${sid}`); setPanelImages(ls ? JSON.parse(ls) : (story?.script?.panel_images || {})); }
        catch { setPanelImages(story?.script?.panel_images || {}); }
      } else {
        const row = await fetchChapter(sid, target);
        if (row?.script) { setScript(row.script); setPanelImages(row.script.panel_images || {}); }
      }
      setChapterNum(target);
      setChapterCount(target);
      try { await onSave?.({ ...story, id: sid, chapters: target, author_name: user?.username || story?.author_name || "Anonymous" }); } catch {}
      setTab("reader");
      setToast({ msg: `Chapter ${del} deleted — you're back on Chapter ${target}.`, type: "ok" });
    } catch (e) { setToast({ msg: "Couldn't delete the chapter — try again.", type: "err" }); }
    finally { setChapterBusy(false); }
  };

  // Generate the NEXT chapter, continuing the series from the chapter currently open.
  const genChapter = async (direction = "") => {
    if (!requireAuth()) return;
    if (!story || !script?.panels?.length) { setToast({ msg: "Finish this chapter first, then add the next one.", type: "warn" }); return; }
    if (!RELEASE_MODE && user?.role !== "admin" && chapterCount >= DEMO_MAX_CHAPTERS) { setToast({ msg: `Demo limit: ${DEMO_MAX_CHAPTERS} chapters per story. Full access opens at launch.`, type: "warn" }); return; }
    const N = chapterCount + 1;
    if (!window.confirm(`Start Chapter ${N}? It creates a new chapter continuing from Chapter ${chapterNum}.`)) return;
    const prevRecap = `Chapter ${chapterNum}: ${script.chapter_summary || script.chapter_title || ""}. It ended on: ${script.chapter_end_hook || "an open cliffhanger."}`
      + (direction ? `\nThe creator wants THIS chapter to go in this direction: ${direction}` : "");
    setChapterBusy(true); setTab("script"); setScriptProgress(`Writing Chapter ${N}…`); setStream("");
    try {
      const BATCH = 6;
      const batches = Math.ceil(panelCount / BATCH);
      let allPanels = [], title = "", summary = "", endHook = "", recap = prevRecap, lastErr = null;
      // A single batch that THROWS (a JSON-parse failure, a transient provider error) must not discard
      // the whole chapter. Retry each batch, treat a throw like an empty return, and remember the last
      // error so it can surface. Callers keep whatever panels already succeeded (break-with-progress).
      const askBatch = async (prompt) => {
        for (let a = 0; a < 3; a++) {
          if (a) await new Promise(r => setTimeout(r, 1500 * a));
          try { const r = await askClaude(prompt, t => setStream(t), 2, "script"); if (r) return r; }
          catch (e) { lastErr = e; }
        }
        return null;
      };
      for (let b = 0; b < batches; b++) {
        const start = b * BATCH + 1, end = Math.min(start + BATCH - 1, panelCount);
        setScriptProgress(`Writing Chapter ${N} — panels ${start}-${end}…`);
        if (b === 0) {
          const r = await askBatch(P_CHAPTER(story, N, end - start + 1, prevRecap, useNarrator, demographic, bibleText()));
          if (!r) { setToast({ msg: "Chapter generation failed" + (lastErr ? `: ${lastErr.message}` : " — try again."), type: "err" }); return; }
          title = r.chapter_title || `Chapter ${N}`; summary = r.chapter_summary || ""; endHook = r.chapter_end_hook || "";
          allPanels = r.panels || [];
        } else {
          const raw = await askBatch(P_SCRIPT_BATCH(story, start, end, panelCount, recap, useNarrator, demographic));
          if (!raw) { setToast({ msg: `Chapter ${N} saved up to panel ${allPanels.length} — hit ↻ to finish.`, type: "warn" }); break; }
          allPanels = [...allPanels, ...(Array.isArray(raw) ? raw : raw.panels || [])];
          if (raw.chapter_end_hook) endHook = raw.chapter_end_hook;
        }
        recap = allPanels.slice(-5).map(p => `[${p.number}] ${(p.scene||"").slice(0,110)}`).join(" ");
      }
      if (!allPanels.length) return;
      onUseCredits?.(5);
      setChapterCount(N); setChapterNum(N);
      setPanelImages({}); // fresh chapter — no art yet
      const built = { chapter_title: title, chapter_summary: summary, panels: stripNarration(allPanels), chapter_end_hook: endHook };
      setScript(built);
      setEditMode(false);
      // Persist the new chapter to the chapters table IMMEDIATELY, with explicit values. Don't wait for
      // the debounced auto-save: it reads async state (chapterNum/script) and is lost if the creator
      // navigates or reloads first — and the studio draft doesn't carry chapterNum, so a reload would
      // relabel this as Chapter 1 and its Ch.2 save path would never run. This is why generated chapters
      // never reached the table before. Save here so the chapter is durable the moment it's written.
      let persisted = false;
      const sid = editingId || story?.id;
      if (sid) {
        const newChapter = { ...built, thought_style: thoughtStyle, cover_art: coverArt, support_characters: story?.support_characters, native_language: STYLE_NATIVE[style] || "English", layout: (style==="GL-EN"||style==="PRISMA") ? "webtoon" : "classic", mono: style==="JP-EN", art_style: style, panel_images: {} };
        try {
          const saved = await onSaveChapter?.(sid, N, newChapter, "draft");
          persisted = saved !== false;
          if (persisted) { try { await onSave({ ...story, id: sid, chapters: Math.max(chapterCount, N), author_name: user?.username || story?.author_name || "Anonymous" }); } catch {} }
        } catch {}
      }
      updateBible(N, built); // grow the Story Brain (non-blocking)
      setToast(persisted
        ? { msg: `Chapter ${N} written & saved — generate panels, then publish it.`, type: "ok" }
        : { msg: `Chapter ${N} written, but the save didn't stick — hit Save as draft.`, type: "warn" });
    } catch (e) { setToast({ msg: "Chapter generation failed: " + e.message, type: "err" }); }
    finally { setChapterBusy(false); setScriptProgress(""); }
  };

  // ── Story Brain (the living bible) ────────────────────────────────────────────
  // Compact, unresolved-thread-focused bible → context for writing the next chapter (keeps continuity).
  const bibleText = () => bible ? JSON.stringify({
    characters: bible.characters, world_rules: bible.world_rules,
    plot_threads: (bible.plot_threads || []).filter(t => t.status !== "resolved"),
    open_hooks: bible.open_hooks, running_recap: bible.running_recap,
  }).slice(0, 4000) : "";

  // Pure merge: fold one chapter into a bible object and return the new bible (no state/save).
  const mergeChapter = async (prevBible, chapterNumber, scriptObj) => {
    if (!scriptObj?.panels?.length) return prevBible;
    const digest = `Ch${chapterNumber} "${scriptObj.chapter_title || ""}": ${scriptObj.chapter_summary || ""}. Ends on: ${scriptObj.chapter_end_hook || ""}. Scenes: ${scriptObj.panels.slice(0, 60).map(p => { const line = (p.dialogue || []).find(d => d.text)?.text; return (p.scene || "").slice(0, 80) + (line ? ` — "${line}"` : ""); }).join(" | ")}`.slice(0, 6000);
    const merged = await askClaude(P_BIBLE_UPDATE(story, prevBible, chapterNumber, digest), () => {}, 2, "brain");
    return (merged && (merged.characters || merged.running_recap)) ? merged : prevBible;
  };

  // Merge the just-written chapter into the bible (best-effort, non-blocking, free — action 'brain').
  const updateBible = async (chapterNumber, scriptObj) => {
    const sid = editingId || story?.id;
    if (!sid || !scriptObj?.panels?.length) return;
    setBibleBusy(true);
    try {
      const merged = await mergeChapter(bible, chapterNumber, scriptObj);
      if (merged && merged !== bible) { setBible(merged); await onSaveBible?.(sid, merged, {}); }
    } catch (e) { console.warn("bible update:", e.message); }
    finally { setBibleBusy(false); }
  };

  // Backfill/rebuild the whole Story Brain by reading EVERY existing chapter in order (Ch.1 from the
  // story record, Ch.2+ from the chapters table). Lets stories made before the brain get one.
  const backfillBible = async () => {
    const sid = editingId || story?.id;
    if (!sid) return;
    setBibleBusy(true);
    try {
      let acc = null; // rebuild from scratch so it reflects the current chapters exactly
      if (story?.script?.panels?.length) acc = await mergeChapter(acc, 1, story.script);
      for (let n = 2; n <= chapterCount; n++) {
        const row = await fetchChapter(sid, n);
        if (row?.script?.panels?.length) acc = await mergeChapter(acc, n, row.script);
      }
      if (acc) { setBible(acc); await onSaveBible?.(sid, acc, {}); }
      else setToast({ msg: "No chapters to read yet — write a chapter first.", type: "warn" });
    } catch (e) { console.warn("backfill bible:", e.message); }
    finally { setBibleBusy(false); }
  };

  // The Story Brain is NO LONGER auto-built on opening the tab — that fired a Claude call (token spend)
  // without the user asking. The tab shows a "↻ Rebuild from all chapters" button + an empty state that
  // prompts the user to click it, so the brain is only built on demand.

  const STYLE_OPTIONS = [
    {id:"PRISMA", flag:"✦",  label:"Prisma",   sub:"Our house format · full-color webtoon"},
    {id:"JP-EN", flag:"🇯🇵", label:"Manga",    sub:"Japanese style · English"},
    {id:"KR-EN", flag:"🇰🇷", label:"Manhwa",   sub:"Korean style · English"},
    {id:"CN-EN", flag:"🇨🇳", label:"Manhua",   sub:"Chinese style · English"},
    {id:"US-EN", flag:"🇺🇸", label:"Comics",   sub:"American style · English"},
    {id:"GL-EN", flag:"🌍",  label:"Global",   sub:"Mixed style · English"},
  ];

  if(step==="seed") return (
    <div style={{maxWidth:680,margin:"0 auto"}}>
      {toast&&<Toast msg={toast.msg} type={toast.type} onDone={()=>setToast(null)}/>}
      <div style={{textAlign:"center",marginBottom:24}}>
        <div style={{fontSize:20,fontWeight:700,fontFamily:"'Cinzel',serif",marginBottom:5}}>AI story studio</div>
        <div style={{fontSize:13,color:C.muted}}>Pick a style, describe your idea, and AI builds the rest.</div>
      </div>

      {!user && (
        <div onClick={()=>onRequestAuth?.()} role="button" style={{marginBottom:18,padding:"14px 18px",borderRadius:12,border:`0.5px solid ${C.purple}`,background:`linear-gradient(135deg,${C.purple}22,${C.pink}0f)`,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}>
          <div>
            <div style={{fontSize:14,fontWeight:600,color:C.text}}>🔒 Sign in to save your story</div>
            <div style={{fontSize:12,color:C.muted,marginTop:2}}>Creating is free — sign in to generate and keep your manga (500 free demo credits to start).</div>
          </div>
          <span style={{fontSize:13,fontWeight:600,color:"#fff",background:`linear-gradient(135deg,${C.purple},${C.pink})`,padding:"9px 18px",borderRadius:8,whiteSpace:"nowrap"}}>Sign in →</span>
        </div>
      )}

      <div style={{marginBottom:18}}>
        <div style={{fontSize:10,color:C.muted,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:8}}>Art style & language</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:7}}>
          {STYLE_OPTIONS.map(s=>(
            <div key={s.id} onClick={()=>setStyle(s.id)} style={{padding:"10px 12px",borderRadius:9,border:`0.5px solid ${style===s.id?C.purple:C.border}`,background:style===s.id?C.purple+"18":C.card,cursor:"pointer",transition:"all .12s",textAlign:"center"}}>
              <div style={{fontSize:20,marginBottom:4}}>{s.flag}</div>
              <div style={{fontSize:12,fontWeight:500,color:style===s.id?C.purpleL:C.text}}>{s.label}</div>
              <div style={{fontSize:10,color:C.muted,marginTop:1}}>{s.sub}</div>
            </div>
          ))}
        </div>
      </div>

      {user && (
      <div style={{display:"flex",gap:0,marginBottom:12,background:C.card,borderRadius:9,padding:3,border:`0.5px solid ${C.border}`}}>
        {[
          {id:"seeds",    label:"✦ Trending"},
          {id:"personal", label:"◈ For you"},
          {id:"wizard",   label:"⬡ Wizard"},
          {id:"write",    label:"✎ Write own"},
        ].map(m=>(
          <button key={m.id} onClick={()=>setRecMode(m.id)} style={{flex:1,padding:"7px 4px",borderRadius:7,fontSize:11,border:"none",background:recMode===m.id?C.purple:"transparent",color:recMode===m.id?"#fff":C.muted,cursor:"pointer",fontFamily:"inherit",fontWeight:recMode===m.id?500:400,transition:"all .15s"}}>
            {m.label}
          </button>
        ))}
      </div>
      )}

      {effMode==="seeds"&&(
        <div style={{marginBottom:14}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
            <div style={{fontSize:11,color:C.muted}}>Fresh ideas for {genre} · {style}</div>
            <button onClick={fetchTrending} disabled={trendingLoading} style={{fontSize:11,padding:"4px 10px",borderRadius:6,border:`0.5px solid ${C.border}`,background:"transparent",color:C.purple,cursor:"pointer",fontFamily:"inherit"}}>
              {trendingLoading?"Loading…":"↻ Refresh"}
            </button>
          </div>
          {trendingLoading&&<div style={{display:"flex",alignItems:"center",gap:8,padding:12,color:C.muted,fontSize:12}}><Spinner size={13}/>Generating trending ideas…</div>}
          {trendingSeeds.length===0&&!trendingLoading&&(
            <div style={{display:"flex",flexDirection:"column",gap:6}}>
              {SEEDS.map((ex,i)=>(
                <div key={i} onClick={()=>setSeed(ex)} style={{padding:"10px 14px",background:C.card,border:`0.5px solid ${C.border}`,borderRadius:9,cursor:"pointer",display:"flex",alignItems:"center",gap:10,transition:"border-color .12s"}}
                  onMouseEnter={e=>e.currentTarget.style.borderColor=C.purple}
                  onMouseLeave={e=>e.currentTarget.style.borderColor=C.border}>
                  <span style={{fontSize:18}}>💡</span>
                  <span style={{fontSize:13,color:C.text}}>{ex}</span>
                </div>
              ))}
              <button onClick={fetchTrending} style={{padding:"9px 0",border:`0.5px dashed ${C.purple}`,borderRadius:9,background:"transparent",color:C.purple,fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>✦ Load AI-generated trending seeds</button>
            </div>
          )}
          {trendingSeeds.length>0&&(
            <div style={{display:"flex",flexDirection:"column",gap:6}}>
              {trendingSeeds.map((s,i)=>(
                <div key={i} onClick={()=>setSeed(s.seed)} style={{padding:"10px 14px",background:seed===s.seed?C.purple+"18":C.card,border:`0.5px solid ${seed===s.seed?C.purple:C.border}`,borderRadius:9,cursor:"pointer",display:"flex",alignItems:"center",gap:12,transition:"all .12s"}}
                  onMouseEnter={e=>e.currentTarget.style.borderColor=C.purple}
                  onMouseLeave={e=>e.currentTarget.style.borderColor=seed===s.seed?C.purple:C.border}>
                  <span style={{fontSize:20,flexShrink:0}}>{s.emoji||"💡"}</span>
                  <div style={{flex:1}}>
                    <div style={{fontSize:13,color:C.text,lineHeight:1.5}}>{s.seed}</div>
                    {s.vibe&&<div style={{fontSize:10,color:C.muted,marginTop:2}}>{s.vibe}</div>}
                  </div>
                  {seed===s.seed&&<Tag c={C.purple}>Selected</Tag>}
                </div>
              ))}
              <button onClick={fetchTrending} disabled={trendingLoading} style={{marginTop:4,padding:"10px 0",border:`1.5px solid ${C.purple}`,borderRadius:9,background:C.purple+"18",color:C.purple,fontSize:13,fontWeight:500,cursor:"pointer",fontFamily:"inherit",width:"100%",letterSpacing:"0.02em",transition:"all .15s"}}
                onMouseEnter={e=>{e.currentTarget.style.background=C.purple+"33";}}
                onMouseLeave={e=>{e.currentTarget.style.background=C.purple+"18";}}>
                {trendingLoading ? "Generating…" : "↻ Generate new seeds"}
              </button>
            </div>
          )}
        </div>
      )}

      {effMode==="personal"&&(
        <div style={{marginBottom:14}}>
          {drafts.length===0?(
            <div style={{padding:"20px",textAlign:"center",background:C.card,borderRadius:10,border:`0.5px solid ${C.border}`}}>
              <div style={{fontSize:24,marginBottom:8}}>◈</div>
              <div style={{fontSize:13,color:C.muted}}>Create a few stories first and we'll learn your style</div>
            </div>
          ):(
            <div>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
                <div style={{fontSize:11,color:C.muted}}>Based on your {drafts.length} stories</div>
                <button onClick={fetchPersonal} disabled={personalLoading} style={{fontSize:11,padding:"4px 10px",borderRadius:6,border:`0.5px solid ${C.border}`,background:"transparent",color:C.purple,cursor:"pointer",fontFamily:"inherit"}}>
                  {personalLoading?"Loading…":"✦ Generate"}
                </button>
              </div>
              {personalLoading&&<div style={{display:"flex",alignItems:"center",gap:8,padding:12,color:C.muted,fontSize:12}}><Spinner size={13}/>Analyzing your taste…</div>}
              {personalSeeds.length===0&&!personalLoading&&(
                <button onClick={fetchPersonal} style={{width:"100%",padding:"14px",border:`0.5px dashed ${C.purple}`,borderRadius:9,background:"transparent",color:C.purple,fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>✦ Generate personalized ideas</button>
              )}
              {personalSeeds.map((s,i)=>(
                <div key={i} onClick={()=>setSeed(s.seed)} style={{padding:"11px 14px",background:seed===s.seed?C.purple+"18":C.card,border:`0.5px solid ${seed===s.seed?C.purple:C.border}`,borderRadius:9,cursor:"pointer",marginBottom:6,transition:"all .12s"}}
                  onMouseEnter={e=>e.currentTarget.style.borderColor=C.purple}
                  onMouseLeave={e=>e.currentTarget.style.borderColor=seed===s.seed?C.purple:C.border}>
                  <div style={{display:"flex",alignItems:"center",gap:10}}>
                    <span style={{fontSize:20}}>{s.emoji||"⭐"}</span>
                    <div>
                      <div style={{fontSize:13,color:C.text,lineHeight:1.5}}>{s.seed}</div>
                      {s.reason&&<div style={{fontSize:11,color:C.muted,marginTop:2,fontStyle:"italic"}}>"{s.reason}"</div>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {effMode==="wizard"&&(
        <div style={{marginBottom:14}}>
          <div style={{fontSize:11,color:C.muted,marginBottom:10}}>Answer 4 questions and AI builds your perfect seed</div>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {[
              {key:"hero",     label:"Who is your hero?",              placeholder:"e.g. A disgraced soldier, a street artist, a blind seer"},
              {key:"want",     label:"What do they desperately want?", placeholder:"e.g. Revenge, to protect their family, to find their lost power"},
              {key:"obstacle", label:"What stops them?",               placeholder:"e.g. A corrupt empire, their own dark past, an impossible choice"},
              {key:"world",    label:"What's the world like?",         placeholder:"e.g. Post-apocalyptic Tokyo, a kingdom of eternal night, modern day Seoul"},
              {key:"twist",    label:"Any wild twist? (optional)",     placeholder:"e.g. The villain is their future self, magic is actually a disease"},
            ].map(q=>(
              <div key={q.key}>
                <div style={{fontSize:11,color:C.muted,marginBottom:4}}>{q.label}</div>
                <input value={wizard[q.key]} onChange={e=>setWizard(p=>({...p,[q.key]:e.target.value}))} placeholder={q.placeholder}
                  style={{width:"100%",padding:"9px 13px",borderRadius:8,border:`0.5px solid ${C.border2}`,background:C.card,color:C.text,fontSize:12,fontFamily:"inherit",outline:"none"}}/>
              </div>
            ))}
          </div>
          <button onClick={buildFromWizard} disabled={wizardLoading||!wizard.hero||!wizard.want||!wizard.obstacle}
            style={{width:"100%",marginTop:12,padding:"11px 0",borderRadius:9,border:"none",background:wizard.hero&&wizard.want&&wizard.obstacle?`linear-gradient(135deg,${C.purple},${C.pink})`:C.dim,color:"#fff",fontSize:13,cursor:"pointer",fontFamily:"inherit",fontWeight:500}}>
            {wizardLoading?<><Spinner size={13}/>Building your seed…</>:"⬡ Build my story seed"}
          </button>
          {wizardResult&&(
            <div style={{marginTop:12,display:"flex",flexDirection:"column",gap:8}}>
              <div onClick={()=>setSeed(wizardResult.seed)} style={{padding:"12px 14px",background:seed===wizardResult.seed?C.purple+"18":C.card,border:`1.5px solid ${C.purple}`,borderRadius:9,cursor:"pointer"}}>
                <div style={{fontSize:10,color:C.purple,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:4}}>✦ Your seed</div>
                <div style={{fontSize:14,color:C.text,lineHeight:1.6,fontWeight:500}}>{wizardResult.seed}</div>
              </div>
              {wizardResult.enhanced&&(
                <div onClick={()=>setSeed(wizardResult.enhanced)} style={{padding:"11px 14px",background:C.card,border:`0.5px solid ${C.border}`,borderRadius:9,cursor:"pointer"}}
                  onMouseEnter={e=>e.currentTarget.style.borderColor=C.teal}
                  onMouseLeave={e=>e.currentTarget.style.borderColor=C.border}>
                  <div style={{fontSize:10,color:C.teal,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:4}}>Enhanced version</div>
                  <div style={{fontSize:12,color:C.text,lineHeight:1.6}}>{wizardResult.enhanced}</div>
                </div>
              )}
              {wizardResult.hooks?.map((h,i)=>(
                <div key={i} onClick={()=>setSeed(h)} style={{padding:"9px 12px",background:C.card,border:`0.5px solid ${C.border}`,borderRadius:8,cursor:"pointer",fontSize:12,color:C.muted}}
                  onMouseEnter={e=>{e.currentTarget.style.borderColor=C.gold;e.currentTarget.style.color=C.text;}}
                  onMouseLeave={e=>{e.currentTarget.style.borderColor=C.border;e.currentTarget.style.color=C.muted;}}>
                  💡 {h}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {effMode==="write"&&(
        <div style={{background:C.card,border:`0.5px solid ${C.border2}`,borderRadius:12,padding:18,marginBottom:14}}>
          <div style={{fontSize:10,color:C.muted,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:8}}>Your story idea</div>
          <textarea value={seed} onChange={e=>setSeed(e.target.value)} placeholder="A disgraced knight discovers his sword is haunted by the souls of everyone it has ever killed…" rows={4} style={{width:"100%",background:"transparent",border:"none",outline:"none",color:C.text,fontSize:14,lineHeight:1.7,resize:"none",fontFamily:"'DM Sans',sans-serif"}}/>
        </div>
      )}

      {seed.trim()&&effMode!=="write"&&(
        <div style={{padding:"10px 14px",background:C.purple+"12",border:`0.5px solid ${C.purple}44`,borderRadius:9,marginBottom:12,display:"flex",alignItems:"center",gap:10}}>
          <span style={{fontSize:14}}>✦</span>
          <div style={{flex:1}}>
            <div style={{fontSize:10,color:C.purple,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:2}}>Selected seed</div>
            <div style={{fontSize:12,color:C.text,lineHeight:1.5}}>{seed}</div>
          </div>
          <button onClick={()=>setSeed("")} style={{background:"transparent",border:"none",color:C.muted,cursor:"pointer",fontSize:16,lineHeight:1}}>×</button>
        </div>
      )}

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:16}}>
        {[
          {label:"Genre",multi:true,opts:["Shonen action","Murim martial arts","Isekai portal","Reincarnation","Cultivation xianxia","Dungeon system","Regression","Dark fantasy","Romantic comedy","Ecchi romcom","Psychological thriller","Slice of life","Sci-fi","Historical","Horror","Sports"],val:genre,set:setGenre},
          {label:"Tone",opts:["Epic & grand","Gritty & intense","Light & fun","Emotional & bittersweet","Mysterious","Hopeful","Dark & complex","Comedic"],val:tone,set:setTone},
          {label:"Audience",opts:["Shōnen","Shōjo","Seinen","Josei","Kodomo"],val:demographic,set:setDemographic}
        ].map(({label,opts,val,set,multi})=>(
          <div key={label}>
            <div style={{fontSize:10,color:C.muted,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:7}}>{label}{multi&&<span style={{textTransform:"none",letterSpacing:0,opacity:0.7}}> · pick one or more</span>}</div>
            <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
              {opts.map(o=>{
                const sel = multi ? (val||"").split(" + ").map(x=>x.trim()).filter(Boolean).includes(o) : val===o;
                const handle = multi
                  ? ()=>{ const cur=(val||"").split(" + ").map(x=>x.trim()).filter(Boolean); set((cur.includes(o)?cur.filter(x=>x!==o):[...cur,o]).join(" + ")); }
                  : ()=>set(o);
                return <button key={o} onClick={handle} style={{fontSize:11,padding:"4px 10px",borderRadius:7,border:`0.5px solid ${sel?C.purple:C.border}`,background:sel?C.purple+"22":"transparent",color:sel?C.purpleL:C.muted,cursor:"pointer",fontFamily:"inherit"}}>{o}</button>;
              })}
            </div>
          </div>
        ))}
      </div>

      <button onClick={genStory} disabled={!seed.trim()} style={{width:"100%",padding:"13px 0",borderRadius:10,border:"none",background:seed.trim()?`linear-gradient(135deg,${C.purple},${C.pink})`:C.dim,color:"#fff",fontSize:14,fontWeight:500,cursor:seed.trim()?"pointer":"default",fontFamily:"'Cinzel',serif",letterSpacing:"0.04em"}}>✦ Generate story concept</button>

      {drafts.length>0&&<div style={{marginTop:22}}>
        <div style={{fontSize:11,color:C.muted,marginBottom:8}}>Your drafts</div>
        {drafts.map(s=><div key={s.id} onClick={()=>loadDraft(s)} style={{padding:"10px 14px",border:`0.5px solid ${C.border}`,borderRadius:9,cursor:"pointer",background:C.card,marginBottom:6,display:"flex",justifyContent:"space-between",alignItems:"center"}} onMouseEnter={e=>e.currentTarget.style.borderColor=C.purple} onMouseLeave={e=>e.currentTarget.style.borderColor=C.border}>
          <div><div style={{fontSize:13,fontWeight:500,color:C.text}}>{s.title}</div><div style={{fontSize:11,color:C.muted}}>{s.tagline}</div></div>
          <Tag c={C.gold}>Draft</Tag>
        </div>)}
      </div>}
    </div>
  );

  const AGENT_STEPS = [
    {n:1, label:"Writing title & hook",    icon:"✦", color:C.purple},
    {n:2, label:"Creating characters",     icon:"◈", color:C.pink},
    {n:3, label:"Building the world",      icon:"⬡", color:C.gold},
    {n:4, label:"Mapping the story arc",   icon:"≋", color:C.teal},
  ];

  if(step==="gen") return (
    <div style={{maxWidth:480,margin:"0 auto",paddingTop:32}}>
      <style>{`@keyframes pulse{0%,100%{opacity:0.5;transform:scale(0.97)}50%{opacity:1;transform:scale(1.03)}}@keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}`}</style>
      <div style={{textAlign:"center",marginBottom:28}}>
        <div style={{width:56,height:56,borderRadius:14,background:`linear-gradient(135deg,${C.purple},${C.pink})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:24,margin:"0 auto 14px",animation:"pulse 1.8s ease-in-out infinite"}}>✦</div>
        <div style={{fontSize:16,fontWeight:700,fontFamily:"'Cinzel',serif",color:C.text}}>
          {story?.title || "Building your story…"}
        </div>
        {story?.tagline && <div style={{fontSize:12,color:C.muted,fontStyle:"italic",marginTop:4}}>{story.tagline}</div>}
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:20}}>
        {AGENT_STEPS.map(s => {
          const done = agentStep > s.n || (agentStep===0 && story?.story_arc);
          const active = agentStep === s.n;
          return (
            <div key={s.n} style={{display:"flex",alignItems:"center",gap:12,padding:"11px 14px",borderRadius:9,border:`0.5px solid ${active?s.color:done?s.color+"44":C.border}`,background:active?s.color+"14":done?s.color+"08":C.card,transition:"all .3s",animation:active?"pulse 1.5s ease-in-out infinite":"none"}}>
              <div style={{width:28,height:28,borderRadius:"50%",background:done?s.color:active?s.color+"44":C.dim,display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,color:done?"#fff":active?s.color:C.muted,flexShrink:0,transition:"all .3s"}}>
                {done ? "✓" : active ? <Spinner size={14}/> : s.icon}
              </div>
              <div style={{flex:1}}>
                <div style={{fontSize:12,fontWeight:500,color:active?s.color:done?C.text:C.muted}}>{s.label}</div>
              </div>
              <div style={{fontSize:10,color:active?s.color:done?C.teal:C.dim}}>
                {done?"Done":active?"Working…":"Waiting"}
              </div>
            </div>
          );
        })}
      </div>
      {story?.protagonist?.name && (
        <div style={{padding:"10px 14px",background:C.card,borderRadius:9,border:`0.5px solid ${C.pink}44`,borderLeft:`3px solid ${C.pink}`,animation:"fadeUp .3s ease",marginBottom:8}}>
          <div style={{fontSize:10,color:C.muted,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:2}}>Protagonist</div>
          <div style={{fontSize:13,fontWeight:500,color:C.text}}>{story.protagonist.name}</div>
        </div>
      )}
      {story?.central_conflict && (
        <div style={{padding:"10px 14px",background:C.card,borderRadius:9,border:`0.5px solid ${C.teal}44`,borderLeft:`3px solid ${C.teal}`,animation:"fadeUp .3s ease"}}>
          <div style={{fontSize:10,color:C.muted,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:2}}>Central conflict</div>
          <div style={{fontSize:12,color:C.text,lineHeight:1.6}}>{story.central_conflict}</div>
        </div>
      )}
      <div ref={ref}/>
    </div>
  );

  const tabs = [
    {id:"concept", label:"Story"},
    ...(script  ? [{id:"script",  label:"Script"}]    : []),
    ...(!script && !loading ? [{id:"gs", label:`✦ Write script (${panelCount}p)`, fn:genScript}] : []),
    ...(cb      ? [{id:"char",    label:"Characters"}] : []),
    ...(!cb && !loading ? [{id:"gc", label:"✦ Design character", fn:genChar}] : []),
    ...(voices  ? [{id:"voices",  label:"🎭 Voices"}]  : []),
    ...(!voices && script && !loading ? [{id:"gv", label:"✦ Voice profiles", fn:genVoices}] : []),
    ...(script && TRANSLATION_ENABLED ? [{id:"translate", label:"🌐 Translate"}] : []),
    // Story Brain runs in the background (updateBible after each chapter). No dedicated tab — its
    // recommendations surface in the reader view next to "+ New chapter".
    ...(Object.keys(panelImages).length > 0 ? [{id:"reader", label:"📖 Read"}] : []),
    ...(script && !panelsLoading && Object.keys(panelImages).length === 0 ? [{id:"gp", label:"🎨 Generate panels", fn:genPanels}] : []),
    ...(panelsLoading ? [{id:"gp", label:`🎨 Generating… ${panelProgress}%`}] : []),
  ];

  return (
    <div style={{animation:"fadeUp .2s ease"}}>
      {toast&&<Toast msg={toast.msg} type={toast.type} onDone={()=>setToast(null)}/>}
      {showPub&&<PublishModal story={story} onPublish={publish} onClose={()=>setShowPub(false)} saving={publishing} progress={pubProgress} canTranslate={feat.translate} maxLangs={feat.maxLangs}/>}
      <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:16,gap:12}}>
        <div style={{minWidth:0}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <div style={{fontSize:20,fontWeight:700,fontFamily:"'Cinzel',serif",marginBottom:3,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{story?.title}</div>
            {script && (chapterCount>1 ? (
              <select value={chapterNum} onChange={e=>switchChapter(Number(e.target.value))} disabled={chapterBusy||panelsLoading} title="Switch chapter"
                style={{fontSize:12,fontWeight:600,padding:"3px 8px",borderRadius:7,border:`0.5px solid ${C.purple}`,background:C.purple+"14",color:C.purple,fontFamily:"inherit",cursor:"pointer"}}>
                {Array.from({length:chapterCount},(_,i)=>i+1).map(n=><option key={n} value={n}>📖 Chapter {n} of {chapterCount}</option>)}
              </select>
            ) : (
              <Tag c={C.purple}>📖 Chapter {chapterNum}</Tag>
            ))}
            {editingId && <Tag c={editStatus==="published"?C.teal:C.gold}>{editStatus==="published"?"● Editing live":"Editing draft"}</Tag>}
          </div>
          <div style={{fontSize:13,color:C.muted,fontStyle:"italic"}}>{story?.tagline}</div>
          <div style={{display:"flex",gap:5,marginTop:7,flexWrap:"wrap"}}>{story?.genre_tags?.map(t=><Tag key={t} c={C.purple}>{t}</Tag>)}</div>
        </div>
        <div style={{display:"flex",gap:7,flexShrink:0,flexWrap:"wrap",justifyContent:"flex-end"}}>
          <Btn v={editMode?"pri":"ghost"} onClick={()=>setEditMode(m=>!m)}>{editMode?"✓ Done editing":"✎ Edit fields"}</Btn>
          {editingId && editStatus==="published" ? (
            <>
              <Btn v="pri" onClick={updateLive} disabled={publishing}>{publishing?"Updating…":"● Update live"}</Btn>
              <Btn v="teal" onClick={save}>Save as draft</Btn>
            </>
          ) : (
            <>
              <Btn v="teal" onClick={save}>💾 Save draft to library</Btn>
              {user&&<Btn v="pri" onClick={()=>setShowPub(true)}>✦ Publish →</Btn>}
            </>
          )}
          <Btn onClick={reset}>← New</Btn>
        </div>
      </div>
      <div style={{display:"flex",borderBottom:`0.5px solid ${C.border}`,marginBottom:18}}>
        {tabs.map(t=><button key={t.id} onClick={()=>{if(t.fn)t.fn();else setTab(t.id);}} style={{padding:"8px 14px",fontSize:12,border:"none",borderBottom:tab===t.id?`2px solid ${C.purple}`:"2px solid transparent",background:"transparent",color:tab===t.id?C.purple:t.label.startsWith("✦")?C.pink:C.muted,cursor:"pointer",fontFamily:"inherit",fontWeight:tab===t.id?500:400}}>{t.label}</button>)}
      </div>
      {loading&&<div style={{display:"flex",alignItems:"center",gap:10,padding:"20px 0"}}><Spinner/><span style={{color:C.muted,fontSize:13}}>Generating…</span></div>}

      {tab==="concept"&&story&&(
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
          <div>
            {editMode && <Sec title="Title & tagline" accent={C.purple}><div style={{background:C.card,borderRadius:9,padding:12,border:`0.5px solid ${C.border}`}}><Field label="Title" value={story.title} editing onChange={v=>editStoryField("title",v)}/><Field label="Tagline" value={story.tagline} editing onChange={v=>editStoryField("tagline",v)}/></div></Sec>}
            <Sec title="Premise" accent={C.purple}><div style={{background:C.card,borderRadius:9,padding:12,border:`0.5px solid ${C.border}`}}><Field label="Logline" value={story.logline} editing={editMode} onChange={v=>editStoryField("logline",v)} multiline/><Field label="Central conflict" value={story.central_conflict} editing={editMode} onChange={v=>editStoryField("central_conflict",v)} multiline/>{story.themes&&!editMode&&<div style={{display:"flex",gap:5,marginTop:6,flexWrap:"wrap"}}>{(Array.isArray(story.themes)?story.themes:String(story.themes).split(",")).map((t,i)=><Tag key={i} c={C.teal}>{t.trim()}</Tag>)}</div>}</div></Sec>
            <Sec title="World" accent={C.gold}><div style={{background:C.card,borderRadius:9,padding:12,border:`0.5px solid ${C.border}`}}>{editMode&&<Field label="World name" value={story.setting?.world} editing onChange={v=>editStoryField("setting.world",v)}/>}<Field label={editMode?"Description":(story.setting?.world||"Description")} value={story.setting?.description} editing={editMode} onChange={v=>editStoryField("setting.description",v)} multiline/><Field label="Unique element" value={story.setting?.unique_element} editing={editMode} onChange={v=>editStoryField("setting.unique_element",v)} multiline/></div></Sec>
            <Sec title="3-act arc" accent={C.pink}>{story.story_arc?.map((a,ai)=><div key={ai} style={{marginBottom:7,padding:"8px 10px",background:C.card,borderRadius:8,border:`0.5px solid ${C.border}`}}><div style={{fontSize:10,color:C.pink,fontWeight:500,marginBottom:3}}>{a.act}</div>{editMode?<textarea value={a.beats||""} onChange={e=>setStory(prev=>{const arc=[...prev.story_arc];arc[ai]={...arc[ai],beats:e.target.value};return{...prev,story_arc:arc};})} rows={3} style={{width:"100%",padding:"6px 9px",borderRadius:6,border:`0.5px solid ${C.border2}`,background:C.surf,color:C.text,fontSize:11,fontFamily:"inherit",resize:"vertical"}}/>:<div style={{fontSize:11,color:C.muted,lineHeight:1.6}}>{a.beats}</div>}</div>)}</Sec>
            <Sec title="Chapter 1 hook" accent={C.gold}>{editMode?<textarea value={story.chapter_one_hook||""} onChange={e=>editStoryField("chapter_one_hook",e.target.value)} rows={3} style={{width:"100%",padding:"9px 12px",borderRadius:8,border:`0.5px solid ${C.border2}`,background:C.surf,color:C.text,fontSize:12,fontFamily:"inherit",resize:"vertical"}}/>:<div style={{fontSize:12,color:C.text,lineHeight:1.7,padding:"9px 12px",background:C.card,borderRadius:8,borderLeft:`3px solid ${C.gold}`}}>{story.chapter_one_hook}</div>}</Sec>
          </div>
          <div>
            <Sec title="Protagonist" accent={C.purple}><div style={{background:C.card,borderRadius:9,padding:12,border:`0.5px solid ${C.border}`}}>{editMode?<Field label="Name" value={story.protagonist?.name} editing onChange={v=>editStoryField("protagonist.name",v)}/>:<div style={{fontSize:14,fontWeight:500,marginBottom:8,color:C.text}}>{story.protagonist?.name}<span style={{fontSize:11,color:C.muted,fontWeight:400}}> · {story.protagonist?.age}</span></div>}<Field label="Appearance" value={story.protagonist?.appearance} editing={editMode} onChange={v=>editStoryField("protagonist.appearance",v)} multiline/><Field label="Personality" value={story.protagonist?.personality} editing={editMode} onChange={v=>editStoryField("protagonist.personality",v)} multiline/><Field label="Inner wound" value={story.protagonist?.wound} editing={editMode} onChange={v=>editStoryField("protagonist.wound",v)} multiline/><Field label="Wants" value={story.protagonist?.goal} editing={editMode} onChange={v=>editStoryField("protagonist.goal",v)}/><Field label="Actually needs" value={story.protagonist?.need} editing={editMode} onChange={v=>editStoryField("protagonist.need",v)}/></div></Sec>
            <Sec title="Antagonist" accent={C.pink}><div style={{background:C.card,borderRadius:9,padding:12,border:`0.5px solid ${C.border}`}}>{editMode?<Field label="Name" value={story.antagonist?.name} editing onChange={v=>editStoryField("antagonist.name",v)}/>:<div style={{fontSize:14,fontWeight:500,marginBottom:8,color:C.text}}>{story.antagonist?.name}</div>}<Field label="Role" value={story.antagonist?.role} editing={editMode} onChange={v=>editStoryField("antagonist.role",v)}/><Field label="Motivation" value={story.antagonist?.motivation} editing={editMode} onChange={v=>editStoryField("antagonist.motivation",v)} multiline/><Field label="Mirrors protagonist" value={story.antagonist?.mirror} editing={editMode} onChange={v=>editStoryField("antagonist.mirror",v)} multiline/></div></Sec>
            {story.support_characters?.map(c=><div key={c.name} style={{marginBottom:6,padding:"8px 10px",background:C.card,border:`0.5px solid ${C.border}`,borderRadius:8}}><span style={{fontSize:12,fontWeight:500,color:C.text}}>{c.name}</span><span style={{fontSize:11,color:C.muted}}> · {c.role}</span><div style={{fontSize:11,color:C.muted,marginTop:2}}>{c.hook}</div></div>)}
            <Sec title="Visual style" accent={C.muted}>{editMode?<textarea value={typeof story.visual_style_notes==="object"?Object.values(story.visual_style_notes).join(" · "):(story.visual_style_notes||"")} onChange={e=>editStoryField("visual_style_notes",e.target.value)} rows={3} style={{width:"100%",padding:"8px 10px",borderRadius:8,border:`0.5px solid ${C.border2}`,background:C.surf,color:C.text,fontSize:12,fontFamily:"inherit",resize:"vertical"}}/>:<div style={{fontSize:12,color:C.muted,lineHeight:1.7,fontStyle:"italic"}}>{typeof story.visual_style_notes === "object" ? Object.values(story.visual_style_notes).join(" · ") : story.visual_style_notes}</div>}</Sec>
          </div>
        </div>
      )}

      {tab==="concept"&&story&&!script&&!loading&&(
        <div style={{marginTop:16,padding:"14px 16px",background:C.card,borderRadius:10,border:`0.5px solid ${C.border}`}}>
          <div style={{fontSize:12,fontWeight:500,color:C.text,marginBottom:10}}>Chapter panel count</div>
          <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:12}}>
            {[8,10,20,30,50].map(n=>(
              <button key={n} onClick={()=>setPanelCount(n)}
                style={{padding:"6px 14px",borderRadius:7,border:`0.5px solid ${panelCount===n?C.purple:C.border}`,background:panelCount===n?C.purple+"22":"transparent",color:panelCount===n?C.purpleL:C.muted,cursor:"pointer",fontSize:12,fontFamily:"inherit",fontWeight:panelCount===n?600:400}}>
                {n} panels{n===50?" (full chapter)":n===8?" (preview)":""}
              </button>
            ))}
          </div>
          <div style={{fontSize:11,color:C.muted,marginBottom:14}}>
            {panelCount<=10?"Quick preview — great for testing your story concept.":panelCount<=20?"Short chapter — good for one-shots and intros.":panelCount<=30?"Standard chapter — typical manga chapter length.":"Full chapter — professional manga length. Script generates in batches."}
          </div>
          <div onClick={()=>setUseNarrator(v=>!v)} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",background:C.surf,borderRadius:8,border:`0.5px solid ${useNarrator?C.purple:C.border}`,cursor:"pointer",marginBottom:14}}>
            <div style={{width:36,height:20,borderRadius:99,background:useNarrator?C.purple:C.border,position:"relative",transition:"background .15s",flexShrink:0}}>
              <div style={{position:"absolute",top:2,left:useNarrator?18:2,width:16,height:16,borderRadius:"50%",background:"#fff",transition:"left .15s"}}/>
            </div>
            <div>
              <div style={{fontSize:12,fontWeight:500,color:C.text}}>Narrator boxes {useNarrator?"on":"off"}</div>
              <div style={{fontSize:10,color:C.muted,marginTop:1}}>{useNarrator?"Uses narration boxes for time jumps and stakes.":"Story told entirely through dialogue, thoughts, and action — no narrator."}</div>
            </div>
          </div>
          <div style={{marginBottom:14}}>
            <div style={{fontSize:12,fontWeight:500,color:C.text,marginBottom:7}}>Thought style</div>
            <div style={{display:"flex",gap:8}}>
              {[["caption","💬 Caption boxes","Webtoon / manga — inner voice in caption boxes"],["bubble","💭 Thought bubbles","Comic style — classic thought bubbles"]].map(([val,label,desc])=>(
                <button key={val} onClick={()=>setThoughtStyle(val)} style={{flex:1,textAlign:"left",padding:"9px 12px",borderRadius:8,border:`1px solid ${thoughtStyle===val?C.purple:C.border}`,background:thoughtStyle===val?C.purple+"18":"transparent",cursor:"pointer",fontFamily:"inherit"}}>
                  <div style={{fontSize:12,fontWeight:600,color:thoughtStyle===val?C.purpleL:C.text}}>{label}</div>
                  <div style={{fontSize:10,color:C.muted,marginTop:2,lineHeight:1.4}}>{desc}</div>
                </button>
              ))}
            </div>
          </div>
          <Btn v="pri" onClick={genScript} sx={{width:"100%",justifyContent:"center"}}>✦ Write {panelCount}-panel script</Btn>
        </div>
      )}

      {tab==="concept"&&story&&(
        <div style={{marginTop:20,paddingTop:18,borderTop:`0.5px solid ${C.border}`}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
            <div style={{fontSize:12,fontWeight:500,color:C.text}}>More like this</div>
            <button onClick={fetchMoreLike} disabled={moreLikeLoading} style={{fontSize:11,padding:"4px 10px",borderRadius:6,border:`0.5px solid ${C.border}`,background:"transparent",color:C.purple,cursor:"pointer",fontFamily:"inherit"}}>
              {moreLikeLoading?<><Spinner size={11}/>Loading…</>:"✦ Generate"}
            </button>
          </div>
          {moreLike.length===0&&!moreLikeLoading&&(
            <div style={{fontSize:12,color:C.muted,padding:"12px 0"}}>Click Generate to get 3 similar story ideas based on this concept.</div>
          )}
          {moreLike.length>0&&(
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
              {moreLike.map((r,i)=>(
                <div key={i} onClick={()=>{setSeed(r.seed); setGenre(r.genre||genre); reset(); setTimeout(()=>setSeed(r.seed),50);}}
                  style={{padding:"11px 12px",background:C.card,border:`0.5px solid ${C.border}`,borderRadius:9,cursor:"pointer",transition:"border-color .12s"}}
                  onMouseEnter={e=>e.currentTarget.style.borderColor=C.purple}
                  onMouseLeave={e=>e.currentTarget.style.borderColor=C.border}>
                  <div style={{fontSize:18,marginBottom:6}}>{r.emoji||"✦"}</div>
                  <div style={{fontSize:12,color:C.text,lineHeight:1.5,marginBottom:6}}>{r.seed}</div>
                  <div style={{fontSize:10,color:C.muted,fontStyle:"italic"}}>{r.why}</div>
                  <div style={{marginTop:8}}><Tag c={C.purple}>{r.genre}</Tag></div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab==="script"&&loading&&(
        <div style={{textAlign:"center",padding:"40px 20px"}}>
          <div style={{fontSize:28,marginBottom:12,animation:"pulse 2s ease-in-out infinite"}}>✍️</div>
          <div style={{fontSize:14,fontWeight:500,color:C.text,marginBottom:6}}>{scriptProgress || "Writing your script…"}</div>
          <div style={{fontSize:11,color:C.muted}}>{panelCount > 10 ? `Generating in batches — ${panelCount} panels total` : ""}</div>
        </div>
      )}

      {tab==="script"&&script&&(
        <div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,marginBottom:10}}>
            <span style={{fontSize:11,color:C.muted}}>{script.panels?.length||0} panels{(script.panels?.length||0)<panelCount?` · target ${panelCount}`:""}</span>
            <Btn onClick={()=>{ if(window.confirm(`Rewrite the whole chapter script from scratch?\n\nThis replaces the current ${script.panels?.length||0} panels with a freshly written ${panelCount}-panel script.`)) genScript(); }} disabled={loading} sx={{whiteSpace:"nowrap"}}>↻ Rewrite script</Btn>
          </div>
          {editMode&&<div style={{fontSize:11,color:C.gold,marginBottom:10,padding:"6px 10px",background:C.gold+"14",borderRadius:6}}>✎ Editing — tweak scenes, dialogue, and moods. Regenerate panels after editing to redraw them.</div>}
          <div style={{marginBottom:14}}>
            {editMode
              ? <><input value={script.chapter_title||""} onChange={e=>setScript(prev=>({...prev,chapter_title:e.target.value}))} placeholder="Chapter title" style={{width:"100%",padding:"7px 10px",borderRadius:7,border:`0.5px solid ${C.border2}`,background:C.surf,color:C.text,fontSize:15,fontWeight:500,fontFamily:"inherit",marginBottom:6}}/><textarea value={script.chapter_summary||""} onChange={e=>setScript(prev=>({...prev,chapter_summary:e.target.value}))} placeholder="Chapter summary" rows={2} style={{width:"100%",padding:"6px 10px",borderRadius:7,border:`0.5px solid ${C.border2}`,background:C.surf,color:C.muted,fontSize:12,fontFamily:"inherit",resize:"vertical"}}/></>
              : <><div style={{fontSize:15,fontWeight:500,color:C.text}}>{script.chapter_title}</div><div style={{fontSize:12,color:C.muted,marginTop:3}}>{script.chapter_summary}</div></>}
          </div>
          {script.panels?.map((p,pIdx)=>{
            const tc={speech:C.purple,thought:C.teal,narration:C.gold,sfx:C.pink};
            const inp={padding:"4px 7px",borderRadius:5,border:`0.5px solid ${C.border2}`,background:C.surf,color:C.text,fontSize:12,fontFamily:"inherit",outline:"none"};
            return <div key={pIdx} style={{border:`0.5px solid ${C.border}`,borderRadius:10,overflow:"hidden",marginBottom:8}}>
              <div style={{padding:"7px 12px",background:C.surf,borderBottom:`0.5px solid ${C.border}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}><div style={{display:"flex",alignItems:"center",gap:8}}><span style={{fontSize:11,fontWeight:500,color:C.purple}}>Panel {p.number}</span><Tag c={C.dim}>{p.panel_type}</Tag></div>{editMode?<input value={p.mood||""} onChange={e=>editPanelField(pIdx,"mood",e.target.value)} placeholder="mood" style={{...inp,fontSize:11,width:120}}/>:<span style={{fontSize:11,color:C.muted}}>{p.mood}</span>}</div>
              {editMode&&<div style={{padding:"8px 12px 0"}}><div style={{fontSize:9,color:C.muted,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:3}}>Scene</div><textarea value={p.scene||""} onChange={e=>editPanelField(pIdx,"scene",e.target.value)} rows={2} style={{...inp,width:"100%",fontSize:11,lineHeight:1.5,resize:"vertical"}}/></div>}
              <div style={{padding:12}}>{p.dialogue?.map((d,i)=>{const dc=tc[d.type]||C.muted;
                return editMode
                  ? <div key={i} style={{display:"flex",gap:5,marginBottom:5,alignItems:"center"}}>
                      <input value={d.character||""} onChange={e=>editDialogue(pIdx,i,"character",e.target.value)} placeholder="name" style={{...inp,width:80,flexShrink:0}}/>
                      <select value={d.type||"speech"} onChange={e=>editDialogue(pIdx,i,"type",e.target.value)} style={{...inp,width:88,flexShrink:0,cursor:"pointer"}}>{["speech","thought","narration","sfx"].map(t=><option key={t}>{t}</option>)}</select>
                      <input value={d.text||""} onChange={e=>editDialogue(pIdx,i,"text",e.target.value)} placeholder="line…" style={{...inp,flex:1}}/>
                      <button onClick={()=>removeDialogue(pIdx,i)} style={{background:"transparent",border:"none",color:C.pink,cursor:"pointer",fontSize:15,flexShrink:0}}>×</button>
                    </div>
                  : <div key={i} style={{display:"flex",gap:8,marginBottom:5,padding:"5px 8px",borderRadius:6,background:dc+"11",borderLeft:`2px solid ${dc}`}}><span style={{fontSize:10,fontWeight:500,color:dc,minWidth:60,flexShrink:0}}>{d.character||d.type}</span><span style={{fontSize:12,color:C.text,lineHeight:1.5}}>"{d.text}"</span></div>;
              })}
              {editMode&&<button onClick={()=>addDialogue(pIdx)} style={{marginTop:4,fontSize:11,padding:"4px 10px",borderRadius:6,border:`0.5px dashed ${C.purple}`,background:"transparent",color:C.purple,cursor:"pointer",fontFamily:"inherit"}}>+ Add line</button>}
              </div>
            </div>;
          })}
          {(script.chapter_end_hook||editMode)&&<div style={{padding:"10px 14px",background:C.card,borderRadius:9,borderLeft:`3px solid ${C.pink}`,marginTop:8}}><div style={{fontSize:10,color:C.pink,fontWeight:500,marginBottom:3}}>End hook</div>{editMode?<textarea value={script.chapter_end_hook||""} onChange={e=>setScript(prev=>({...prev,chapter_end_hook:e.target.value}))} rows={2} style={{width:"100%",padding:"6px 9px",borderRadius:6,border:`0.5px solid ${C.border2}`,background:C.surf,color:C.text,fontSize:12,fontFamily:"inherit",resize:"vertical"}}/>:<div style={{fontSize:12,color:C.text,lineHeight:1.65}}>{script.chapter_end_hook}</div>}</div>}
        </div>
      )}

      {tab==="char"&&cb&&(()=>{
        const b = cb.design_brief || cb;
        const colors = b.color_palette || b.colors || [];
        const doNot = typeof b.do_not==="string" ? [b.do_not] : (b.do_not||[]);
        return (
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
            <div>
              <Sec title="Physical design" accent={C.purple}>
                <div style={{background:C.card,borderRadius:9,padding:12,border:`0.5px solid ${C.border}`}}>
                  <Field label="Body type" value={b.body_type} editing={editMode} onChange={v=>editBriefField("body_type",v)} multiline/>
                  <Field label="Face" value={b.face} editing={editMode} onChange={v=>editBriefField("face",v)} multiline/>
                  <Field label="Eyes" value={b.eyes} editing={editMode} onChange={v=>editBriefField("eyes",v)}/>
                  <Field label="Hair" value={b.hair} editing={editMode} onChange={v=>editBriefField("hair",v)}/>
                  <Field label="Signature accessory" value={b.signature_accessory||b.signature_item} editing={editMode} onChange={v=>editBriefField("signature_accessory",v)}/>
                </div>
              </Sec>
              <Sec title="Outfits" accent={C.gold}>
                <Field label="Default" value={b.default_outfit||b.outfit} editing={editMode} onChange={v=>editBriefField("default_outfit",v)} multiline/>
                <Field label="Battle" value={b.battle_outfit} editing={editMode} onChange={v=>editBriefField("battle_outfit",v)} multiline/>
              </Sec>
              {colors.length>0&&<Sec title="Color palette" accent={C.pink}>
                {colors.map((c,i)=>{
                  const parts=(typeof c==="string"?c:"").split(" — ");
                  const hex=parts[0]; const use=parts.slice(1).join(" — ");
                  return <div key={i} style={{display:"flex",alignItems:"center",gap:8,marginBottom:5}}>
                    <div style={{width:18,height:18,borderRadius:4,background:hex,border:`0.5px solid ${C.border}`,flexShrink:0}}/>
                    <span style={{fontSize:11,color:C.muted}}>{hex}{use?" — "+use:""}</span>
                  </div>;
                })}
              </Sec>}
              <Field label="Movement style" value={b.how_they_move||b.moves_like}/>
            </div>
            <div>
              {b.expression_range&&<Sec title="Expressions" accent={C.teal}>
                {Object.entries(b.expression_range).map(([k,v])=>(
                  <div key={k} style={{marginBottom:6,padding:"6px 10px",background:C.card,borderRadius:7,border:`0.5px solid ${C.border}`}}>
                    <div style={{fontSize:10,fontWeight:500,color:C.teal,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:2}}>{k}</div>
                    <div style={{fontSize:11,color:C.muted}}>{v}</div>
                  </div>
                ))}
              </Sec>}
              {(b.consistency_rules||[]).length>0&&<Sec title="Consistency rules" accent={C.gold}>
                {b.consistency_rules.map((r,i)=><div key={i} style={{display:"flex",gap:6,marginBottom:5,fontSize:11,color:C.muted,lineHeight:1.5}}><span style={{color:C.gold}}>✓</span>{r}</div>)}
              </Sec>}
              {doNot.length>0&&<Sec title="Do not" accent={C.pink}>
                {doNot.map((r,i)=><div key={i} style={{display:"flex",gap:6,marginBottom:5,fontSize:11,color:C.muted,lineHeight:1.5}}><span style={{color:C.pink}}>✗</span>{r}</div>)}
              </Sec>}
              <Field label="Visual arc" value={cb.visual_arc}/>
              <Field label="Relationship dynamic" value={cb.relationship_dynamic}/>
            </div>
          </div>
        );
      })()}

      {tab==="voices"&&(
        <div>
          {loading && <div style={{display:"flex",alignItems:"center",gap:10,padding:"20px 0"}}><Spinner/><span style={{color:C.muted,fontSize:13}}>Building voice profiles…</span></div>}
          {!voices&&!loading&&(
            <div style={{textAlign:"center",padding:"40px 0"}}>
              <div style={{fontSize:32,marginBottom:12}}>🎭</div>
              <div style={{fontSize:14,fontWeight:500,marginBottom:6}}>Character voice system</div>
              <div style={{fontSize:12,color:C.muted,maxWidth:420,margin:"0 auto 20px",lineHeight:1.7}}>
                Give every character a completely unique voice. AI will define their speech style, vocabulary, catchphrases, and emotional patterns — so they sound distinct in every language.
              </div>
              <Btn v="pri" onClick={genVoices} sx={{padding:"10px 28px",fontSize:14}}>🎭 Generate voice profiles</Btn>
            </div>
          )}
          {voices?.voices?.length > 0 && (
            <div style={{display:"flex",alignItems:"center",gap:12,padding:"10px 14px",background:C.card,borderRadius:9,border:`0.5px solid ${C.border}`,marginBottom:12}}>
              <span style={{fontSize:11,color:C.muted,flexShrink:0}}>🔊 Volume</span>
              <input type="range" min="0" max="1" step="0.05" value={volume} onChange={e=>changeVolume(parseFloat(e.target.value))} style={{flex:1,accentColor:C.purple,cursor:"pointer"}}/>
              <span style={{fontSize:11,color:C.text,minWidth:36,textAlign:"right"}}>{Math.round(volume*100)}%</span>
            </div>
          )}
          {voices?.voices?.map((v,i)=>{
            const accents=[C.purple,C.pink,C.teal,C.gold,C.blue];
            const acc=accents[i%accents.length];
            return (
              <div key={v.character} style={{marginBottom:12,border:`0.5px solid ${acc}44`,borderRadius:10,overflow:"hidden"}}>
                <div style={{padding:"10px 14px",background:acc+"18",borderBottom:`0.5px solid ${acc}44`,display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,flexWrap:"wrap"}}>
                  <div style={{display:"flex",alignItems:"center",gap:10,minWidth:0}}>
                    <div style={{width:32,height:32,borderRadius:"50%",background:acc,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,color:"#fff",fontWeight:700,flexShrink:0}}>{v.character?.[0]}</div>
                    <div style={{minWidth:0}}>
                      <div style={{fontSize:13,fontWeight:500,color:C.text}}>{v.character}</div>
                      <div style={{fontSize:11,color:C.muted}}>{v.role} · {v.personality_core}</div>
                    </div>
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:7,flexShrink:0}}>
                    {voiceOn && (
                      <select value={voiceOverrides[v.character]||""} onChange={e=>{const id=e.target.value; setVoiceOverrides(prev=>{const next={...prev}; if(id)next[v.character]=id; else delete next[v.character]; return next;});}}
                        title="Choose this character's HD voice"
                        style={{fontSize:11,padding:"4px 8px",borderRadius:7,border:`1px solid ${acc}66`,background:C.surf,color:C.text,cursor:"pointer",fontFamily:"inherit",maxWidth:150}}>
                        <option value="">Auto cast</option>
                        {ELEVEN_VOICE_OPTIONS.map(o=><option key={o.id} value={o.id}>{o.name} ({o.gender}) · {o.desc}</option>)}
                      </select>
                    )}
                    <button onClick={()=>speakVoice(v)} style={{fontSize:11,padding:"5px 12px",borderRadius:7,border:`1px solid ${acc}`,background:speaking===v.character?acc:acc+"18",color:speaking===v.character?"#fff":acc,cursor:"pointer",fontFamily:"inherit",fontWeight:500,display:"flex",alignItems:"center",gap:5}}>
                      {speaking===v.character?"■ Stop":"▶ Listen"}
                      {voiceOn && <span style={{fontSize:8,fontWeight:700,padding:"1px 4px",borderRadius:4,background:speaking===v.character?"rgba(255,255,255,0.25)":acc+"33",letterSpacing:"0.04em"}}>HD</span>}
                    </button>
                    <Tag c={acc}>{v.speech_style}</Tag>
                  </div>
                </div>
                <div style={{padding:14,display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                  <div>
                    <Field label="Vocabulary" value={v.vocabulary} editing={editMode} onChange={val=>editVoiceField(i,"vocabulary",val)}/>
                    <Field label="Speech patterns" value={v.speech_patterns} editing={editMode} onChange={val=>editVoiceField(i,"speech_patterns",val)} multiline/>
                    <Field label="Emotional range" value={v.emotional_range} editing={editMode} onChange={val=>editVoiceField(i,"emotional_range",val)} multiline/>
                  </div>
                  <div>
                    <div style={{marginBottom:8}}>
                      <div style={{fontSize:10,color:C.muted,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:4}}>Catchphrase</div>
                      {editMode
                        ? <input value={v.catchphrase||""} onChange={e=>editVoiceField(i,"catchphrase",e.target.value)} style={{width:"100%",padding:"6px 9px",borderRadius:6,border:`0.5px solid ${C.border2}`,background:C.surf,color:C.text,fontSize:13,fontFamily:"inherit"}}/>
                        : <div style={{fontSize:13,color:acc,fontStyle:"italic",fontWeight:500}}>"{v.catchphrase}"</div>}
                    </div>
                    <Field label="Never says" value={v.never_says} editing={editMode} onChange={val=>editVoiceField(i,"never_says",val)}/>
                    <div>
                      <div style={{fontSize:10,color:C.muted,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:6}}>Example lines</div>
                      {v.example_lines?.map((line,j)=>(
                        editMode
                          ? <input key={j} value={line} onChange={e=>editVoiceLine(i,j,e.target.value)} style={{width:"100%",padding:"5px 10px",borderRadius:6,border:`0.5px solid ${C.border2}`,background:C.surf,color:C.text,fontSize:12,fontFamily:"inherit",marginBottom:4}}/>
                          : <div key={j} style={{fontSize:12,color:C.text,padding:"5px 10px",background:C.card,borderRadius:6,marginBottom:4,borderLeft:`2px solid ${acc}`}}>"{line}"</div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {tab==="translate"&&(
        <div>
          <div style={{marginBottom:18,padding:"14px 16px",background:C.card,borderRadius:10,border:`0.5px solid ${C.border}`}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
              <span style={{fontSize:12,color:C.muted}}>Translate into (pick any number):</span>
              <button onClick={()=>setTransLangs(transLangs.length>=ALL_TRANS.length?[]:ALL_TRANS)} style={{fontSize:10,padding:"4px 11px",borderRadius:7,border:`0.5px solid ${transLangs.length>=ALL_TRANS.length?C.border2:C.purple}`,background:transLangs.length>=ALL_TRANS.length?"transparent":C.purple+"18",color:transLangs.length>=ALL_TRANS.length?C.muted:C.purpleL,cursor:"pointer",fontFamily:"inherit",fontWeight:500,whiteSpace:"nowrap"}}>
                {transLangs.length>=ALL_TRANS.length?"Clear all":`Select all ${ALL_TRANS.length}`}
              </button>
            </div>
            <div style={{maxHeight:190,overflowY:"auto",paddingRight:4,marginBottom:10}}>
              {[{region:"✦ Recommended",langs:RECOMMENDED_LANGS,rec:true},...LANG_GROUPS].map(g=>{
                const opts=g.langs.filter(l=>l!=="English");
                if(!opts.length) return null;
                return (
                  <div key={g.region} style={{marginBottom:9}}>
                    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:5}}>
                      <div style={{fontSize:9,color:g.rec?C.purpleL:C.muted,textTransform:"uppercase",letterSpacing:"0.08em",fontWeight:g.rec?700:400,opacity:g.rec?1:0.8}}>{g.region}</div>
                      {g.rec && <button onClick={()=>setTransLangs(p=>[...new Set([...p,...RECOMMENDED_LANGS])])} style={{fontSize:9,padding:"2px 8px",borderRadius:6,border:`0.5px solid ${C.purple}`,background:C.purple+"18",color:C.purpleL,cursor:"pointer",fontFamily:"inherit"}}>Select these</button>}
                    </div>
                    <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                      {opts.map(l=>{
                        const done=storedLangs.includes(l), sel=transLangs.includes(l);
                        return <button key={l} onClick={()=>togTrans(l)} title={done?"Already translated & saved — will be skipped":""} style={{fontSize:11,padding:"4px 10px",borderRadius:7,border:`0.5px solid ${done?C.teal:sel?C.purple:C.border}`,background:done?C.teal+"1e":sel?C.purple+"22":"transparent",color:done?C.teal:sel?C.purpleL:C.muted,cursor:"pointer",fontFamily:"inherit"}}>{done?"✓ ":""}{l}</button>;
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <span style={{flex:1,fontSize:11,color:C.muted}}>{transLangs.length} selected{transLangs.length>=12?" · this will take a few minutes":""}</span>
              <Btn v="pri" onClick={genTranslate} disabled={transLoading||!script||!transLangs.length} sx={{flexShrink:0,whiteSpace:"nowrap"}}>
                {transLoading?<><Spinner size={13}/>{transProgress||"Translating…"}</>:`🌐 Translate ${transLangs.length||""}`.trim()}
              </Btn>
            </div>
          </div>
          {voices && <div style={{fontSize:11,color:C.teal,marginBottom:12,padding:"7px 12px",background:C.teal+"10",borderRadius:6}}>✓ Voice profiles active — each character keeps a unique voice in every language</div>}
          {!voices && <div style={{fontSize:11,color:C.gold,marginBottom:12,padding:"7px 12px",background:C.gold+"10",borderRadius:6}}>⚡ Tip: Generate voice profiles first for better character-specific translations</div>}
          {transLoading && <div style={{display:"flex",alignItems:"center",gap:10,padding:"20px 0"}}><Spinner/><span style={{color:C.muted,fontSize:13}}>{transProgress||"Translating with character voices…"}</span></div>}
          {translation && (
            <div>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
                <div>
                  <div style={{fontSize:15,fontWeight:500,color:C.text}}>{translation.chapter_title}</div>
                  <div style={{fontSize:12,color:C.muted}}>Translated to {translation.language}</div>
                </div>
                <Btn onClick={()=>{
                  const lines = (translation.panels||[]).map(p=>
                    "--- Panel " + p.number + " ---\n" +
                    (p.dialogue||[]).map(d=>"["+d.character+"]: "+d.translated).join("\n")
                  ).join("\n\n");
                  const blob = new Blob([lines], {type:'text/plain'});
                  const a = document.createElement('a');
                  a.href = URL.createObjectURL(blob);
                  a.download = `${story?.title}_${translation.language}.txt`;
                  a.click();
                }} sx={{fontSize:11}}>⬇ Export .txt</Btn>
              </div>
              {translation.panels?.map((tp,pi)=>{
                const origPanel = script?.panels?.[pi];
                return (
                  <div key={tp.number} style={{marginBottom:10,border:`0.5px solid ${C.border}`,borderRadius:10,overflow:"hidden"}}>
                    <div style={{padding:"7px 12px",background:C.surf,borderBottom:`0.5px solid ${C.border}`,display:"flex",alignItems:"center",gap:8}}>
                      <span style={{fontSize:11,fontWeight:500,color:C.purple}}>Panel {tp.number}</span>
                    </div>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:0}}>
                      <div style={{padding:12,borderRight:`0.5px solid ${C.border}`}}>
                        <div style={{fontSize:10,color:C.muted,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:6}}>Original</div>
                        {origPanel?.dialogue?.map((d,i)=>{
                          const tc={speech:C.purple,thought:C.teal,narration:C.gold,sfx:C.pink};
                          const dc=tc[d.type]||C.muted;
                          return <div key={i} style={{display:"flex",gap:6,marginBottom:5,padding:"4px 8px",borderRadius:5,background:dc+"11",borderLeft:`2px solid ${dc}`}}>
                            <span style={{fontSize:10,color:dc,minWidth:50,flexShrink:0,fontWeight:500}}>{d.character}</span>
                            <span style={{fontSize:11,color:C.text}}>"{d.text||d.translated}"</span>
                          </div>;
                        })}
                      </div>
                      <div style={{padding:12}}>
                        <div style={{fontSize:10,color:C.teal,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:6}}>{translation.language}</div>
                        {tp.dialogue?.map((d,i)=>{
                          const tc={speech:C.purple,thought:C.teal,narration:C.gold,sfx:C.pink};
                          const dc=tc[d.type]||C.muted;
                          return <div key={i} style={{display:"flex",flexDirection:"column",gap:2,marginBottom:6,padding:"5px 8px",borderRadius:5,background:dc+"11",borderLeft:`2px solid ${dc}`}}>
                            <div style={{display:"flex",gap:6,alignItems:"center"}}>
                              <span style={{fontSize:10,color:dc,fontWeight:500}}>{d.character}</span>
                              {d.voice_note&&<span style={{fontSize:9,color:C.muted,fontStyle:"italic"}}>({d.voice_note})</span>}
                            </div>
                            <span style={{fontSize:12,color:C.text}}>"{d.translated}"</span>
                            <span style={{fontSize:10,color:C.muted,fontStyle:"italic"}}>"{d.original}"</span>
                          </div>;
                        })}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {tab==="brain" && (
        <div style={{maxWidth:640,margin:"0 auto"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,flexWrap:"wrap",gap:8}}>
            <div>
              <div style={{fontSize:16,fontWeight:700,fontFamily:"'Cinzel',serif",color:C.text}}>🧠 Story Brain</div>
              <div style={{fontSize:11,color:C.muted}}>{story?.title} · grows with every chapter</div>
            </div>
            <Btn onClick={backfillBible} disabled={bibleBusy||!script?.panels?.length} sx={{fontSize:11}}>{bibleBusy?<><Spinner size={12}/> Reading chapters…</>:"↻ Rebuild from all chapters"}</Btn>
          </div>
          {bibleBusy && !bible ? (
            <div style={{padding:24,background:C.card,border:`0.5px solid ${C.border}`,borderRadius:12,color:C.muted,fontSize:13,textAlign:"center",display:"flex",alignItems:"center",justifyContent:"center",gap:10}}><Spinner size={16}/> Reading this story's chapters and building its brain…</div>
          ) : !bible ? (
            <div style={{padding:24,background:C.card,border:`0.5px dashed ${C.border2}`,borderRadius:12,color:C.muted,fontSize:13,textAlign:"center",lineHeight:1.6}}>
              Your Story Brain reads every chapter you've written — remembering characters, plot threads, and open questions, and suggesting where to take the story next. {script?.panels?.length ? "Click ↻ Rebuild from all chapters to build it now." : "Write a chapter to begin."}
            </div>
          ) : (
            <div style={{display:"flex",flexDirection:"column",gap:14}}>
              {bible.running_recap && <div style={{padding:"12px 14px",background:C.purple+"10",border:`0.5px solid ${C.purple}33`,borderRadius:10}}><div style={{fontSize:10,color:C.purpleL,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:4}}>Where the story stands</div><div style={{fontSize:13,color:C.text,lineHeight:1.6}}>{bible.running_recap}</div></div>}
              {bible.next_directions?.length>0 && <div>
                <div style={{fontSize:10,color:C.muted,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:8}}>Where to take it next</div>
                <div style={{display:"flex",flexDirection:"column",gap:8}}>
                  {bible.next_directions.map((d,i)=>(
                    <div key={i} style={{padding:"10px 12px",background:C.card,border:`0.5px solid ${C.border}`,borderRadius:9,display:"flex",gap:10,alignItems:"center"}}>
                      <div style={{flex:1}}><div style={{fontSize:12.5,fontWeight:600,color:C.text}}>{d.title}</div><div style={{fontSize:11.5,color:C.muted,lineHeight:1.5,marginTop:2}}>{d.pitch}</div></div>
                      {chapterNum===chapterCount && <Btn v="pri" onClick={()=>genChapter(`${d.title}: ${d.pitch}`)} disabled={chapterBusy} sx={{fontSize:11,whiteSpace:"nowrap"}}>✍ Write Ch. {chapterCount+1}</Btn>}
                    </div>
                  ))}
                </div>
              </div>}
              {bible.characters?.length>0 && <Sec title="Characters" accent={C.purple}><div style={{display:"flex",flexDirection:"column",gap:6}}>{bible.characters.map((c,i)=>(<div key={i} style={{padding:"7px 10px",background:C.card,borderRadius:8,border:`0.5px solid ${C.border}`}}><div style={{fontSize:12,fontWeight:600,color:C.text}}>{c.name} <span style={{fontSize:10,color:C.muted,fontWeight:400}}>· {c.role}{c.status?` · ${c.status}`:""}</span></div>{c.notes&&<div style={{fontSize:11,color:C.muted,marginTop:2,lineHeight:1.5}}>{c.notes}</div>}</div>))}</div></Sec>}
              {bible.plot_threads?.length>0 && <Sec title="Plot threads" accent={C.teal}><div style={{display:"flex",flexDirection:"column",gap:5}}>{bible.plot_threads.map((t,i)=>(<div key={i} style={{fontSize:12,color:C.text,display:"flex",gap:8,alignItems:"baseline"}}><span style={{fontSize:9,color:t.status==="resolved"?C.teal:C.gold,textTransform:"uppercase",flexShrink:0,width:58}}>{t.status||"open"}</span><span style={{flex:1,lineHeight:1.5}}>{t.thread}{t.notes?` — ${t.notes}`:""}</span></div>))}</div></Sec>}
              {bible.open_hooks?.length>0 && <Sec title="Open questions" accent={C.gold}><ul style={{margin:0,paddingLeft:18}}>{bible.open_hooks.map((h,i)=><li key={i} style={{fontSize:12,color:C.text,lineHeight:1.6}}>{h}</li>)}</ul></Sec>}
              {bible.world_rules?.length>0 && <Sec title="World rules" accent={C.pink}><ul style={{margin:0,paddingLeft:18}}>{bible.world_rules.map((w,i)=><li key={i} style={{fontSize:12,color:C.text,lineHeight:1.6}}>{w}</li>)}</ul></Sec>}
              {bible.timeline?.length>0 && <Sec title="Timeline" accent={C.muted}><div style={{display:"flex",flexDirection:"column",gap:4}}>{bible.timeline.map((t,i)=><div key={i} style={{fontSize:12,color:C.muted,lineHeight:1.5}}>{t}</div>)}</div></Sec>}
            </div>
          )}
        </div>
      )}

      {tab==="reader" && script?.panels?.length > 0 && (
        <div style={{maxWidth:600,margin:"0 auto"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16,flexWrap:"wrap",gap:8}}>
            <div>
              <div style={{fontSize:15,fontWeight:600,color:C.text}}>{script?.chapter_title || `Chapter ${chapterNum}`}</div>
              <div style={{fontSize:11,color:C.muted}}>{story?.title} · Chapter {chapterNum}{chapterCount>1?` of ${chapterCount}`:""} · {script?.panels?.length || 0} panels</div>
            </div>
            <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
              {(panelsLoading||chapterBusy) && <div style={{display:"flex",alignItems:"center",gap:6,fontSize:12,color:C.muted}}><Spinner size={13}/>{scriptProgress || `Generating… ${panelProgress}%`}</div>}
              {chapterNum===1 && Object.keys(story?.script?.panel_images||{}).length > 0 && <Btn v="soft" onClick={revertToPublished} disabled={panelsLoading} sx={{fontSize:11}}>↺ Revert to published</Btn>}
              <Btn v="soft" onClick={genPanels} disabled={panelsLoading||chapterBusy} sx={{fontSize:11}}>🎨 Regenerate</Btn>
              {chapterCount>1 && <Btn onClick={deleteChapterN} disabled={chapterBusy||panelsLoading} sx={{fontSize:11}}>🗑 Delete Ch. {chapterCount}</Btn>}
              {chapterNum===chapterCount && <Btn v="pri" onClick={genChapter} disabled={chapterBusy||panelsLoading} sx={{fontSize:11}}>＋ New chapter</Btn>}
            </div>
          </div>
          {/* Story Brain recommendations — surfaced here (no separate tab). Only on the latest chapter, where
              the creator decides what's next. "Write Ch. N" seeds the next chapter with the chosen direction. */}
          {chapterNum===chapterCount && bible?.next_directions?.length>0 && (
            <div style={{marginBottom:16,padding:"12px 14px",background:C.purple+"0d",border:`0.5px solid ${C.purple}33`,borderRadius:11}}>
              <div style={{fontSize:10,color:C.purpleL,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:8}}>✦ Story Brain suggests — where to take it next</div>
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                {bible.next_directions.map((d,i)=>(
                  <div key={i} style={{padding:"10px 12px",background:C.card,border:`0.5px solid ${C.border}`,borderRadius:9,display:"flex",gap:10,alignItems:"center"}}>
                    <div style={{flex:1}}><div style={{fontSize:12.5,fontWeight:600,color:C.text}}>{d.title}</div><div style={{fontSize:11.5,color:C.muted,lineHeight:1.5,marginTop:2}}>{d.pitch}</div></div>
                    <Btn v="pri" onClick={()=>genChapter(`${d.title}: ${d.pitch}`)} disabled={chapterBusy||panelsLoading} sx={{fontSize:11,whiteSpace:"nowrap"}}>✍ Write Ch. {chapterCount+1}</Btn>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div style={{display:"flex",flexDirection:"column",gap:0,background:"#e9e9e4",borderRadius:12,overflow:"hidden",border:`0.5px solid ${C.border}`}}>
            {/* CHAPTER INTRO — title splash + credits header before the story begins */}
            <div style={{padding:"46px 24px 30px",textAlign:"center",background:"#e9e9e4",borderBottom:"1px solid #d6d6ce"}}>
              <div style={{fontSize:11,letterSpacing:"0.24em",textTransform:"uppercase",color:"#9a9a90",marginBottom:16}}>{(story?.genre_tags?.[0] || genre || "Prisma")}</div>
              <div style={{fontFamily:"'Cinzel',serif",fontSize:30,fontWeight:700,color:"#1a1a1a",lineHeight:1.15,marginBottom:12}}>{story?.title || "Untitled"}</div>
              <div style={{width:44,height:2,background:"#1a1a1a",opacity:0.45,margin:"0 auto 16px"}}/>
              {/* BONUS non-canon cover art (SBS-style easter egg) */}
              {coverArt?.url && (
                <div style={{margin:"6px auto 18px",maxWidth:360}}>
                  <div style={{border:"3px solid #1a1a1a",borderRadius:2,overflow:"hidden",background:"#fff"}}>
                    <img src={coverArt.url} alt="Bonus cover" style={{width:"100%",display:"block"}}/>
                  </div>
                  {coverArt.caption && <div style={{fontSize:11,color:"#6a6a60",fontStyle:"italic",marginTop:8,lineHeight:1.5,padding:"0 8px"}}>“{coverArt.caption}”</div>}
                  <div style={{fontSize:9,color:"#b0b0a6",letterSpacing:"0.12em",textTransform:"uppercase",marginTop:5}}>Bonus · not part of the story</div>
                </div>
              )}
              <div style={{fontSize:14,color:"#333",fontWeight:600,marginBottom:6}}>{script?.chapter_title || "Chapter 1"}</div>
              <div style={{fontSize:11,color:"#8a8a80",lineHeight:1.6}}>Story by {story?.author_name || user?.username || "Anonymous"}<br/>Art · Prisma AI Studio</div>
            </div>
            {script?.panels?.map((panel) => {
              const img = panelImages[panel.number];
              const dialogue = panel.dialogue || [];
              const nonSfx = dialogue.filter(d=>d.type!=="sfx");
              const speechThought = nonSfx.filter(d=>d.type==="speech"||d.type==="thought");
              const narrLines = nonSfx.filter(d=>d.type==="narration");
              const shots = spreadShots(panel);           // 2-4 sub-scenes → composite spread
              const hasArt = !!img || (shots && shots.some((_,si)=>panelImages[`${panel.number}.${si}`]));
              // Classic manga packs bubbles ONTO the art (no webtoon gutter) — every format except
              // Prisma/Global. Matches the published reader's classic-layout default.
              const classicLayout = style !== "GL-EN" && style !== "PRISMA";
              const big = (isBigPanel(panel) || !!shots || classicLayout) && hasArt; // bubbles ON art only when art exists
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
                  {/* IMAGE — the picture for this beat (or a composite spread of sub-scenes) */}
                  <div style={{position:"relative",background:"#0a0a0a"}}>
                    {(shots && hasArt) ? (
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:3,background:"#111"}}>
                        {shots.map((sc,si)=>{
                          const sImg = panelImages[`${panel.number}.${si}`];
                          const palette = MOOD_PALETTES[getMood(panel.mood)] || MOOD_PALETTES.default;
                          return (
                            <div key={si} style={{position:"relative",background:"#0a0a0a",minHeight:sImg?undefined:150,...spreadCellSpan(shots.length,si)}}>
                              {sImg
                                ? <img src={sImg} alt={`Panel ${panel.number} shot ${si+1}`} style={{width:"100%",height:"100%",objectFit:"cover",display:"block",filter:style==="JP-EN"?"grayscale(1) contrast(1.04)":"none"}}/>
                                : <div style={{position:"absolute",inset:0,background:`radial-gradient(ellipse at 50% 40%, ${palette.accent}55 0%, transparent 65%)`,display:"flex",alignItems:"flex-end",padding:10}}><div style={{fontSize:10,color:"rgba(255,255,255,0.3)",fontStyle:"italic",lineHeight:1.3}}>{sc.slice(0,60)}</div></div>}
                            </div>
                          );
                        })}
                      </div>
                    ) : img ? (
                      <img src={img} alt={`Panel ${panel.number}`} style={{width:"100%",display:"block",imageRendering:"crisp-edges",filter:style==="JP-EN"?"grayscale(1) contrast(1.04)":"none"}}/>
                    ) : (
                      (() => {
                        const moodKey = getMood(panel.mood);
                        const palette = MOOD_PALETTES[moodKey] || MOOD_PALETTES.default;
                        return (
                          <div style={{minHeight:200,width:"100%",position:"relative",overflow:"hidden",background:`linear-gradient(160deg, ${palette.bg} 0%, #111 100%)`,display:"flex",alignItems:"center",justifyContent:"center",padding:"18px"}}>
                            <div style={{position:"absolute",inset:0,background:`radial-gradient(ellipse at 50% 40%, ${palette.accent}55 0%, transparent 65%)`}}/>
                            <div style={{position:"relative",textAlign:"center",maxWidth:"80%"}}>
                              <div style={{fontSize:22,marginBottom:6,opacity:0.5}}>🖼</div>
                              <div style={{fontSize:11,color:"rgba(255,255,255,0.4)",lineHeight:1.4,fontStyle:"italic"}}>{panel.scene?.slice(0,90)}</div>
                              <div style={{fontSize:10,color:C.purpleL,marginTop:8}}>↻ Use Redo to generate this panel</div>
                            </div>
                          </div>
                        );
                      })()
                    )}
                    <div style={{position:"absolute",top:10,left:10,background:"rgba(0,0,0,0.7)",borderRadius:5,padding:"2px 8px",fontSize:10,color:"rgba(255,255,255,0.5)"}}>{panel.number}</div>
                    <button onClick={()=>regenerateOnePanel(panel)} disabled={!!regenPanel} title="Regenerate this panel" style={{position:"absolute",top:8,right:8,zIndex:13,background:"rgba(0,0,0,0.72)",border:`1px solid ${C.purple}66`,borderRadius:6,padding:"3px 9px",fontSize:11,color:regenPanel===panel.number?C.muted:"#fff",cursor:regenPanel?"default":"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",gap:5}}>{regenPanel===panel.number ? <><Spinner size={10}/>Redrawing…</> : "↻ Redo"}</button>
                    {dialogue.filter(d=>d.type==="sfx").map((d,i)=>(
                      <div key={i} style={{position:"absolute",zIndex:11,top:i%2===0?"32%":"64%",left:i%2===0?"58%":"14%",transform:`rotate(${i%2===0?"-6":"4"}deg)`,fontSize:38,fontWeight:400,color:"#fff",fontFamily:"'Bangers','Comic Neue',sans-serif",letterSpacing:"0.04em",textShadow:"3px 3px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000",pointerEvents:"none",userSelect:"none"}}>{d.text}</div>
                    ))}
                    {/* BIG / ACTION PANEL — manga bubbles ON the art (reads left-to-right, top-to-bottom) */}
                    {big && narrLines.map((d,ni)=>(
                      <div key={"n"+ni} style={{position:"absolute",zIndex:12,top:10+ni*58,left:10,maxWidth:"66%"}}>
                        <NarrationBox fs={13} variant={captionVariant}>{d.text}</NarrationBox>
                      </div>
                    ))}
                    {big && onArtBubbles(speechThought, panel.mood, 15)}
                    {(charIntroMap[panel.number]||[]).map((intro,ii)=><CharIntroCard key={"intro"+ii} intro={intro} index={ii} variant={captionVariant}/>)}
                  </div>
                  {/* CONVERSATION — quieter beats: floating bubbles & caption boxes in airy white space (webtoon flow) */}
                  {!big && nonSfx.length>0 && (
                    <div style={{padding:"12px 16px 14px",display:"flex",flexDirection:"column",gap:11,alignItems:"center"}}>
                      {nonSfx.map((d,i)=>{
                        if (d.type==="narration") return (
                          <div key={i} style={{maxWidth:"86%"}}>
                            <NarrationBox fs={14} variant={captionVariant}>{d.text}</NarrationBox>
                          </div>
                        );
                        const isThought = d.type==="thought";
                        if (isThought) return (
                          <div key={i} style={{maxWidth:"78%",width:"fit-content"}}>
                            <ThoughtCloud fs={16}>{d.text}</ThoughtCloud>
                          </div>
                        );
                        return (
                          <div key={i} style={{maxWidth:"82%",width:"fit-content"}}>
                            <div style={{position:"relative",background:"#ffffff",border:"2.5px solid #141414",borderRadius:"22px",padding:"11px 18px",boxShadow:"0 2px 7px rgba(0,0,0,0.18)"}}>
                              <div style={{position:"absolute",top:-10,left:"50%",transform:"translateX(-50%)",width:0,height:0,borderLeft:"8px solid transparent",borderRight:"8px solid transparent",borderBottom:"10px solid #141414"}}/>
                              <div style={{fontFamily:BUBBLE_FONT,textTransform:"uppercase",fontSize:"clamp(14px,3.6vw,17px)",color:"#141414",lineHeight:1.25,fontWeight:700,textAlign:"center"}}>{d.text}</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {script?.chapter_end_hook && (
            <div style={{marginTop:16,padding:"14px 18px",background:C.card,borderRadius:10,borderLeft:`3px solid ${C.pink}`,border:`0.5px solid ${C.border}`}}>
              <div style={{fontSize:10,color:C.pink,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:4}}>End of chapter</div>
              <div style={{fontSize:13,color:C.text,lineHeight:1.65,fontStyle:"italic"}}>{script.chapter_end_hook}</div>
            </div>
          )}
          <div style={{textAlign:"center",marginTop:20,padding:"16px",color:C.muted,fontSize:12}}>
            <div style={{marginBottom:8}}>✦ Chapter complete</div>
            <div style={{display:"flex",gap:8,justifyContent:"center",flexWrap:"wrap"}}>
              <Btn v="soft" onClick={genPanels} disabled={panelsLoading||training}>🎨 Regenerate panels</Btn>
              <Btn v={cb?.lora?"soft":"pri"} onClick={lockCharacter} disabled={training||panelsLoading} sx={{borderColor:cb?.lora?`${C.teal}88`:undefined}}>
                {training ? <><Spinner size={11}/> Training…</> : cb?.lora ? "🔒 Character locked ✓" : "🔒 Lock character (best consistency)"}
              </Btn>
              <Btn v="soft" onClick={generateEasterEgg} disabled={coverLoading||panelsLoading}>
                {coverLoading ? <><Spinner size={11}/> Drawing…</> : coverArt ? "🎁 New cover gag" : "🎁 Add cover easter egg"}
              </Btn>
              {TRANSLATION_ENABLED && <Btn v="pri" onClick={()=>setTab("translate")}>🌐 Translate →</Btn>}
            </div>
            {training && trainStatus && <div style={{marginTop:10,fontSize:11,color:C.teal}}>{trainStatus}</div>}
            {!training && (
              <div style={{marginTop:10,fontSize:11,color:C.muted,maxWidth:420,margin:"10px auto 0",lineHeight:1.5}}>
                {cb?.lora
                  ? "This character is locked — regenerate panels for a consistent look across the chapter."
                  : "Lock the character to train a one-time model so the protagonist looks identical in every panel (takes a few minutes)."}
              </div>
            )}
          </div>
        </div>
      )}

      {(tab==="gp" || (panelsLoading && tab !== "reader")) && (
        <div style={{textAlign:"center",padding:"40px 20px"}}>
          <div style={{fontSize:32,marginBottom:12,animation:"pulse 2s ease-in-out infinite"}}>🎨</div>
          <div style={{fontSize:15,fontWeight:500,marginBottom:6}}>Drawing your manga…</div>
          <div style={{fontSize:12,color:C.muted,marginBottom:20}}>Generating panel {Math.ceil(panelProgress / (100 / (script?.panels?.length||4)))} of {script?.panels?.length||4}</div>
          <div style={{height:6,background:C.border,borderRadius:99,maxWidth:400,margin:"0 auto",overflow:"hidden"}}>
            <div style={{height:"100%",background:`linear-gradient(90deg,${C.purple},${C.pink})`,borderRadius:99,width:`${panelProgress}%`,transition:"width .5s ease"}}/>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:8,maxWidth:400,margin:"20px auto 0"}}>
            {script?.panels?.slice(0,4).map(p=>(
              <div key={p.number} style={{aspectRatio:"2/3",borderRadius:8,overflow:"hidden",border:`0.5px solid ${C.border}`,background:"#0a0a0a",display:"flex",alignItems:"center",justifyContent:"center"}}>
                {panelImages[p.number] ? (
                  <img src={panelImages[p.number]} style={{width:"100%",height:"100%",objectFit:"cover"}} alt=""/>
                ) : (
                  <div style={{fontSize:20,opacity:0.3}}>🖼</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default Studio;





