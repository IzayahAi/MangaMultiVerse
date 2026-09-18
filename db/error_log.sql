-- Observability: a lightweight error sink so breakage surfaces to the founder instead of dying in a
-- user's browser console. The client posts errors here (best-effort, fire-and-forget). Run ONCE in the
-- Supabase SQL editor. Until it exists, logging silently no-ops.

create table if not exists public.error_log (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  user_id     uuid,
  level       text not null default 'error',
  message     text,
  source      text,        -- where in the app it happened
  url         text,
  stack       text,
  context     jsonb not null default '{}'::jsonb
);

create index if not exists error_log_time_idx on public.error_log (created_at desc);

alter table public.error_log enable row level security;

-- Insert: anyone (so guest/reader errors are captured too). Read: admins only.
create policy "error insert" on public.error_log for insert with check (true);
create policy "error read" on public.error_log
  for select using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- Housekeeping: prune old rows periodically, e.g.
--   delete from public.error_log where created_at < now() - interval '30 days';
