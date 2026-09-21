-- 💸 Spend Sentinel: a per-action AI-spend ledger. Every paid provider call (via the api/* proxies)
-- writes one best-effort row here, so the Spend Sentinel can total spend per provider/action over time,
-- watch the Fal 429 rate, and alert on runaway burn. Run ONCE in the Supabase SQL editor. Until it
-- exists, logging silently no-ops (guard's insert just fails best-effort) and the demo is unaffected.
--
-- RLS mirrors error_log: the server proxies INSERT with the public anon key (they already hold no
-- provider keys); ADMINS read the aggregate; the maintenance cron reads past RLS with the service role.

create table if not exists public.cost_ledger (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  provider    text not null,                       -- anthropic | fal | together | elevenlabs
  action      text not null,                       -- panel | script | story | fal_429 | ...
  credits     int  not null default 0,             -- credits charged (0 while the launch gate is off)
  usd         numeric(10,5) not null default 0,    -- ESTIMATED provider $ for this action (see _pricing.js)
  event       boolean not null default false,      -- true = signal row (e.g. fal_429), not spend
  user_id     uuid,                                -- null in demo / cron
  ip          text,
  meta        jsonb not null default '{}'::jsonb
);

create index if not exists cost_ledger_time_idx     on public.cost_ledger (created_at desc);
create index if not exists cost_ledger_provider_idx on public.cost_ledger (provider, created_at desc);

alter table public.cost_ledger enable row level security;

-- Insert: anyone (the server proxies use the anon key, same as error_log/reports/demo_usage).
create policy "cost_ledger insert" on public.cost_ledger for insert with check (true);
-- Read: admins only (the maintenance cron uses the service role, which bypasses RLS).
create policy "cost_ledger read" on public.cost_ledger
  for select using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- Housekeeping: prune old rows periodically, e.g.
--   delete from public.cost_ledger where created_at < now() - interval '90 days';
