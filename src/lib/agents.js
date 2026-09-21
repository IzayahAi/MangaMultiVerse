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

// The Maintenance wing — agents that keep the app/website healthy. Planned roadmap
// (see MAINTENANCE_AGENTS.md); they build on the Phase 0 runner (api/maintenance.js).
// `wave` = P0/P1/P2 build priority; `status` = planned | building | live.
export const MAINTENANCE = [
  { id: "spend",     name: "Spend Sentinel",           icon: "💸", wave: "P0", status: "live",    blurb: "Per-provider AI spend + Fal 429 rate vs. budget; alerts on runaway burn." },
  { id: "deploy",    name: "Deploy Sentinel",          icon: "🚀", wave: "P0", status: "live",    blurb: "After each push, verify the deploy boots + every proxy + Supabase respond." },
  { id: "tamper",    name: "Credit-Tamper Watch",      icon: "🔓", wave: "P0", status: "live",    blurb: "Detect the client-set-grant tamper hole + demo-cap evasion." },
  { id: "seo",       name: "SEO & Metadata Agent",     icon: "🔍", wave: "P0", status: "planned", blurb: "Audit + generate per-story OG/meta (the SPA ships zero OG tags)." },
  { id: "sitemap",   name: "Sitemap & Discovery",      icon: "🗺️", wave: "P0", status: "planned", blurb: "Emit sitemap.xml / robots.txt / llms.txt so crawlers find the catalog." },
  { id: "uptime",    name: "Uptime Monitor",           icon: "📡", wave: "P1", status: "planned", blurb: "Continuous liveness of prod + proxies + Supabase + synthesis freshness." },
  { id: "links",     name: "Broken-Link Checker",      icon: "🩹", wave: "P1", status: "planned", blurb: "Dead covers, missing chapters, orphaned Storage refs." },
  { id: "catalog",   name: "Catalog Health Scanner",   icon: "📚", wave: "P1", status: "planned", blurb: "Score published stories (stubs, generic titles, thin taglines)." },
  { id: "integrity", name: "Data-Integrity Checker",   icon: "🧬", wave: "P1", status: "planned", blurb: "Orphaned/inconsistent rows that silently burn regen credits." },
  { id: "posture",   name: "Security Posture Auditor", icon: "🛡️", wave: "P1", status: "planned", blurb: "RLS on for every table + no secret leaks in the bundle." },
  { id: "deps",      name: "Dependency & Backup",      icon: "📦", wave: "P2", status: "planned", blurb: "npm audit triaged by Claude + a restorable Supabase backup exists." },
  { id: "a11y",      name: "Accessibility & Alt-Text", icon: "♿", wave: "P2", status: "planned", blurb: "a11y audit + vision-generated alt-text for covers/panels." },
];

export const AGENTS = [...LINE, ...CONTROL_ROOM];

// A station's surface label, e.g. "Studio + bench" or "Studio only".
export const surfaceLabel = (s) =>
  s.standalone ? (s.inStudio ? "Studio + bench" : "Bench only") : (s.inStudio ? "Studio only" : "—");

export const getAgent = (id) => AGENTS.find((a) => a.id === id);
