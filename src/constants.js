// ═══════════════════════════════════════════════════════════════
// DESIGN TOKENS
// ═══════════════════════════════════════════════════════════════
// C is the static light theme — components should use useTheme() from ThemeContext for reactivity
export const C = {
  bg:"#e8f4fd", surf:"#ffffff", card:"#f5faff", border:"#bde0f5", border2:"#93c9eb",
  purple:"#0ea5e9", purpleL:"#38bdf8", pink:"#06b6d4", gold:"#0284c7",
  teal:"#0891b2", blue:"#0369a1", text:"#0c1a2e", muted:"#4a7a9b", dim:"#dbeafe",
  isDark: false,
};

// ═══════════════════════════════════════════════════════════════
// STATIC DATA
// ═══════════════════════════════════════════════════════════════
// Example/demo manga removed — the platform surfaces only real creator-published stories now.
export const SEED_LIB = [];

export const GENRES  = ["All","Action","Fantasy","Romance","Sci-fi","Drama","Mystery","Historical","Sports","Thriller"];
export const ORIGINS = ["All","JP","KR","CN","GL"];
// Global language menu, grouped by region. Any of these can be translated to on demand (the reader
// translates the chapter live via P_TRANSLATE). LANGS is derived flat for simple consumers.
export const LANG_GROUPS = [
  { region: "Global",                      langs: ["English"] },
  { region: "East Asia",                   langs: ["Korean","Japanese","Chinese (Simplified)","Chinese (Traditional)","Cantonese","Mongolian"] },
  { region: "South Asia",                  langs: ["Hindi","Bengali","Urdu","Punjabi","Tamil","Telugu","Marathi","Gujarati","Kannada","Malayalam","Nepali","Sinhala"] },
  { region: "Southeast Asia",              langs: ["Indonesian","Malay","Thai","Vietnamese","Filipino (Tagalog)","Burmese","Khmer","Lao"] },
  { region: "Middle East & Central Asia",  langs: ["Arabic","Persian (Farsi)","Turkish","Hebrew","Kurdish","Pashto","Uzbek","Kazakh","Azerbaijani"] },
  { region: "Europe",                      langs: ["Spanish","Portuguese","French","German","Italian","Dutch","Polish","Ukrainian","Russian","Romanian","Greek","Czech","Hungarian","Swedish","Norwegian","Danish","Finnish","Bulgarian","Serbian","Croatian","Slovak","Catalan","Irish"] },
  { region: "Africa",                      langs: ["Swahili","Amharic","Hausa","Yoruba","Igbo","Zulu","Afrikaans","Somali","Oromo"] },
  { region: "Americas",                    langs: ["Brazilian Portuguese","Latin American Spanish","Haitian Creole","Quechua"] },
];
export const LANGS = LANG_GROUPS.flatMap(g => g.langs);
// The highest-reach languages for a global manga/webtoon audience — surfaced at the top of the
// translation pickers as "Recommended" so creators pre-generate the ones that matter most.
export const RECOMMENDED_LANGS = ["Spanish","Portuguese","French","Indonesian","Chinese (Simplified)","Japanese","Korean","German","Russian","Arabic"];

// Launch gate (client mirror of the server's RELEASE_MODE). OFF (default) = demo/beta: keys are
// server-side but auth/credit enforcement is relaxed. ON = release: guests can't trigger live AI.
export const RELEASE_MODE = ((typeof import.meta !== "undefined" && import.meta.env?.VITE_RELEASE_MODE) ?? "false") === "true";
// Cap languages pre-translated in one publish (mirror of api/_pricing.js LIMITS).
export const MAX_LANGS_PER_PUBLISH = 12;
// Credit grant for new signups while in demo/beta — generous to seed content. Mirror of api/_pricing.js.
export const DEMO_CREDITS = 500;
// Multi-language translation is OFF in demo (English only) to save tokens; it turns on at launch.
export const TRANSLATION_ENABLED = RELEASE_MODE;
// Demo caps (unlimited at launch): up to DEMO_MAX_STORIES separate manga, each up to DEMO_MAX_CHAPTERS
// chapters. Depth over breadth — fewer stories, more chapters each.
export const DEMO_MAX_STORIES = 2;
export const DEMO_MAX_CHAPTERS = 3;

