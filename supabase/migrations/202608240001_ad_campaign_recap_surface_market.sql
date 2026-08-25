-- Ad recap schema gaps. Idempotent. Looks up live pg_class / pg_constraint
-- names instead of assuming Postgres defaults from CREATE TABLE.
--
-- Live catalog (rolled-back DB, 2026-08-24):
--   ad_spotify_campaigns: pg_constraint empty. Unique on (campaign_uid, format)
--   is the INDEX ad_spotify_campaigns_uid_format_key, not a table constraint
--   and not ad_spotify_campaigns_campaign_uid_format_key. No format_check.
--   usable_for_modeling+format is INDEX ad_spotify_campaigns_usable_format_idx.
--   ad_meta_campaigns: this file does not rename existing objects. New surface /
--   market objects are created only when missing. Catalog is printed on apply.
--
-- 1. ad_meta_campaigns.surface  (meta_awareness | meta_traffic)
--    Provenance: surface_source (ctr_rule | imported). CTR-rule backfill tags
--    classified rows ctr_rule. Result indicator ingest writes imported and wins.
-- 2. ad_spotify_campaigns.format → surface (marquee | showcase);
--    add release_format (single | album). EP maps to album.
-- 3. ad_meta_campaigns.market (nullable city). campaign_uid unique is untouched.
--
-- Applying this without the matching app change will break Spotify upserts
-- (onConflict campaign_uid,surface) and any select of the old `format` column.

-- ---------------------------------------------------------------------------
-- Catalog dump (apply-time). Does not change objects.
-- ---------------------------------------------------------------------------
do $$
declare
  r record;
begin
  raise notice 'pg_indexes:';
  for r in
    select tablename, indexname, indexdef
    from pg_indexes
    where schemaname = 'public'
      and tablename in ('ad_spotify_campaigns', 'ad_meta_campaigns')
    order by 1, 2
  loop
    raise notice '  %.% — %', r.tablename, r.indexname, r.indexdef;
  end loop;

  raise notice 'pg_constraint:';
  for r in
    select c.conrelid::regclass as table_name,
           c.conname,
           c.contype,
           pg_get_constraintdef(c.oid) as def
    from pg_constraint c
    where c.conrelid in (
      'public.ad_spotify_campaigns'::regclass,
      'public.ad_meta_campaigns'::regclass
    )
    order by 1, 2
  loop
    raise notice '  % % (%) — %', r.table_name, r.conname, r.contype, r.def;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 1. Meta surface + provenance
-- ---------------------------------------------------------------------------
alter table public.ad_meta_campaigns
  add column if not exists surface text;

alter table public.ad_meta_campaigns
  add column if not exists surface_source text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.ad_meta_campaigns'::regclass
      and conname = 'ad_meta_campaigns_surface_check'
  ) then
    alter table public.ad_meta_campaigns
      add constraint ad_meta_campaigns_surface_check
      check (
        surface is null
        or surface in ('meta_awareness', 'meta_traffic')
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.ad_meta_campaigns'::regclass
      and conname = 'ad_meta_campaigns_surface_source_check'
  ) then
    alter table public.ad_meta_campaigns
      add constraint ad_meta_campaigns_surface_source_check
      check (
        surface_source is null
        or surface_source in ('ctr_rule', 'imported')
      );
  end if;
end $$;

comment on column public.ad_meta_campaigns.surface is
  'Benchmark surface: meta_awareness | meta_traffic. LPV and streaming count as traffic. Null when the row cannot be classified. Independent of objective.';

comment on column public.ad_meta_campaigns.surface_source is
  'How surface was set. ctr_rule = link CTR heuristic. imported = Ads Manager Result indicator (takes precedence). Null iff surface is null.';

comment on column public.ad_meta_campaigns.objective is
  'Legacy three-bucket taxonomy. Prefer surface for recap benchmarks.';

-- CTR rule. Does not read objective or campaign_name.
-- CTR is computed once; surface and surface_source both derive from that value.
--   impressions missing or 0 → null
--   ctr < 1  → meta_awareness / ctr_rule
--   ctr >= 2 → meta_traffic / ctr_rule
--   otherwise → null / null
-- Leave imported rows alone if this file is re-applied after Result-indicator ingest.
update public.ad_meta_campaigns as c
set
  surface = classified.surface,
  surface_source = classified.surface_source
