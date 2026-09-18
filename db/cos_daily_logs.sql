-- Mr. K (Chief of Staff) daily logs: a dated record of what happened each session — decisions, work
-- shipped, state of play. Mr. K writes an entry at session end; the founder reviews on the dashboard.
-- Run ONCE in the Supabase SQL editor. Best-effort in the app until it exists.

create table if not exists public.cos_daily_logs (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  log_date    date not null default current_date,
  title       text,
  body        text not null,
  source      text                            -- 'session' (Mr. K) | 'ui' (founder)
);

create index if not exists cos_daily_logs_date_idx on public.cos_daily_logs (log_date desc, created_at desc);

alter table public.cos_daily_logs enable row level security;

-- Insert: allowed (Mr. K from a session via the anon key, and the founder in the UI). Read/update: admin
-- only — it's the founder's private CoS record.
create policy "cos_daily_logs insert" on public.cos_daily_logs for insert with check (true);
create policy "cos_daily_logs admin read" on public.cos_daily_logs
  for select using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));
create policy "cos_daily_logs admin update" on public.cos_daily_logs
  for update using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));
