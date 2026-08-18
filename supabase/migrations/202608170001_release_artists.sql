-- Multi-artist roster per release (collabs, features, remixes).
-- Additive: releases.artist_name stays as the Spotify credit line;
-- releases.monthly_listeners_at_release stays as the frozen primary ML
-- the forecast actually used.

create table if not exists public.release_artists (
  id uuid primary key default gen_random_uuid(),
  release_id uuid not null references public.releases (id) on delete cascade,
  artist_name text not null,
  monthly_listeners bigint,
  role text not null,
  position integer not null,

  constraint release_artists_artist_name_check check (
    char_length(trim(artist_name)) > 0
  ),
  constraint release_artists_monthly_listeners_check check (
    monthly_listeners is null or monthly_listeners >= 1
  ),
  constraint release_artists_role_check check (
    role in ('primary', 'featured', 'collaborator', 'remixer', 'original')
  ),
  constraint release_artists_position_check check (
    position between 1 and 4
  ),
  constraint release_artists_release_id_position_key unique (release_id, position)
);

comment on table public.release_artists is
  'Up to four credited artists per release. Forecast still uses the primary row''s ML via releases.monthly_listeners_at_release; this table captures identity for later aggregation.';
comment on column public.release_artists.monthly_listeners is
  'Artist ML at entry. Nullable when unknown. Primary ML is also frozen on releases.monthly_listeners_at_release.';
comment on column public.release_artists.role is
  'Explicit credit role: primary | featured | collaborator | remixer | original.';
comment on column public.release_artists.position is
  '1-based display order (max 4).';

-- One primary artist per release (the forecast identity).
create unique index if not exists release_artists_one_primary_idx
  on public.release_artists (release_id)
  where role = 'primary';

create index if not exists release_artists_release_id_position_idx
  on public.release_artists (release_id, position);

alter table public.release_artists enable row level security;

drop policy if exists "authenticated_select_release_artists" on public.release_artists;
create policy "authenticated_select_release_artists"
  on public.release_artists
  for select
  to authenticated
  using (true);

drop policy if exists "authenticated_insert_release_artists" on public.release_artists;
create policy "authenticated_insert_release_artists"
  on public.release_artists
  for insert
  to authenticated
  with check (true);

drop policy if exists "authenticated_update_release_artists" on public.release_artists;
create policy "authenticated_update_release_artists"
  on public.release_artists
  for update
  to authenticated
  using (true)
  with check (true);

drop policy if exists "authenticated_delete_release_artists" on public.release_artists;
create policy "authenticated_delete_release_artists"
  on public.release_artists
  for delete
  to authenticated
  using (true);
