-- 🔓 Credit-Tamper & Abuse Watch findings log. Each run of tamper_watch on the maintenance runner writes
-- one summary row: the overall status + the findings (over-grant balances, unexpected admins, signup
-- velocity). Run ONCE in the Supabase SQL editor. Until it exists, the check still returns live findings;
-- the table just persists history and lets the cron's inbox alert read past RLS.
--
-- RLS mirrors the other maintenance tables: the runner INSERTs with the anon key; ADMINS read the
-- history; the cron reads profiles + this table past RLS with the service role. `to anon, authenticated`
-- is named explicitly (a with-check(true) insert policy has needed it to take in this project).

create table if not exists public.security_flags (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  status      text not null,                     -- ok | warn | alert
  findings    jsonb not null default '{}'::jsonb,-- { overCredits:[], admins:[], recentSignups24h, ... }
  meta        jsonb not null default '{}'::jsonb
);

create index if not exists security_flags_time_idx on public.security_flags (created_at desc);

alter table public.security_flags enable row level security;

create policy "security_flags insert" on public.security_flags
  for insert to anon, authenticated with check (true);
create policy "security_flags read" on public.security_flags
  for select using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- Housekeeping: prune old rows periodically, e.g.
--   delete from public.security_flags where created_at < now() - interval '90 days';
