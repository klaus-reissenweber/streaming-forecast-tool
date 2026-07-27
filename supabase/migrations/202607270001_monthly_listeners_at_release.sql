-- Snapshot ML at release creation for forecast + retrain.
-- Live monthly_listeners may drift; models must use the freeze-at-create value.

alter table public.releases
  add column if not exists monthly_listeners_at_release bigint;

-- Existing rows: best available freeze is the value currently stored.
update public.releases
set monthly_listeners_at_release = monthly_listeners
where monthly_listeners_at_release is null;

alter table public.releases
  alter column monthly_listeners_at_release set not null;

alter table public.releases
  drop constraint if exists releases_monthly_listeners_at_release_check;

alter table public.releases
  add constraint releases_monthly_listeners_at_release_check
  check (monthly_listeners_at_release >= 1);
