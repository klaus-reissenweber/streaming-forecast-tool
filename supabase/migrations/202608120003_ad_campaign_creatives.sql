-- Per-campaign creative images for ad reports (manual upload, no Marketing API).
-- Public report pages resolve assets by unguessable object_key only — no directory listing.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'ad-creatives',
  'ad-creatives',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.ad_campaign_creatives (
  id uuid primary key default gen_random_uuid(),
  release_key text not null,
  campaign_uid text not null,
  platform text not null,
  -- Storage object name = unguessable token + extension (never a browsable path).
  object_key text not null,
  caption text,
  content_type text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),

  constraint ad_campaign_creatives_platform_check check (
    platform in ('spotify', 'meta')
  ),
  constraint ad_campaign_creatives_object_key_key unique (object_key),
  constraint ad_campaign_creatives_object_key_format_check check (
    char_length(object_key) >= 20
    and object_key ~ '^[A-Za-z0-9_-]+\.(jpe?g|png|webp|gif)$'
  )
);

create index if not exists ad_campaign_creatives_release_key_idx
  on public.ad_campaign_creatives (release_key);

create index if not exists ad_campaign_creatives_campaign_uid_idx
  on public.ad_campaign_creatives (campaign_uid);

alter table public.ad_campaign_creatives enable row level security;

-- No anon/authenticated policies on the table: reads/writes go through service role
-- (same pattern as ad_reports). Public report embeds resolved public URLs only.

comment on table public.ad_campaign_creatives is
  'Ad creative images linked to campaign_uid; object_key is an unguessable storage path.';

-- Storage: public can read a known object URL; no open listing.
drop policy if exists "ad_creatives_public_read" on storage.objects;
create policy "ad_creatives_public_read"
  on storage.objects
  for select
  to public
  using (bucket_id = 'ad-creatives');

-- Writes only via service role (bypasses RLS). No insert/update/delete for anon/auth.
