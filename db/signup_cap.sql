-- Hard-cap the public demo at 50 accounts. Decided 2026-09-27 (was the open "account-count ceiling"
-- question in CoS/open-questions.md). Enforced at the DATABASE level — not just a client-side check —
-- so it can't be bypassed by calling Supabase Auth's signup endpoint directly. Run ONCE in the Supabase
-- SQL editor, AFTER db/signup_trigger.sql (this replaces handle_new_user(), same function).

-- 1) The cap itself: the profile-creation trigger now refuses once 50 profiles already exist. Raising
--    inside an AFTER INSERT trigger rolls back the whole transaction, including the auth.users row
--    Supabase Auth just inserted — so a blocked signup leaves no orphan account behind either side.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_count integer;
begin
  select count(*) into existing_count from public.profiles;
  if existing_count >= 50 then
    raise exception 'Demo is full — 50/50 accounts. Thanks for your interest, check back after launch.'
      using errcode = 'P0001';
  end if;

  insert into public.profiles (id, username, email, role, credits)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
    new.email,
    'creator',
    700
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- 2) A public, read-only RPC so the client can show a friendly "demo full" message BEFORE attempting
--    signup, instead of relying on the raw Postgres error from the trigger above (still the real
--    enforcement — this is just better UX). No auth required; returns remaining slots, floored at 0.
create or replace function public.signup_slots_remaining()
returns integer
language sql
security definer
set search_path = public
stable
as $$
  select greatest(0, 50 - (select count(*)::integer from public.profiles));
$$;

grant execute on function public.signup_slots_remaining() to anon, authenticated;