// Pricing display (client mirror of api/_pricing.js PLANS/PACKS — display only, no Stripe IDs/secrets).
// `id` is what the client sends to /api/stripe-checkout; the server maps it to the real Stripe price.
export const PLAN_TIERS = [
  { id: "free",       name: "Free",       priceUsd: 0,   credits: 0,    perks: ["Read & follow every series", "Free forever — just sign in", "Supported by short ads", "Upgrade to a paid plan to create"] },
  { id: "pro",        name: "Pro",        priceUsd: 25,  credits: 2000,  perks: ["2,000 credits / month", "Unlimited stories & chapters", "Translation (12 languages)", "Character voices", "Ad-free reading"] },
  { id: "studio",     name: "Studio",     priceUsd: 50,  credits: 5000,  perks: ["5,000 credits / month", "Everything in Pro", "LoRA character training", "Priority generation"], highlight: true },
  { id: "studio_pro", name: "Studio Pro", priceUsd: 100, credits: 12000, perks: ["12,000 credits / month", "Full access — every feature", "Best for full-time creators", "Top up anytime for more"] },
];
export const TOPUP_PACKS = [
  { id: "small",  name: "300 credits",    credits: 300,   priceUsd: 5 },
  { id: "medium", name: "1,000 credits",  credits: 1000,  priceUsd: 15 },
  { id: "large",  name: "3,000 credits",  credits: 3000,  priceUsd: 40 },
  { id: "xl",     name: "10,000 credits", credits: 10000, priceUsd: 120 },
];

// Per-plan feature flags (client mirror of api/_pricing.js PLANS[].features). `maxStories: null` = unlimited.
// `adFree` = no interstitial ads while reading (paid perk).
export const PLAN_FEATURES = {
  free:       { translate: false, voice: false, maxLangs: 1,  lora: false, maxStories: 0,    adFree: false, fullAccess: false },
  pro:        { translate: true,  voice: true,  maxLangs: 12, lora: false, maxStories: null, adFree: true,  fullAccess: false },
  studio:     { translate: true,  voice: true,  maxLangs: 12, lora: true,  maxStories: null, adFree: true,  fullAccess: false },
  studio_pro: { translate: true,  voice: true,  maxLangs: 12, lora: true,  maxStories: null, adFree: true,  fullAccess: true  },
};

// Effective features for a user RIGHT NOW. In demo (gate off) everything premium is off + the demo story
// cap applies — unchanged current behavior (and no ads in demo). At launch, features come from the plan.
export function featuresFor(user) {
  if (!RELEASE_MODE) return { translate: TRANSLATION_ENABLED, voice: false, maxLangs: 1, lora: false, maxStories: DEMO_MAX_STORIES, adFree: true, fullAccess: false };
  return PLAN_FEATURES[user?.plan || "free"] || PLAN_FEATURES.free;
}

