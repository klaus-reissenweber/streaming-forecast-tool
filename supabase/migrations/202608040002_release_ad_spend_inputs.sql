-- New release-creation inputs for the ad-spend forecast layer (spec §2).
-- meta_spend_planned already exists; spotify_spend_planned is retained for
-- backward compatibility while marquee/showcase are captured separately.

alter table public.releases
  add column if not exists spotify_marquee_spend_planned numeric default 0;

alter table public.releases
  add column if not exists spotify_showcase_spend_planned numeric default 0;

alter table public.releases
  add column if not exists campaign_start_offset_days integer;

alter table public.releases
  add column if not exists campaign_duration_days integer;

alter table public.releases
  drop constraint if exists releases_spotify_marquee_spend_planned_check;

alter table public.releases
  add constraint releases_spotify_marquee_spend_planned_check
  check (spotify_marquee_spend_planned is null or spotify_marquee_spend_planned >= 0);

alter table public.releases
  drop constraint if exists releases_spotify_showcase_spend_planned_check;

alter table public.releases
  add constraint releases_spotify_showcase_spend_planned_check
  check (spotify_showcase_spend_planned is null or spotify_showcase_spend_planned >= 0);

alter table public.releases
  drop constraint if exists releases_campaign_start_offset_days_check;

alter table public.releases
  add constraint releases_campaign_start_offset_days_check
  check (campaign_start_offset_days is null or campaign_start_offset_days >= 0);

alter table public.releases
  drop constraint if exists releases_campaign_duration_days_check;

alter table public.releases
  add constraint releases_campaign_duration_days_check
  check (campaign_duration_days is null or campaign_duration_days >= 1);
