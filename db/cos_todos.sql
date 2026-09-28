-- Mr. K (Chief of Staff) to-do list: the founder's cross-device task list on the Dashboard overview.
-- The founder adds/toggles/deletes in the UI; Mr. K can also write tasks from a session (anon insert),
-- e.g. synthesized from the closed-session daily logs. Run ONCE in the Supabase SQL editor.
-- Best-effort in the app until it exists (the widget shows a "run this SQL" hint).

create table if not exists public.cos_todos (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  text        text not null,
  done        boolean not null default false,
  source      text                             -- 'ui' (founder) | 'session' (Mr. K) | 'synthesis'
);

create index if not exists cos_todos_time_idx on public.cos_todos (done, created_at desc);

alter table public.cos_todos enable row level security;

-- Insert: allowed (the founder in the UI, and Mr. K from a session via the anon key). Read/update/delete:
-- admin only — it's the founder's private task list.
create policy "cos_todos insert" on public.cos_todos for insert with check (true);
create policy "cos_todos admin read" on public.cos_todos
  for select using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));
create policy "cos_todos admin update" on public.cos_todos
  for update using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));
create policy "cos_todos admin delete" on public.cos_todos
  for delete using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));
