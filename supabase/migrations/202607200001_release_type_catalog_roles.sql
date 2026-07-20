-- Redefine releases.release_type as catalog role (NOT NULL).
-- Values: single | lead_single | focus_track | album_track | alternate_version
-- Default: single. No forecast multipliers yet — storage + form only.

alter table public.releases
  drop constraint if exists releases_release_type_check;

-- Map legacy product types (single / ep / album) into the new catalog roles.
update public.releases
set release_type = case release_type
  when 'ep' then 'single'
  when 'album' then 'album_track'
  when 'single' then 'single'
  when 'lead_single' then 'lead_single'
  when 'focus_track' then 'focus_track'
  when 'album_track' then 'album_track'
  when 'alternate_version' then 'alternate_version'
  else 'single'
end;

update public.releases
set release_type = 'single'
where release_type is null;

alter table public.releases
  alter column release_type set default 'single',
  alter column release_type set not null;

alter table public.releases
  add constraint releases_release_type_check check (
    release_type in (
      'single',
      'lead_single',
      'focus_track',
      'album_track',
      'alternate_version'
    )
  );
