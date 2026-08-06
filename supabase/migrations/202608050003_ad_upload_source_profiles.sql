-- In-app "Upload ad results": partner source profiles + upsert keys / derived tags.

-- ---------------------------------------------------------------------------
-- Meta: campaign_uid as upsert key (multiple campaigns per release_key)
-- ---------------------------------------------------------------------------
alter table public.ad_meta_campaigns
  add column if not exists campaign_uid text;

update public.ad_meta_campaigns
set campaign_uid = release_key
where campaign_uid is null;

alter table public.ad_meta_campaigns
  alter column campaign_uid set not null;

alter table public.ad_meta_campaigns
  drop constraint if exists ad_meta_campaigns_release_key_key;

alter table public.ad_meta_campaigns
  drop constraint if exists ad_meta_campaigns_campaign_uid_key;

alter table public.ad_meta_campaigns
  add constraint ad_meta_campaigns_campaign_uid_key unique (campaign_uid);

create index if not exists ad_meta_campaigns_release_key_idx
  on public.ad_meta_campaigns (release_key);

-- ---------------------------------------------------------------------------
-- Derived / partner provenance on both ad tables
-- ---------------------------------------------------------------------------
alter table public.ad_spotify_campaigns
  add column if not exists derived_fields text[] not null default '{}';

alter table public.ad_spotify_campaigns
  add column if not exists source_partner text;

alter table public.ad_meta_campaigns
  add column if not exists derived_fields text[] not null default '{}';

alter table public.ad_meta_campaigns
  add column if not exists source_partner text;

-- ---------------------------------------------------------------------------
-- Partner layout profiles (auto-apply next upload from same partner)
-- ---------------------------------------------------------------------------
create table if not exists public.ad_upload_source_profiles (
  id uuid primary key default gen_random_uuid(),
  partner_key text not null,
  partner_label text not null,
  platform text not null default 'unknown',
  column_mappings jsonb not null default '{}'::jsonb,
  file_constants jsonb not null default '{}'::jsonb,
  header_signature text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ad_upload_source_profiles_platform_check check (
    platform in ('spotify', 'meta', 'unknown')
  ),
  constraint ad_upload_source_profiles_partner_platform_key
    unique (partner_key, platform)
);

create index if not exists ad_upload_source_profiles_partner_key_idx
  on public.ad_upload_source_profiles (partner_key);

alter table public.ad_upload_source_profiles enable row level security;

drop policy if exists "authenticated_select_ad_upload_source_profiles"
  on public.ad_upload_source_profiles;
create policy "authenticated_select_ad_upload_source_profiles"
  on public.ad_upload_source_profiles
  for select
  to authenticated
  using (true);