from (
  select
    id,
    surface,
    case when surface is null then null else 'ctr_rule' end as surface_source
  from (
    select
      id,
      case
        when ctr is null then null
        when ctr < 1 then 'meta_awareness'
        when ctr >= 2 then 'meta_traffic'
        else null
      end as surface
    from (
      select
        id,
        case
          when impressions is null or impressions <= 0 then null
          else 100.0 * coalesce(link_clicks, 0) / impressions
        end as ctr
      from public.ad_meta_campaigns
    ) as rates
  ) as by_ctr
) as classified
where c.id = classified.id
  and c.surface_source is distinct from 'imported';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.ad_meta_campaigns'::regclass
      and conname = 'ad_meta_campaigns_surface_provenance_check'
  ) then
    alter table public.ad_meta_campaigns
      add constraint ad_meta_campaigns_surface_provenance_check
      check (
        (surface is null) = (surface_source is null)
      );
  end if;
end $$;

create index if not exists ad_meta_campaigns_surface_idx
  on public.ad_meta_campaigns (surface);

-- ---------------------------------------------------------------------------
-- 2. Spotify format → surface (column + indexes, not assumed constraint names)
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'ad_spotify_campaigns'
      and column_name = 'format'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'ad_spotify_campaigns'
      and column_name = 'surface'
  ) then
    alter table public.ad_spotify_campaigns rename column format to surface;
  end if;
end $$;

-- Unique (campaign_uid, format|surface): live name is uid_format_key (index).
do $$
declare
  idx_name text;
begin
  select c.relname
  into idx_name
  from pg_index i
  join pg_class c on c.oid = i.indexrelid
  join pg_class t on t.oid = i.indrelid
  join pg_namespace n on n.oid = t.relnamespace
  where n.nspname = 'public'
    and t.relname = 'ad_spotify_campaigns'
    and i.indisunique
    and not i.indisprimary
    and (
      select array_agg(a.attname::text order by ord.ordinality)
      from unnest(i.indkey) with ordinality as ord(attnum, ordinality)
      join pg_attribute a
        on a.attrelid = t.oid
       and a.attnum = ord.attnum
    ) in (
      array['campaign_uid', 'format']::text[],
      array['campaign_uid', 'surface']::text[]
    );

  if idx_name is null then
    -- Fallback to the name confirmed on this project.
    if to_regclass('public.ad_spotify_campaigns_uid_format_key') is not null then
      idx_name := 'ad_spotify_campaigns_uid_format_key';
    end if;
  end if;

  if idx_name is not null
     and idx_name is distinct from 'ad_spotify_campaigns_uid_surface_key' then
    if to_regclass('public.ad_spotify_campaigns_uid_surface_key') is not null then
      raise exception
        'Spotify unique index % still exists, but uid_surface_key already exists',
        idx_name;
    end if;
    -- Unique is an index, not a pg_constraint row.
    execute format(
      'alter index public.%I rename to ad_spotify_campaigns_uid_surface_key',
      idx_name
    );
  end if;
end $$;

-- (usable_for_modeling, format|surface)
do $$
declare
  idx_name text;
begin
  select c.relname
  into idx_name
  from pg_index i
  join pg_class c on c.oid = i.indexrelid
  join pg_class t on t.oid = i.indrelid
  join pg_namespace n on n.oid = t.relnamespace
  where n.nspname = 'public'
    and t.relname = 'ad_spotify_campaigns'
    and not i.indisunique
    and (
      select array_agg(a.attname::text order by ord.ordinality)
      from unnest(i.indkey) with ordinality as ord(attnum, ordinality)
      join pg_attribute a
        on a.attrelid = t.oid
       and a.attnum = ord.attnum
    ) in (
      array['usable_for_modeling', 'format']::text[],
      array['usable_for_modeling', 'surface']::text[]
    );

  if idx_name is null
     and to_regclass('public.ad_spotify_campaigns_usable_format_idx') is not null then
    idx_name := 'ad_spotify_campaigns_usable_format_idx';
  end if;

  if idx_name is not null
     and idx_name is distinct from 'ad_spotify_campaigns_usable_surface_idx' then
    if to_regclass('public.ad_spotify_campaigns_usable_surface_idx') is not null then
      raise exception
        'Spotify usable index % still exists, but usable_surface_idx already exists',
        idx_name;
    end if;
    execute format(
      'alter index public.%I rename to ad_spotify_campaigns_usable_surface_idx',
      idx_name
    );
  end if;
end $$;

comment on column public.ad_spotify_campaigns.surface is
  'Spotify ad product: marquee | showcase. Maps to Surface spotify_marquee / spotify_showcase at read time.';

