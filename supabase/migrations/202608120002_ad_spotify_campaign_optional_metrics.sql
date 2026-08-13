-- Optional Spotify Marquee/Showcase dashboard metrics for per-campaign reports.
--
-- Already present from 202608040001 (no-op IF NOT EXISTS):
--   reach, clicks, converted_listeners, active_streams_per_listener,
--   est_attributed_streams
--
-- active_streams_per_listener is the dashboard "streams per listener" value.
-- est_attributed_streams is stored independently — do NOT overwrite it with
-- converted_listeners × streams_per_listener when both are present (no double-count).
--
-- These measured per-campaign values are for report display only.
-- Do NOT pool saves / streams_per_listener into global CPL or SPL fit
-- without a separate decision (same rule as linkfire_spotify_clicks).

alter table public.ad_spotify_campaigns
  add column if not exists reach integer;

alter table public.ad_spotify_campaigns
  add column if not exists clicks integer;

alter table public.ad_spotify_campaigns
  add column if not exists converted_listeners integer;

alter table public.ad_spotify_campaigns
  add column if not exists saves integer;

alter table public.ad_spotify_campaigns
  add column if not exists streams_per_listener numeric;

comment on column public.ad_spotify_campaigns.reach is
  'Spotify dashboard reach (optional). Per-campaign report only; not pooled into global fit.';
comment on column public.ad_spotify_campaigns.clicks is
  'Spotify dashboard clicks (optional). Per-campaign report only; not pooled into global fit.';
comment on column public.ad_spotify_campaigns.converted_listeners is
  'Converted listeners. Used for usable_for_modeling / CPL when complete; report display when present.';
comment on column public.ad_spotify_campaigns.saves is
  'Spotify dashboard saves (optional). Per-campaign report actuals; not pooled into global fit.';
comment on column public.ad_spotify_campaigns.streams_per_listener is
  'Dashboard streams per listener (optional). Independent of est_attributed_streams — do not recompute attributed streams as listeners × SPL when both are present. Not pooled into global SPL fit.';
comment on column public.ad_spotify_campaigns.active_streams_per_listener is
  'Legacy seed/import SPL column. Prefer streams_per_listener for new uploads; both may coexist.';
comment on column public.ad_spotify_campaigns.est_attributed_streams is
  'Attributed streams from the Spotify dashboard (or partner export). Stored as observed — never derived from converted_listeners × streams_per_listener on write.';
