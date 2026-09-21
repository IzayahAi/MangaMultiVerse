-- 🚀 Deploy Sentinel (and, later, the Uptime Monitor) health-event log. Each run of the deploy_check /
-- uptime_check on the maintenance runner writes one row: the overall status + the per-target results
-- (app boots, every api/* proxy responds, Supabase responds). Run ONCE in the Supabase SQL editor.
-- Until it exists, logging silently no-ops and the checks still return live results.
--
-- RLS mirrors error_log/cost_ledger: the runner INSERTs with the anon key; ADMINS read the history;
-- the cron reads past RLS with the service role. `to anon, authenticated` is named explicitly because a
-- with-check(true) insert policy has needed it to take in this project (see the cost_ledger arming note).

create table if not exists public.health_events (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  kind        text not null default 'deploy',   -- deploy | uptime
  status      text not null,                     -- ok | warn | alert
  down        int  not null default 0,           -- number of failing targets
  results     jsonb not null default '[]'::jsonb,-- [{name, ok, status, ms}]
  meta        jsonb not null default '{}'::jsonb
);

create index if not exists health_events_time_idx on public.health_events (created_at desc);
create index if not exists health_events_kind_idx on public.health_events (kind, created_at desc);

alter table public.health_events enable row level security;

create policy "health_events insert" on public.health_events
  for insert to anon, authenticated with check (true);
create policy "health_events read" on public.health_events
  for select using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- Housekeeping: prune old rows periodically, e.g.
--   delete from public.health_events where created_at < now() - interval '30 days';
