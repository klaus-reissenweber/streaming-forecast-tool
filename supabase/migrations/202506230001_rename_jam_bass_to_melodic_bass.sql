-- Rename genre jam/bass → melodic-bass (releases, constraint, model coefficients).

update releases set genre = 'melodic-bass' where genre = 'jam/bass';

alter table releases drop constraint if exists releases_genre_check;

alter table releases add constraint releases_genre_check
  check (genre in ('dubstep', 'house', 'melodic-bass', 'downtempo', 'big-room'));

-- saves.genre_offset: preserve value, rename key jam/bass → melodic-bass
update model_coefficients
set coefficients_json = jsonb_set(
  coefficients_json #- '{genre_offset,jam/bass}',
  '{genre_offset,melodic-bass}',
  coefficients_json->'genre_offset'->'jam/bass'
)
where model_type = 'saves'
  and coefficients_json->'genre_offset' ? 'jam/bass';

-- ad_rates.meta_rates_by_genre: same rename
update model_coefficients
set coefficients_json = jsonb_set(
  coefficients_json #- '{meta_rates_by_genre,jam/bass}',
  '{meta_rates_by_genre,melodic-bass}',
  coefficients_json->'meta_rates_by_genre'->'jam/bass'
)
where model_type = 'ad_rates'
  and coefficients_json->'meta_rates_by_genre' ? 'jam/bass';
