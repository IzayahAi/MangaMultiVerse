# MangaMultiVerse

An AI-powered manga & comic creation platform. Describe a premise in one sentence and MangaMultiVerse runs a multi-step AI pipeline to build a full story — concept, cast, world, a three-act arc, and a batched multi-panel script — then generates the panel art and per-character voice-over to read it back.

Solo full-stack project by **Izayah Fisher**.

## What it does

Give it a seed like *"A cultivator dies at the peak and regresses to his weakest, most bullied year"* and it produces a readable manga:

- **Multi-step story agent** — a chained Claude pipeline builds the story in stages (title → characters → world → 3-act arc → per-chapter multi-panel script) rather than one giant prompt, so each stage stays coherent and editable.
- **Resilient model-output parsing** — tolerant JSON extraction with recovery for partial or truncated responses, so a single malformed generation doesn't sink the run.
- **AI art generation** — panel images via Fal.ai (FLUX) and Together AI, with automatic provider failover, exponential backoff, rate-limit handling, and request timeouts.
- **Character consistency** — appearance and scene-matching logic carried across panels so a character looks like themselves from panel to panel.
- **Per-character voice** — ElevenLabs text-to-speech, casting a fitting voice to each character from their profile for spoken playback.
- **Audience-aware storytelling** — demographic controls (Shōnen / Seinen / etc.) and style-aware panel dimensions across manga, manhwa, manhua, and Western-comic formats.
- **Live editing** — every story element is editable, with per-panel regeneration.
- **Reader** — scroll (manhwa) and page-flip modes with a speech-bubble overlay system.
- **Platform features** — Supabase auth, a public library, a usage-credits system, draft persistence across sessions, and dark mode.

## Tech stack

| Layer | Tech |
|---|---|
| Frontend | React 18, Vite |
| Backend | Supabase (Postgres, JWT auth, row-level security) |
| AI — text | Claude API (multi-step generation pipeline) |
| AI — images | Fal.ai (FLUX), Together AI — with failover |
| AI — voice | ElevenLabs TTS |
| Serverless | Vercel edge/serverless functions (`/api`) that proxy provider calls server-side |
| Deploy | Vercel |

## Architecture notes

- The story pipeline lives in [`src/lib/claude.js`](src/lib/claude.js) — staged prompts, tolerant JSON parsing, provider failover, backoff, and timeouts.
- AI provider calls can run through the serverless proxies in [`api/`](api) (`/api/claude`, `/api/image`) so API keys stay **server-side** and never ship in the browser bundle. Client-side keys are supported for local dev only.
- The Supabase anon key is public by design; row-level security enforces access.

## Running locally

```bash
npm install
cp .env.local.example .env.local   # then fill in your keys
npm run dev
```

Environment variables (see `.env.local.example`):

- `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` — required (public by design).
- For local dev you may also set `VITE_ANTHROPIC_KEY`, `VITE_FAL_KEY`, `VITE_TOGETHER_KEY`, `VITE_ELEVENLABS_KEY` to call providers directly. In production these are omitted and calls route through the `/api` serverless proxies using server-side keys (`ANTHROPIC_API_KEY`, `TOGETHER_API_KEY`).

## Status

Actively developed. Built and maintained solo end-to-end — UI, AI pipeline, provider integrations, auth, and deploy.
