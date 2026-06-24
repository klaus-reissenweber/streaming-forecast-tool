-- Baseline schema for streaming-forecast-tool (live DB shape as of 2026-06-24).
-- Idempotent for greenfield rebuilds. On an existing Supabase project, treat as
-- documentation only — CREATE TABLE IF NOT EXISTS will not alter existing tables.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- model_coefficients (created first — releases.model_version_used references it)
-- ---------------------------------------------------------------------------
create table if not exists public.model_coefficients (
  id uuid primary key default gen_random_uuid(),
  model_type text not null,
  coefficients_json jsonb not null,
  r_squared numeric,
  rmse numeric,
  sample_size integer,
  fitted_at timestamptz not null default now(),
  is_active boolean not null default true,
  parent_model_id uuid references public.model_coefficients (id) on delete set null,
  training_notes text
);

create index if not exists model_coefficients_model_type_active_idx
  on public.model_coefficients (model_type, is_active);

-- ---------------------------------------------------------------------------
-- releases
-- ---------------------------------------------------------------------------
create table if not exists public.releases (
  id uuid primary key default gen_random_uuid(),
  track_name text not null,
  artist_name text not null,
  genre text not null,
  monthly_listeners bigint not null,
  is_feature boolean not null default false,
  editorial_tier integer not null,
  release_date date not null,
  meta_spend_planned numeric default 0,
  meta_objective text,
  spotify_spend_planned numeric default 0,
  locked_forecast_streams integer,
  locked_forecast_saves integer,
  model_version_used uuid references public.model_coefficients (id) on delete set null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  closed_at timestamptz,
  release_type text default 'single',
  spotify_format text default 'marquee',

  constraint releases_genre_check check (
    genre in ('dubstep', 'house', 'melodic-bass', 'downtempo', 'big-room')
  ),
  constraint releases_editorial_tier_check check (
    editorial_tier between 0 and 3
  ),
  constraint releases_release_type_check check (
    release_type is null or release_type in ('single', 'ep', 'album')
  ),
  constraint releases_spotify_format_check check (
    spotify_format is null or spotify_format in ('marquee', 'showcase')
  ),
  constraint releases_meta_objective_check check (
    meta_objective is null or meta_objective in ('traffic', 'awareness', 'reach')
  ),
  constraint releases_status_check check (
    status in ('active', 'closed')
  )
);

create index if not exists releases_status_closed_at_idx
  on public.releases (status, closed_at desc nulls last);

create index if not exists releases_created_at_idx
  on public.releases (created_at desc);

-- ---------------------------------------------------------------------------
-- daily_data
-- ---------------------------------------------------------------------------
create table if not exists public.daily_data (
  id uuid primary key default gen_random_uuid(),
  release_id uuid not null references public.releases (id) on delete cascade,
  day_number integer not null,
  streams integer,
  saves integer,
  other_pct numeric,
  recorded_at timestamptz not null default now(),

  constraint daily_data_day_number_check check (
    day_number between 1 and 28
  ),
  constraint daily_data_release_id_day_number_key unique (release_id, day_number)
);

create index if not exists daily_data_release_id_day_number_idx
  on public.daily_data (release_id, day_number);

-- ---------------------------------------------------------------------------
-- Row Level Security — dev-era open anon policies (documented baseline state)
-- Superseded by 202506240002_production_authenticated_rls.sql before public deploy.
-- ---------------------------------------------------------------------------
alter table public.releases enable row level security;
alter table public.daily_data enable row level security;
alter table public.model_coefficients enable row level security;

drop policy if exists "dev_anon_all_releases" on public.releases;
create policy "dev_anon_all_releases"
  on public.releases
  for all
  to anon
  using (true)
  with check (true);

drop policy if exists "dev_anon_all_daily_data" on public.daily_data;
create policy "dev_anon_all_daily_data"
  on public.daily_data
  for all
  to anon
  using (true)
  with check (true);

drop policy if exists "dev_anon_all_model_coefficients" on public.model_coefficients;
create policy "dev_anon_all_model_coefficients"
  on public.model_coefficients
  for all
  to anon
  using (true)
  with check (true);