// Ad gate: show a short interstitial every AD_EVERY_CHAPTERS chapter-opens for non-paying viewers (paid =
// ad-free). AD_SECONDS is how long before "Continue" unlocks. Ads run only at launch (RELEASE_MODE).
export const AD_EVERY_CHAPTERS = 6;
export const AD_SECONDS = 15;
export const SEEDS   = [
  // Murim / martial arts
  "A crippled martial artist gains the memories of the murim world's greatest killer",
  "The murim's weakest sect disciple secretly masters a forbidden demonic art",
  "A modern assassin wakes in the body of a disgraced young master of a fallen clan",
  // Reincarnated-as-object
  "A legendary swordsman is reborn as a sentient sword waiting for a worthy wielder",
  "Reincarnated as a magic vending machine in a monster-infested dungeon",
  "A fallen empress is reborn as the villainess in the novel she once read",
  // Isekai / transported hero
  "Summoned as a hero, ranked useless, and cast out — so he trains the demons instead",
  "An office worker is transported to another world with only a spreadsheet skill",
  "Five heroes are summoned; the sixth arrived a thousand years early and rules now",
  // Cultivation / regression / system
  "A cultivator dies at the peak and regresses to his weakest, most bullied year",
  "The world becomes a game overnight — and only he can see everyone's stats",
  "A disgraced knight whose sword is haunted by the souls of everyone it has killed",
  // Horror
  "Every night the apartment gains one more door that was never there before",
  "A town where everyone's reflection has started moving a half-second too late",
  "She inherited grandmother's house — and the family that still 'lives' in the walls",
  // Ecchi romcom
  "Forced to share one dorm room, a cold honor student and a reckless delinquent keep a secret truce",
  "He signed a fake-dating contract with the school idol to escape their meddling families",
  "A gruff swordsmith and the goddess who won't stop 'helping' at the worst moments",
];
export const EMOJIS  = ["⚔️","🌸","🔮","🐉","🏙️","🌙","⚡","🌊","🔥","🌺","👁️","🗡️"];
export const COVERS  = ["#3d0d2e","#1a0d3e","#0a2a1a","#2a1e00","#002040","#2a0a1a"];

export const rndEmoji = () => EMOJIS[Math.floor(Math.random()*EMOJIS.length)];
export const rndCover = () => COVERS[Math.floor(Math.random()*COVERS.length)];

export const MOOD_PALETTES = {
  dramatic: {bg:"#6b21a8",accent:"#e879f9"},
  action:   {bg:"#92400e",accent:"#fbbf24"},
  romance:  {bg:"#9d174d",accent:"#f9a8d4"},
  mystery:  {bg:"#1e3a5f",accent:"#7dd3fc"},
  horror:   {bg:"#7f1d1d",accent:"#fca5a5"},
  default:  {bg:"#3730a3",accent:"#a5b4fc"},
};

export const getMood = (text="") => {
  const t = text.toLowerCase();
  if (t.match(/fight|battle|slash|attack|power|explosion|blood|clash|charge|strike|combat|sword|blade|weapon/)) return "action";
  if (t.match(/love|kiss|blush|heart|tender|embrace|romance|gentle|soft|warm/)) return "romance";
  if (t.match(/dark|shadow|mystery|secret|whisper|hidden|fog|mist|dusk|night|silent|silence|still/)) return "mystery";
  if (t.match(/horror|monster|fear|scream|terror|ghost|demon|haunt|curse|dread/)) return "horror";
  if (t.match(/dramatic|reveal|shock|gasp|climax|confront|tense|betrayal|truth/)) return "dramatic";
  return "default";
};

export const STATUS_COLOR = {ongoing:C.teal, completed:C.blue, hiatus:C.gold, published:C.teal};
export const STATUS_DOT   = {ongoing:"🟢", completed:"🔵", hiatus:"🟡", published:"🟢"};

export const STYLE_GUIDE = {
  "JP-EN":  "Japanese manga style (black & white panels, speed lines, expressive faces) with English dialogue",
  "KR-EN":  "Korean manhwa style (full colour vertical scroll, cinematic panels) with English dialogue",
  "CN-EN":  "Chinese manhua style (rich colour, historical or fantasy setting) with English dialogue",
  "US-EN":  "American comics style (bold outlines, dynamic poses, speech bubbles) with English dialogue",
  "GL-EN":  "Original global style mixing Eastern and Western influences with English dialogue",
  "PRISMA": "Prisma — the MangaMultiVerse house format: full-colour, cinematic vertical-scroll storytelling that fuses manhwa polish, expressive manga faces, and bold comic composition, told through a continuous inner-voice caption thread; English-first and born translatable",
};

// Every format authors in ENGLISH (the base language) and the reader translates on demand for readers
// whose language isn't English — so an English-native reader always sees the original with no
// translation step. Kept as a map so a format could opt into native authoring again later.
export const STYLE_NATIVE = {
  "JP-EN": "English", "KR-EN": "English", "CN-EN": "English", "US-EN": "English",
  "GL-EN": "English", "PRISMA": "English",
};

