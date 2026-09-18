-- Admin "Brain": an Obsidian-style linked-notes vault, private to admins.
-- Run this ONCE in the Supabase SQL editor. Until it exists, the Brain page's
-- fetch/save calls no-op (best-effort), so the rest of the app is unaffected.

create table if not exists public.brain_notes (
  id          text primary key,
  title       text not null default 'Untitled',
  body        text not null default '',
  kind        text not null default 'note',   -- 'doc' | 'ops' | 'note'
  tags        jsonb not null default '[]'::jsonb,
  links       jsonb not null default '[]'::jsonb,  -- target note titles parsed from [[...]]
  updated_at  timestamptz not null default now()
);

alter table public.brain_notes enable row level security;

-- Helper: is the current JWT an admin? (reads their own profiles row)
-- Admin-only read + write. No public/anon access at all.
create policy "brain admin read" on public.brain_notes
  for select using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

create policy "brain admin write" on public.brain_notes
  for all using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  ) with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- To grant yourself admin (one time):
--   update public.profiles set role = 'admin' where email = 'you@example.com';
