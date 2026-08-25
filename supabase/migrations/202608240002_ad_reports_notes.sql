-- Editorial notes for shareable ad reports.
-- Stored outside metrics_snapshot so regenerating the frozen figures
-- cannot wipe free-text or finding overrides.
-- Do not write generated findings here — those are computed at render.

alter table public.ad_reports
  add column if not exists notes jsonb;

comment on column public.ad_reports.notes is
  'Nullable editorial JSON: creative, audience, recommendations, and findings overrides keyed by finding id. Regenerating metrics_snapshot must not overwrite this column.';
