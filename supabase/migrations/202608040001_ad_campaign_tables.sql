-- Ad campaign history for the ad-spend forecast layer (spec §1).
-- Read via service role (same pattern as model_coefficients); authenticated SELECT only.

-- ---------------------------------------------------------------------------
-- ad_spotify_campaigns — one row per campaign-country-format
-- ---------------------------------------------------------------------------
create table if not exists public.ad_spotify_campaigns (
  id uuid primary key default gen_random_uuid(),
  artist text not null,
  release_key text not null,
  campaign_uid text not null,
  format text not null,
  release_type text,
  country text,
  segment_targeting text,
  spend_usd numeric,
  reach numeric,
  clicks numeric,
  converted_listeners numeric,
  active_streams_per_listener numeric,
  est_attributed_streams numeric,
  conversion_rate_pct numeric,
  release_date date,
  start_date date,
  end_date date,
  days_release_to_campaign integer,
  campaign_days integer,
  usable_for_modeling boolean not null default true,
  exclusion_reason text,
  created_at timestamptz not null default now(),

  constraint ad_spotify_campaigns_format_check check (
    format in ('marquee', 'showcase')
  ),
  -- Same campaign can have Marquee + Showcase rows (see seed pairs).
  constraint ad_spotify_campaigns_campaign_uid_format_key unique (campaign_uid, format)
);

create index if not exists ad_spotify_campaigns_artist_idx
  on public.ad_spotify_campaigns (artist);

create index if not exists ad_spotify_campaigns_release_key_idx
  on public.ad_spotify_campaigns (release_key);

create index if not exists ad_spotify_campaigns_usable_format_idx
  on public.ad_spotify_campaigns (usable_for_modeling, format);

-- ---------------------------------------------------------------------------
-- ad_meta_campaigns — release-level Meta + Linkfire aggregates
-- ---------------------------------------------------------------------------
create table if not exists public.ad_meta_campaigns (
  id uuid primary key default gen_random_uuid(),
  release_key text not null,
  campaign_name text,
  objective text,
  spend_usd numeric,
  link_clicks numeric,
  landing_page_views numeric,
  cpc numeric,
  linkfire_visits numeric,
  linkfire_clickthroughs numeric,
  spotify_click_share numeric,
  start_date date,
  end_date date,
  created_at timestamptz not null default now(),

  constraint ad_meta_campaigns_release_key_key unique (release_key)
);

create index if not exists ad_meta_campaigns_release_key_idx
  on public.ad_meta_campaigns (release_key);

-- ---------------------------------------------------------------------------
-- RLS — authenticated read only (writes via service role / import scripts)
-- ---------------------------------------------------------------------------
alter table public.ad_spotify_campaigns enable row level security;
alter table public.ad_meta_campaigns enable row level security;

drop policy if exists "authenticated_select_ad_spotify_campaigns"
  on public.ad_spotify_campaigns;
create policy "authenticated_select_ad_spotify_campaigns"
  on public.ad_spotify_campaigns
  for select
  to authenticated
  using (true);

drop policy if exists "authenticated_select_ad_meta_campaigns"
  on public.ad_meta_campaigns;
create policy "authenticated_select_ad_meta_campaigns"
  on public.ad_meta_campaigns
  for select
  to authenticated
  using (true);
