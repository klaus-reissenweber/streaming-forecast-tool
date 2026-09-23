-- Songstats automatic stream tracking.
-- Looked up on live DB: PostgREST cannot read pg_index / pg_constraint
-- (those catalogs are not in the exposed schema). Names below are from
-- supabase/migrations/202506240001_initial_schema_baseline.sql:
--   constraint daily_data_release_id_day_number_key unique (release_id, day_number)
--   index daily_data_release_id_day_number_idx on (release_id, day_number)
-- The unique constraint is what persist-daily-data and the Songstats writer
-- use for onConflict / day identity. Do not drop it.

create table if not exists public.songstats_daily_totals (
  id uuid primary key default gen_random_uuid(),
  release_id uuid not null references public.releases (id),
  isrc text not null,
  fetched_at timestamptz not null default now(),
  source text not null default 'spotify',
  streams_total bigint not null,
  popularity integer,
  trigger text not null,
  constraint songstats_daily_totals_trigger_check check (
    trigger in ('cron', 'manual')
  )
);

create index if not exists songstats_daily_totals_release_id_fetched_at_idx
  on public.songstats_daily_totals (release_id, fetched_at);

alter table public.daily_data
  add column if not exists streams_songstats integer;

alter table public.daily_data
  add column if not exists popularity_songstats integer;

alter table public.daily_data
  add column if not exists streams_source text;

alter table public.releases
  add column if not exists songstats_track_id text;

alter table public.releases
  add column if not exists label text;

alter table public.daily_data
  add column if not exists songstats_quality text;

-- 'clean' | 'lumped' | 'stale' | 'pending'
alter table public.daily_data
  drop constraint if exists daily_data_songstats_quality_check;

alter table public.daily_data
  add constraint daily_data_songstats_quality_check check (
    songstats_quality is null
    or songstats_quality in ('clean', 'lumped', 'stale', 'pending')
  );

alter table public.songstats_daily_totals enable row level security;

drop policy if exists "authenticated_select_songstats_daily_totals"
  on public.songstats_daily_totals;
create policy "authenticated_select_songstats_daily_totals"
  on public.songstats_daily_totals
  for select
  to authenticated
  using (true);

drop policy if exists "authenticated_insert_songstats_daily_totals"
  on public.songstats_daily_totals;
create policy "authenticated_insert_songstats_daily_totals"
  on public.songstats_daily_totals
  for insert
  to authenticated
  with check (true);
