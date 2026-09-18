-- Story Brain: a living "bible" per story — accumulated canon (characters, locations, world rules,
-- plot threads, open hooks, timeline, running recap) plus per-creator preference signals. It grows as
-- chapters are added, powers chapter-to-chapter continuity, and drives "continue the story"
-- recommendations. One row per story. Run ONCE in the Supabase SQL editor. Best-effort until then.

create table if not exists public.story_bible (
  id          text primary key,   -- = story_id
  story_id    text not null,
  data        jsonb not null default '{}'::jsonb,  -- {characters, locations, world_rules, plot_threads, open_hooks, timeline, running_recap}
  prefs       jsonb not null default '{}'::jsonb,  -- creator preference signals (tone/pacing leanings, accepted directions)
  updated_at  timestamptz not null default now()
);

alter table public.story_bible enable row level security;

-- Read: public (the bible is story lore, not sensitive) so the reader/recommender can use it too.
create policy "bible read" on public.story_bible for select using (true);

-- Write: only the owner of the parent story.
create policy "bible write" on public.story_bible
  for all using (
    exists (select 1 from public.stories s where s.id = story_bible.story_id and s.author_id = auth.uid())
  ) with check (
    exists (select 1 from public.stories s where s.id = story_bible.story_id and s.author_id = auth.uid())
  );
