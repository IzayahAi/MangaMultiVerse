# MangaMultiVerse — Restructure Brief
**Prepared by:** Izayah Fisher (via Claude Code)
**Date:** 2026-06-29
**Status:** Draft for review

---

## The Question

Should we scrap MangaMultiVerse and start over, or build on what exists?

**Recommendation: Build on it — but restructure the codebase first, before adding any features.**

---

## What's Working (Keep It)

The following is real, deployed, and functional:

- 4-step AI story agent (AGENT_STEP1–4) — title, characters, world, arc
- Supabase auth with local cache fallback
- Panel reader — scroll mode (manhwa) and page-flip mode
- Speech bubble overlay system
- Library with filters, series detail pages
- Vercel deploy pipeline
- Together AI image generation (unreliable on free tier, but wired up)
- Chapter script generation (P_SCRIPT) — 12-panel scripts with mood/dialogue

None of this should be rewritten. It took significant work to get here.

---

## The Problem

`src/App.jsx` is **3,005 lines** — a single file containing the entire frontend:
design tokens, API clients, AI prompts, UI components, routing, and state.

This isn't a style issue. It's a structural one:

- **Every edit risks breaking unrelated features.** There's no isolation.
- **Finding anything takes grep.** No file-level mental model possible.
- **Collaboration is blocked.** Two people cannot work in the same file simultaneously.
- **Growth will compound the problem.** Every new feature (Creator Portal, image gen, more AI tools) adds hundreds more lines.

The bugs on the Priority 1 list (bubble text, panel coherence, text below panels) are fixable now, but fixing them in a 3000-line file with no separation is harder and riskier than it needs to be.

---

## What the Restructure Does

Split `App.jsx` into purpose-built files. **No new features. No logic changes. Same behavior.**

| New File | What Goes In | Lines (est.) |
|---|---|---|
| `src/constants.js` | Design tokens (C), static data (SEEDS, GENRES, etc.) | ~80 |
| `src/lib/supabase.js` | Supabase client, auth functions, useDB hook | ~100 |
| `src/lib/claude.js` | askClaude(), CLAUDE_SYSTEM, all P_* prompts, AGENT_STEP1–4 | ~200 |
| `src/components/UI.jsx` | Tag, Btn, Field, Sec, Spinner, Toast, CoverCard | ~100 |
| `src/components/AuthModal.jsx` | Auth modal component | ~60 |
| `src/components/PublishModal.jsx` | Publish modal component | ~60 |
| `src/components/Studio.jsx` | AI Studio (4-step agent UI) | ~900 |
| `src/components/CreatorDashboard.jsx` | Creator Portal dashboard | ~400 |
| `src/components/MangaReader.jsx` | Reader + buildPanels() + MOOD_PALETTES | ~500 |
| `src/App.jsx` (slimmed) | Root component, routing, nav, top-level state | ~300 |

**Total:** same ~2700 lines of logic, distributed across 10 focused files.

---

## What This Unlocks

- Priority 1 bug fixes become **surgical** — you open `MangaReader.jsx`, fix the bubble filter, done
- New features can be built as new files, not appended to a monolith
- Claude Code edits become safer — targeted file reads instead of scanning 3000 lines
- Michele or another contributor can review a PR that touches one component, not the whole app

---

## Time Estimate

| Phase | Work | Time |
|---|---|---|
| 1 | Extract constants + lib files | ~2 hrs |
| 2 | Extract UI components | ~1 hr |
| 3 | Extract Studio, CreatorDashboard, MangaReader | ~3 hrs |
| 4 | Slim App.jsx, wire imports, verify locally | ~2 hrs |
| 5 | Deploy + smoke test | ~30 min |

**Total: ~1 day.** No new features ship during this window.

---

## Risk

Low. This is a mechanical operation — cut, paste, add imports. The app's behavior is unchanged. The deploy pipeline is unchanged. If something breaks, `git diff` shows exactly what moved.

Mitigation: do it in a branch (`restructure/split-components`), verify locally at each phase, deploy only after full smoke test.

---

## Recommendation to Michele

> The app works. The AI pipeline is real and deployed. The single-file structure will become a tax on every future ticket.
>
> I want to spend one day splitting the code into proper components before we add features. No new functionality ships — just a foundation that lets us build fast and clean going forward.
>
> After that: Priority 1 bug fixes, then image generation, then Creator Portal.

---

*Questions → Izayah Fisher or Michele Fisher (michele@prismaianalytics.com)*
