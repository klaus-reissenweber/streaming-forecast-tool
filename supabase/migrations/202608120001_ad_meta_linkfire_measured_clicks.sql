-- Measured Linkfire click counts for Meta traffic attribution.
-- When linkfire_spotify_clicks is present, report attribution uses it directly
-- (× streams_per_spotify_click_effective) and skips (spend/cpc)×click_share.
-- These measured values must NOT feed the global fit (spotify_click_share / cpc).

alter table public.ad_meta_campaigns
  add column if not exists linkfire_visits integer;

alter table public.ad_meta_campaigns
  add column if not exists linkfire_spotify_clicks integer;

comment on column public.ad_meta_campaigns.linkfire_visits is
  'Measured Linkfire visits (optional). Upload/report display only; not used in global fit.';
comment on column public.ad_meta_campaigns.linkfire_spotify_clicks is
  'Measured Linkfire Spotify clicks (optional). When present, Meta traffic streams = clicks × SPL effective; excluded from global spotify_click_share fit.';
