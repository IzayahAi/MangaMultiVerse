-- Multi-chapter series. Each chapter's content lives in its OWN row so the homepage feed (which loads
-- every story) stays light. Chapter 1 stays in the story record's `script` for backward-compat; chapters
-- 2+ live here. Run ONCE in the Supabase SQL editor. Best-effort in the app: no-ops until this exists.

create table if not exists public.chapters (
  id          text primary key,            -- `${story_id}_${number}`
  story_id    text not null,
  number      int  not null,
  script      jsonb not null default '{}'::jsonb,  -- {chapter_title, chapter_summary, panels[], panel_images{}, chapter_end_hook, art_style, mono, layout}
  status      text not null default 'draft',       -- draft | published
  updated_at  timestamptz not null default now()
);

create index if not exists chapters_story_idx on public.chapters (story_id, number);

alter table public.chapters enable row level security;

-- Read: anyone may read a PUBLISHED chapter; the owner may read all their chapters (drafts included).
create policy "chapters read" on public.chapters
  for select using (
    status = 'published'
    or exists (select 1 from public.stories s where s.id = chapters.story_id and s.author_id = auth.uid())
  );

-- Write: only the owner of the parent story.
create policy "chapters write" on public.chapters
  for all using (
    exists (select 1 from public.stories s where s.id = chapters.story_id and s.author_id = auth.uid())
  ) with check (
    exists (select 1 from public.stories s where s.id = chapters.story_id and s.author_id = auth.uid())
  );
