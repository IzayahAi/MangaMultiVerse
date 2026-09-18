-- Moderation: readers flag published stories; admins review and hide/restore them without hand-editing
-- rows. Run ONCE in the Supabase SQL editor. Best-effort in the app until it exists.

create table if not exists public.reports (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  story_id     text not null,
  story_title  text,
  reason       text,
  reporter_id  uuid,          -- null for guests
  status       text not null default 'open'   -- open | actioned | dismissed
);

create index if not exists reports_time_idx on public.reports (created_at desc);

alter table public.reports enable row level security;

-- Insert: anyone (readers, incl. guests) may file a report. Read/update: admins only.
create policy "reports insert" on public.reports for insert with check (true);
create policy "reports admin read" on public.reports
  for select using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));
create policy "reports admin update" on public.reports
  for update using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- Admin action: hide (set 'draft') or restore (set 'published') ANY story. SECURITY DEFINER so it can
-- update stories the admin doesn't own, but gated to admins only.
create or replace function public.moderate_story(p_id text, p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin') then
    raise exception 'not authorized';
  end if;
  update public.stories set status = p_status, updated_at = now() where id = p_id;
end;
$$;

revoke all on function public.moderate_story(text, text) from public, anon;
grant execute on function public.moderate_story(text, text) to authenticated;
