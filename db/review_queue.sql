-- 🛡️ Moderator agent — one row per reviewed publish. The secured runner (api/maintenance.js) writes and
-- reads this with the SERVICE ROLE, and the Approval Rail on the Maintenance page reads/decides THROUGH the
-- runner (admin JWT) — so no client-facing policies are needed. RLS is enabled with NO policies, which means
-- only the service role can touch the table. Run this ONCE in the Supabase SQL editor. Best-effort until then
-- (the Moderator reports "table not set up" and takes no action).

create table if not exists public.review_queue (
  story_id     text primary key,                 -- the reviewed story
  title        text,
  author_id    uuid,
  verdict      text not null default 'pending',  -- ok | borderline | violation | pending
  reason       text,                             -- the moderator's one-line rationale
  rating       text,                             -- the story's content_rating at review time
  action       text not null default 'none',     -- none | auto_hidden | approved | hidden | dismissed
  status       text not null default 'open',     -- open (awaits a human) | resolved
  reviewed_at  timestamptz not null default now(),
  decided_at   timestamptz
);

create index if not exists review_queue_status_idx on public.review_queue (status, reviewed_at desc);

alter table public.review_queue enable row level security;
-- No policies on purpose: only the SERVICE ROLE (the runner) reads/writes. The Approval Rail goes through
-- api/maintenance.js (admin-gated), so the anon/authenticated keys never touch this table directly.
