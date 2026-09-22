-- 🔓→🔒 Close the client-set-grant hole (the one the Credit-Tamper Watch monitors).
--
-- Before this, signUp() inserted the profile row FROM THE BROWSER with credits + role, so a malicious
-- user could grant themselves unlimited credits or role='admin'. This moves the grant server-side and
-- forbids the client from ever writing those two columns. Run ONCE in the Supabase SQL editor.
--
-- After running this, deploy the matching client change (signUp stops sending role/credits). Order:
-- run this FIRST, then the client deploy — the trigger + defaults guarantee a valid profile either way.

-- 1) Server-side profile creation. A SECURITY DEFINER trigger on auth.users creates the profile with
--    firm-controlled values the instant an account is created — the browser is never in the loop.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, username, email, role, credits)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
    new.email,
    'creator',   -- role is ALWAYS creator at signup; admins are promoted manually
    500          -- DEMO_CREDITS grant, generous to seed content (keep in sync with api/_pricing.js).
                 -- AT LAUNCH: Free is read-only — drop this to 0 (or a small taste) when flipping RELEASE_MODE.
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 2) Column defaults as a backstop, so any insert that omits these still lands valid values.
alter table public.profiles alter column role    set default 'creator';
alter table public.profiles alter column credits set default 120;

-- 3) The lock. A column-level REVOKE does NOT override Supabase's default table-wide GRANT to
--    anon/authenticated (verified: a column revoke left credits still client-writable), so we must
--    revoke the blanket insert/update and re-grant ONLY the safe columns. Result: the client can create
--    its row (id/username/email) and edit username, but can never write role or credits — those come
--    from the trigger/defaults. SELECT is untouched (RLS still gates reads); the SECURITY DEFINER
--    spend_credits RPC runs as owner, so server-side charging is unaffected.
revoke insert, update on public.profiles from anon, authenticated;
grant  insert (id, username, email) on public.profiles to authenticated;
grant  update (username)             on public.profiles to authenticated;

-- Note: promoting an admin or granting credits now happens via the Supabase SQL editor / service role,
-- not the app. That's the intended trade-off — those columns are no longer client-writable.
