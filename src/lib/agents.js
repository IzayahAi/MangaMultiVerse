// ─────────────────────────────────────────────────────────────────────────────
// The agent registry — single source of truth for MangaMultiVerse's "factory".
//
// THE LINE is the production pipeline: a raw idea enters and finished manga comes
// out. Each station runs IN-LINE inside Studio (the connected flow), and where
// `standalone` is true it ALSO runs as a bench tool on the AI Agents page.
//
// THE CONTROL ROOM agents supervise the line — they are not a step in it. They
// live on the Dashboard.
//
// Add or reorder an agent HERE and the bench, the factory map, and (over time)
// the dashboard all follow. Don't hardcode agent lists in components.
// ─────────────────────────────────────────────────────────────────────────────

// The 5-station production line, in pipeline order.
export const LINE = [
  { id: "prompts", order: 1, stage: "Ideation",     name: "Prompt Agent", icon: "✦",  blurb: "Generate original story seeds with hooks and tags.",            inStudio: true, standalone: true },
  { id: "story",   order: 2, stage: "Story",        name: "Story Agent",  icon: "📖", blurb: "Build a full concept — cast, world, and arc — from one idea.",  inStudio: true, standalone: true },
  { id: "script",  order: 3, stage: "Script",       name: "Script Agent", icon: "📝", blurb: "Turn a story into a paneled Chapter 1 script.",                 inStudio: true, standalone: true },
  { id: "voice",   order: 4, stage: "Cast & Voice", name: "Voice Agent",  icon: "🎭", blurb: "Build a character's voice profile and sample dialogue.",         inStudio: true, standalone: true },
  { id: "panels",  order: 5, stage: "Art",          name: "Panel Agent",  icon: "🎨", blurb: "Generate manga panel art from a scene description.",             inStudio: true, standalone: true },
];

// The brains that oversee the line. `dashTab` is their tab id in the AdminDashboard.
export const CONTROL_ROOM = [
  { id: "mrk",    name: "Mr. K",        icon: "🎩", role: "Chief of Staff", blurb: "Strategic thinking partner — tracks the critical path and weekly synthesis.", dashTab: "mrk" },
  { id: "brains", name: "Story Brains", icon: "🧠", role: "Continuity",     blurb: "Per-series bible — keeps a story coherent across chapters.",                 dashTab: "brains" },
  { id: "ops",    name: "Ops Brain",    icon: "◈",  role: "Platform",       blurb: "Platform-level operations brain.",                                           dashTab: "ops" },
  { id: "erragent", name: "Error Agent", icon: "🩺", role: "Reliability",    blurb: "Reads the error log, clusters failures, and triages what's breaking and why.", dashTab: "erragent" },
];

export const AGENTS = [...LINE, ...CONTROL_ROOM];

// A station's surface label, e.g. "Studio + bench" or "Studio only".
export const surfaceLabel = (s) =>
  s.standalone ? (s.inStudio ? "Studio + bench" : "Bench only") : (s.inStudio ? "Studio only" : "—");

export const getAgent = (id) => AGENTS.find((a) => a.id === id);
