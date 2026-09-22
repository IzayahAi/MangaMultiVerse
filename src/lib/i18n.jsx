// ── Website UI localization (i18n) ─────────────────────────────────────────────
// HYBRID model: curated dictionaries for launch languages (top quality) + AI auto-translation
// (via the same Claude engine) as the fallback for EVERY other language, cached per device so it's
// instant after the first switch. This is what lets the whole site read in the visitor's language
// and scales toward "300 languages" — new languages need no code, just a one-time AI translate.
//
// Adding UI strings: add the English key here in EN, then use t("key") in a component. Curated
// launch languages should mirror the same keys; anything missing falls back to English then AI.
import { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from "react";
import { askClaude } from "./claude.js";
import { RELEASE_MODE } from "../constants.js";

// English is the SOURCE OF TRUTH. Every localizable string lives here keyed by a dotted id.
export const EN = {
  // Top navigation
  "nav.home": "Discover",
  "nav.library": "Library",
  "nav.studio": "✦ AI Studio",
  "nav.creator": "Creator",
  "nav.agents": "⚙ Agents",
  // Account / header
  "auth.signIn": "Sign in",
  "auth.signOut": "Sign out",
  "auth.signInRegister": "Sign in / Register",
  "auth.browseLibrary": "Browse library",
  "theme.toLight": "Switch to light",
  "theme.toDark": "Switch to dark",
  "lang.label": "Language",
  "lang.translating": "Translating…",
  // Home
  "home.welcomeSub": "Track your reading, discover new series, and create manga with AI. Sign in to get your personal dashboard.",
  "home.trending": "🔥 Trending",
  "home.signInTrack": "Sign in to track your reading progress",
  "home.signInStats": "Sign in to see your reading statistics",
  "home.viewDashboard": "View dashboard",
  "home.creatorSub": "Create manga from a single sentence. Panels, scripts, translations — all AI-powered.",
  "home.platformStats": "Platform stats",
  // Library
  "library.searchPlaceholder": "Search series or author…",
  "library.back": "← Library",
};

// Curated launch-language dictionaries (highest quality, instant). Missing keys fall back to
// English, then to the AI translation. Keep keys in sync with EN as the app grows.
const CURATED = {
  Japanese: {
    "nav.home": "見つける",
    "nav.library": "ライブラリ",
    "nav.studio": "✦ AIスタジオ",
    "nav.creator": "クリエイター",
    "nav.agents": "⚙ エージェント",
    "auth.signIn": "ログイン",
    "auth.signOut": "ログアウト",
    "auth.signInRegister": "ログイン / 新規登録",
    "auth.browseLibrary": "ライブラリを見る",
    "theme.toLight": "ライトモードに切替",
    "theme.toDark": "ダークモードに切替",
    "lang.label": "言語",
    "lang.translating": "翻訳中…",
    "home.welcomeSub": "読書の記録、新作の発見、AIでのマンガ制作。ログインして自分専用のダッシュボードを。",
    "home.trending": "🔥 人気",
    "home.signInTrack": "ログインして読書の進捗を記録",
    "home.signInStats": "ログインして読書の統計を表示",
    "home.viewDashboard": "ダッシュボードを見る",
    "home.creatorSub": "一文からマンガを制作。コマ・脚本・翻訳、すべてAIが対応。",
    "home.platformStats": "プラットフォーム統計",
    "library.searchPlaceholder": "作品名または作者で検索…",
    "library.back": "← ライブラリ",
  },
  Spanish: {
    "nav.home": "Descubrir",
    "nav.library": "Biblioteca",
    "nav.studio": "✦ Estudio IA",
    "nav.creator": "Creador",
    "nav.agents": "⚙ Agentes",
    "auth.signIn": "Iniciar sesión",
    "auth.signOut": "Cerrar sesión",
    "auth.signInRegister": "Iniciar sesión / Registrarse",
    "auth.browseLibrary": "Explorar biblioteca",
    "theme.toLight": "Cambiar a claro",
    "theme.toDark": "Cambiar a oscuro",
    "lang.label": "Idioma",
    "lang.translating": "Traduciendo…",
    "home.welcomeSub": "Sigue tus lecturas, descubre nuevas series y crea manga con IA. Inicia sesión para tu panel personal.",
    "home.trending": "🔥 Tendencias",
    "home.signInTrack": "Inicia sesión para seguir tu progreso de lectura",
    "home.signInStats": "Inicia sesión para ver tus estadísticas de lectura",
    "home.viewDashboard": "Ver panel",
    "home.creatorSub": "Crea manga desde una sola frase. Viñetas, guiones, traducciones — todo con IA.",
    "home.platformStats": "Estadísticas de la plataforma",
    "library.searchPlaceholder": "Buscar serie o autor…",
    "library.back": "← Biblioteca",
  },
};

// Browser language code → our UI language NAME (must match the names used in the picker/LANG_GROUPS).
const CODE_TO_LANG = {
  ja: "Japanese", es: "Spanish", fr: "French", de: "German", pt: "Portuguese", it: "Italian",
  ko: "Korean", zh: "Chinese", ru: "Russian", ar: "Arabic", hi: "Hindi", bn: "Bengali",
  id: "Indonesian", vi: "Vietnamese", th: "Thai", tr: "Turkish", nl: "Dutch", pl: "Polish",
  uk: "Ukrainian", fa: "Persian", ta: "Tamil", te: "Telugu", ur: "Urdu", tl: "Filipino",
  ms: "Malay", sw: "Swahili", he: "Hebrew", el: "Greek", sv: "Swedish", ro: "Romanian",
};

function detectLang() {
  try {
    const saved = localStorage.getItem("mv_ui_lang");
    if (saved) return saved;
    const code = (navigator.language || "en").slice(0, 2).toLowerCase();
    return CODE_TO_LANG[code] || "English";
  } catch { return "English"; }
}

// Prompt: translate the whole UI string set at once. Short labels; keep keys and any emoji.
const P_UI_TRANSLATE = (en, lang) =>
  `Translate this website's UI strings into ${lang}. They are short interface labels, buttons, and one-line prompts for a manga reading & creation website. Respond ONLY with valid JSON — no markdown.
Rules:
- Return {"translations": { ...the SAME keys... }} with every value translated naturally and CONCISELY into ${lang} (labels must stay short enough to fit a button/tab).
- Keep any leading emoji or symbols (✦, ⚙, 🔥, ←, …) exactly where they are.
- Do NOT translate the brand name "MangaMultiVerse".
- Natural, idiomatic ${lang} — not word-for-word.

Strings:
${JSON.stringify(en)}`;

const I18nCtx = createContext({ lang: "English", setLang: () => {}, t: (k, f) => f ?? EN[k] ?? k, translating: false });

export function I18nProvider({ children }) {
  const [lang, setLangState] = useState(detectLang);
  const [aiDict, setAiDict] = useState({});      // { [language]: { key: translated } }
  const [translating, setTranslating] = useState(false);
  const inflight = useRef({});

  const setLang = useCallback((l) => {
    setLangState(l || "English");
    try { localStorage.setItem("mv_ui_lang", l || "English"); } catch {}
  }, []);

  // Fetch/translate the string set for non-English, non-curated languages (cached per device).
  useEffect(() => {
    if (!RELEASE_MODE) return; // demo: English-only UI — never spend tokens auto-translating the whole interface (the header language dropdown is also RELEASE_MODE-gated). Manga translation is separate (TRANSLATION_ENABLED).
    if (lang === "English" || CURATED[lang] || aiDict[lang]) return;
    try {
      const cached = JSON.parse(localStorage.getItem(`mv_ui_i18n_${lang}`) || "null");
      if (cached && typeof cached === "object") { setAiDict(d => ({ ...d, [lang]: cached })); return; }
    } catch {}
    if (inflight.current[lang]) return;
    inflight.current[lang] = true;
    setTranslating(true);
    (async () => {
      try {
        const r = await askClaude(P_UI_TRANSLATE(EN, lang), () => {});
        const dict = r?.translations && typeof r.translations === "object" ? r.translations : (r && typeof r === "object" ? r : null);
        if (dict) {
          setAiDict(d => ({ ...d, [lang]: dict }));
          try { localStorage.setItem(`mv_ui_i18n_${lang}`, JSON.stringify(dict)); } catch {}
        }
      } catch {}
      finally { inflight.current[lang] = false; setTranslating(false); }
    })();
  }, [lang, aiDict]);

  // Curated wins, then AI cache, then the English base — so the UI is always fully populated.
  const active = useMemo(
    () => ((!RELEASE_MODE || lang === "English") ? EN : { ...EN, ...(aiDict[lang] || {}), ...(CURATED[lang] || {}) }),
    [lang, aiDict]
  );
  const t = useCallback((key, fallback) => active[key] ?? EN[key] ?? fallback ?? key, [active]);

  const value = useMemo(() => ({ lang, setLang, t, translating }), [lang, setLang, t, translating]);
  return <I18nCtx.Provider value={value}>{children}</I18nCtx.Provider>;
}

export const useI18n = () => useContext(I18nCtx);
