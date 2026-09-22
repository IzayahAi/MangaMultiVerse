-- Content maturity rating per story (age gate). all | teen | mature. Mature = dark/suggestive THEMES,
-- age-gated 18+ (not explicit). Default 'all'. Run ONCE in the Supabase SQL editor.

alter table public.stories add column if not exists content_rating text not null default 'all';
create index if not exists stories_content_rating_idx on public.stories (content_rating);