alter table public.ad_spotify_campaigns
  add column if not exists release_format text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.ad_spotify_campaigns'::regclass
      and conname = 'ad_spotify_campaigns_release_format_check'
  ) then
    alter table public.ad_spotify_campaigns
      add constraint ad_spotify_campaigns_release_format_check
      check (
        release_format is null
        or release_format in ('single', 'album')
      );
  end if;
end $$;

comment on column public.ad_spotify_campaigns.release_format is
  'Benchmark format: single | album. EP maps to album. Distinct from surface (marquee|showcase) and from releases.release_type (catalog role).';

update public.ad_spotify_campaigns
set release_format = 'single'
where release_format is null
  and lower(release_type) = 'single';

update public.ad_spotify_campaigns
set release_format = 'album'
where release_format is null
  and lower(release_type) in ('album', 'ep');

do $$
declare
  r record;
  n int := 0;
begin
  for r in
    select release_type, count(*) as row_count
    from public.ad_spotify_campaigns
    where release_format is null
    group by release_type
    order by count(*) desc, release_type nulls first
  loop
    n := n + 1;
    raise notice 'unmapped release_type %: % row(s)',
      coalesce(quote_literal(r.release_type), 'NULL'),
      r.row_count;
  end loop;
  if n = 0 then
    raise notice 'unmapped release_type: none';
  end if;
end $$;

create index if not exists ad_spotify_campaigns_release_format_idx
  on public.ad_spotify_campaigns (release_format);

-- ---------------------------------------------------------------------------
-- 3. Meta market (nullable). Does not split existing rows.
-- ---------------------------------------------------------------------------
alter table public.ad_meta_campaigns
  add column if not exists market text;

comment on column public.ad_meta_campaigns.market is
  'City / DMA. Null = unspecified or a multi-market collapse. Not parsed from campaign_name.';

create index if not exists ad_meta_campaigns_market_idx
  on public.ad_meta_campaigns (market);

-- campaign_uid uniqueness is untouched, whether it is a table constraint or
-- a unique index, and whatever it is named.

-- ---------------------------------------------------------------------------
-- ROLLBACK (run separately; not part of apply)
-- ---------------------------------------------------------------------------
-- do $$
-- begin
--   if to_regclass('public.ad_meta_campaigns_market_idx') is not null then
--     execute 'drop index if exists public.ad_meta_campaigns_market_idx';
--   end if;
-- end $$;
-- alter table public.ad_meta_campaigns drop column if exists market;
--
-- drop index if exists public.ad_spotify_campaigns_release_format_idx;
-- alter table public.ad_spotify_campaigns
--   drop constraint if exists ad_spotify_campaigns_release_format_check;
-- alter table public.ad_spotify_campaigns drop column if exists release_format;
--
-- do $$
-- begin
--   if to_regclass('public.ad_spotify_campaigns_uid_surface_key') is not null
--      and to_regclass('public.ad_spotify_campaigns_uid_format_key') is null then
--     alter index public.ad_spotify_campaigns_uid_surface_key
--       rename to ad_spotify_campaigns_uid_format_key;
--   end if;
--   if to_regclass('public.ad_spotify_campaigns_usable_surface_idx') is not null
--      and to_regclass('public.ad_spotify_campaigns_usable_format_idx') is null then
--     alter index public.ad_spotify_campaigns_usable_surface_idx
--       rename to ad_spotify_campaigns_usable_format_idx;
--   end if;
--   if exists (
--     select 1 from information_schema.columns
--     where table_schema = 'public'
--       and table_name = 'ad_spotify_campaigns'
--       and column_name = 'surface'
--   ) and not exists (
--     select 1 from information_schema.columns
--     where table_schema = 'public'
--       and table_name = 'ad_spotify_campaigns'
--       and column_name = 'format'
--   ) then
--     alter table public.ad_spotify_campaigns rename column surface to format;
--   end if;
-- end $$;
--
-- drop index if exists public.ad_meta_campaigns_surface_idx;
-- alter table public.ad_meta_campaigns
--   drop constraint if exists ad_meta_campaigns_surface_provenance_check;
-- alter table public.ad_meta_campaigns
--   drop constraint if exists ad_meta_campaigns_surface_source_check;
-- alter table public.ad_meta_campaigns
--   drop constraint if exists ad_meta_campaigns_surface_check;
-- alter table public.ad_meta_campaigns drop column if exists surface_source;
-- alter table public.ad_meta_campaigns drop column if exists surface;
