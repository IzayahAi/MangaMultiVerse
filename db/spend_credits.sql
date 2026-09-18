-- Atomic, server-side credit spend. Replaces the bypassable client-side PATCH.
-- Run this ONCE in the Supabase SQL editor.
--
-- Called via PostgREST RPC with the USER's JWT, so auth.uid() is the caller. SECURITY DEFINER lets it
-- write the profiles row, but the WHERE clause pins it to the caller's own row AND to sufficient
-- balance in a single atomic UPDATE — so two concurrent calls can never drive credits negative or
-- double-spend. Returns the new balance, or NULL when the balance is insufficient (no row updated).

create or replace function public.spend_credits(p_amount int)
returns int
language sql
security definer
set search_path = public
as $$
  update public.profiles
     set credits = credits - p_amount
   where id = auth.uid()
     and credits >= p_amount
  returning credits;
$$;

-- Only signed-in users may spend; never anon/public.
revoke all on function public.spend_credits(int) from public, anon;
grant execute on function public.spend_credits(int) to authenticated;
