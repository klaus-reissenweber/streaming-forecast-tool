-- Add release_type and spotify_format to releases (required for Spotify CPS lookup on detail view).
alter table releases
  add column if not exists release_type text check (release_type in ('single', 'ep', 'album')) default 'single',
  add column if not exists spotify_format text check (spotify_format in ('marquee', 'showcase')) default 'marquee';
