-- Spotify rows are one per (campaign_uid, format): same campaign can have
-- both Marquee and Showcase. Seed data already reuses campaign_uid across formats.

alter table public.ad_spotify_campaigns
  drop constraint if exists ad_spotify_campaigns_campaign_uid_key;

alter table public.ad_spotify_campaigns
  drop constraint if exists ad_spotify_campaigns_campaign_uid_format_key;

alter table public.ad_spotify_campaigns
  add constraint ad_spotify_campaigns_campaign_uid_format_key
  unique (campaign_uid, format);
