-- 💳 Pricing & subscriptions (Stripe). Adds plan/billing columns to profiles + a billing audit log.
-- Run ONCE in the Supabase SQL editor. Behind RELEASE_MODE — nothing charges until the gate flips.
--
-- SECURITY: these columns are set ONLY by the Stripe webhook (service role, bypasses RLS). The client
-- can't write them — the profiles table already revokes insert/update from anon/authenticated except
-- (id, username, email)/(username) (see db/signup_trigger.sql), so plan/credits stay server-authoritative.

alter table public.profiles add column if not exists plan              text not null default 'free';
alter table public.profiles add column if not exists plan_status       text;          -- active | past_due | canceled | null
alter table public.profiles add column if not exists stripe_customer_id text;
alter table public.profiles add column if not exists credits_renew_at  timestamptz;   -- next monthly credit reset
alter table public.profiles add column if not exists plan_since        timestamptz;

create index if not exists profiles_stripe_customer_idx on public.profiles (stripe_customer_id);

-- Billing audit: one row per Stripe event we act on. Written only by the webhook (service role); admins
-- read it. No anon/authenticated access at all (unlike the best-effort logs — this is money).
create table if not exists public.billing_events (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  user_id       uuid,
  type          text not null,          -- subscription_start | invoice_paid | pack_purchase | subscription_updated | subscription_canceled
  plan          text,
  pack          text,
  credits_granted int,
  amount_usd    numeric(10,2),
  stripe_event_id text,                 -- for idempotency
  stripe_object_id text,
  meta          jsonb not null default '{}'::jsonb
);

create unique index if not exists billing_events_stripe_event_idx on public.billing_events (stripe_event_id) where stripe_event_id is not null;
create index if not exists billing_events_user_idx on public.billing_events (user_id, created_at desc);

alter table public.billing_events enable row level security;
-- Read: admins only. Insert/update: none for anon/authenticated (the webhook uses the service role,
-- which bypasses RLS). No insert policy = no client insert.
create policy "billing_events admin read" on public.billing_events
  for select using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );
