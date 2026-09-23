-- Public storage bucket for AI-generated panel art. Both image providers (Together, DeepInfra) return
-- raw base64 image data, not a hosted URL — the app currently has nowhere durable to put it, so
-- generated art never reaches the story's database record (only the creator's own browser, via
-- localStorage). This bucket gives the server proxies somewhere to upload each panel and get back a
-- real https URL to store in stories.script.panel_images / chapters.script.panel_images instead.
-- Run ONCE in the Supabase SQL editor.

insert into storage.buckets (id, name, public)
values ('panel-art', 'panel-art', true)
on conflict (id) do nothing;

-- Uploads happen server-side (api/image.js, api/deepinfra.js) using the anon key, same pattern as every
-- other write in this app — the security boundary is "the browser never holds a provider key," not
-- per-user bucket auth. Anyone can upload/overwrite objects in this bucket; that's an acceptable
-- tradeoff for a demo-stage app (same posture as cos_inbox's open insert policy) — revisit before launch
-- if abuse becomes a concern (e.g. gate behind the guard() credit check the proxies already run).
create policy "panel-art insert" on storage.objects
  for insert
  with check (bucket_id = 'panel-art');

create policy "panel-art update" on storage.objects
  for update
  using (bucket_id = 'panel-art')
  with check (bucket_id = 'panel-art');

-- Public read — this is how readers actually see the art (public bucket + this policy).
create policy "panel-art public read" on storage.objects
  for select
  using (bucket_id = 'panel-art');
