-- Demo-mode per-IP daily rate limit. Protects the shared provider keys from runaway demo/guest usage
-- WITHOUT requiring sign-in. Only active while RELEASE_MODE is off; at launch, per-account credits take
-- over instead. Run this ONCE in the Supabase SQL editor. Until it exists, the limit no-ops (best-effort).

create table if not exists public.demo_usage (
  id          text primary key,   -- '<ip>:<kind>:<yyyy-mm-dd>'  (kind = img | txt)
  count       int not null default 0,
  updated_at  timestamptz not null default now()
);

alter table public.demo_usage enable row level security;
-- No direct table access — only the SECURITY DEFINER RPC below touches it.

-- Atomically increment the counter for (ip, kind, day) and report whether it's still within p_limit.
create or replace function public.bump_demo_usage(p_key text, p_limit int)
returns boolean               -- true = allowed (at/under limit), false = over
language plpgsql
security definer
set search_path = public
as $$
declare c int;
begin
  insert into public.demo_usage (id, count, updated_at)
    values (p_key, 1, now())
    on conflict (id) do update set count = demo_usage.count + 1, updated_at = now()
  returning count into c;
  return c <= p_limit;
end;
$$;

revoke all on function public.bump_demo_usage(text, int) from public;
grant execute on function public.bump_demo_usage(text, int) to anon, authenticated;

-- Optional housekeeping: prune old rows periodically, e.g.
--   delete from public.demo_usage where updated_at < now() - interval '7 days';
