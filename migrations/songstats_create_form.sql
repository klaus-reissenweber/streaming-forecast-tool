-- Songstats create-form lock inputs.
-- Roster table today: public.release_artists
-- Monthly listeners column today: release_artists.monthly_listeners
-- (primary ML is also frozen on releases.monthly_listeners_at_release).
-- Do not execute from the agent. Apply in the SQL editor.

alter table public.releases
  add column if not exists songstats_artist_id text;

alter table public.releases
  add column if not exists inputs_version integer;

alter table public.releases
  add column if not exists ml_captured_at timestamptz;

alter table public.releases
  add column if not exists ml_overridden boolean not null default false;

alter table public.releases
  add column if not exists ml_override_reason text;

alter table public.releases
  add column if not exists followers_at_release integer;

alter table public.releases
  add column if not exists popularity_at_release integer;

alter table public.releases
  add column if not exists label text;

alter table public.releases
  add column if not exists forecast_artist_source text;

-- 1 = typed or overridden (all existing rows). 2 = fetched from Songstats at lock.
update public.releases
set inputs_version = 1
where inputs_version is null;

alter table public.releases
  alter column inputs_version set default 1;

alter table public.releases
  drop constraint if exists releases_inputs_version_check;

alter table public.releases
  add constraint releases_inputs_version_check check (
    inputs_version in (1, 2)
  );

alter table public.releases
  drop constraint if exists releases_forecast_artist_source_check;

alter table public.releases
  add constraint releases_forecast_artist_source_check check (
    forecast_artist_source is null
    or forecast_artist_source in ('track_primary', 'track_other', 'picked')
  );

alter table public.release_artists
  add column if not exists songstats_artist_id text;

create index if not exists release_artists_songstats_artist_id_idx
  on public.release_artists (songstats_artist_id);
