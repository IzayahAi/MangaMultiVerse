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
export const SEED_LIB = [
  {id:"s1",emoji:"⚔️",title:"Crimson Chronicle",author:"Han Seojun",origin:"KR",genre_tags:["Dark fantasy","Action"],chapters:5,rating:4.8,views:"2.4M",langs:38,status:"ongoing",cover_color:"#3d0d2e"},
  {id:"s2",emoji:"🌸",title:"Sakura Protocol",author:"Tanaka Ren",origin:"JP",genre_tags:["Sci-fi","Romance"],chapters:5,rating:4.9,views:"5.1M",langs:51,status:"ongoing",cover_color:"#0a2a1a"},
  {id:"s3",emoji:"🔮",title:"Void Monarch",author:"Kim Daehyun",origin:"KR",genre_tags:["Fantasy","Action"],chapters:5,rating:4.6,views:"980K",langs:22,status:"ongoing",cover_color:"#1a0d3e"},
  {id:"s4",emoji:"🐉",title:"Dragon Empire",author:"Liu Wei",origin:"CN",genre_tags:["Historical","Epic"],chapters:5,rating:4.5,views:"8.2M",langs:61,status:"completed",cover_color:"#0a2a0a"},
  {id:"s5",emoji:"🏙️",title:"Neon Solitude",author:"Maria O.",origin:"GL",genre_tags:["Sci-fi","Drama"],chapters:5,rating:4.7,views:"340K",langs:17,status:"ongoing",cover_color:"#0a0a2e"},
  {id:"s6",emoji:"⚡",title:"Storm Ascension",author:"Park Ji-Ho",origin:"KR",genre_tags:["Action","Sports"],chapters:5,rating:4.7,views:"3.3M",langs:44,status:"ongoing",cover_color:"#2a1e00"},
];

export const GENRES  = ["All","Action","Fantasy","Romance","Sci-fi","Drama","Mystery","Historical","Sports","Thriller"];
export const ORIGINS = ["All","JP","KR","CN","GL"];
export const LANGS   = ["English","Korean","Japanese","Spanish","French","Arabic","Portuguese","German","Hindi","Chinese"];
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
  "JP-KR":  "Japanese manga style with Korean dialogue",
  "JP-ES":  "Japanese manga style with Spanish dialogue",
  "JP-FR":  "Japanese manga style with French dialogue",
  "GL-EN":  "Original global style mixing Eastern and Western influences with English dialogue",
  "PRISMA": "Prisma — the MangaMultiVerse house format: full-colour, cinematic vertical-scroll storytelling that fuses manhwa polish, expressive manga faces, and bold comic composition, told through a continuous inner-voice caption thread; English-first and born translatable",
};

