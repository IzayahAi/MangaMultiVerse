-- Mr. K (Chief of Staff) inbox: quick idea/follow-up captures the founder triages. Mr. K writes here
-- mid-session; the founder adds + triages in the dashboard. Run ONCE in the Supabase SQL editor.
-- Best-effort in the app until it exists.

create table if not exists public.cos_inbox (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  text        text not null,
  source      text,                          -- 'ui' (founder) | 'session' (Mr. K) | ...
  status      text not null default 'open'   -- open | triaged | dismissed
);

create index if not exists cos_inbox_time_idx on public.cos_inbox (created_at desc);

alter table public.cos_inbox enable row level security;

-- Insert: allowed (the founder in the UI, and Mr. K from a session via the anon key). Read/update: admin
-- only — it's the founder's private CoS inbox.
create policy "cos_inbox insert" on public.cos_inbox for insert with check (true);
create policy "cos_inbox admin read" on public.cos_inbox
  for select using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));
create policy "cos_inbox admin update" on public.cos_inbox
  for update using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));
