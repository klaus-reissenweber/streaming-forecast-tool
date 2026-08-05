-- Meta objective taxonomy: awareness | traffic | streaming
-- Legacy "reach" merges into awareness. Split Meta spend into traffic vs awareness.

-- ---------------------------------------------------------------------------
-- ad_meta_campaigns.objective
-- ---------------------------------------------------------------------------
update public.ad_meta_campaigns
set objective = 'awareness'
where lower(coalesce(objective, '')) in ('reach', 'awareness');

-- Historical seed rows (link-click Meta aggregates) are traffic-funnel campaigns.
update public.ad_meta_campaigns
set objective = 'traffic'
where objective is null
   or lower(objective) in ('', 'traffic');

update public.ad_meta_campaigns
set objective = 'streaming'
where lower(objective) = 'streaming';

alter table public.ad_meta_campaigns
  drop constraint if exists ad_meta_campaigns_objective_check;

alter table public.ad_meta_campaigns
  add constraint ad_meta_campaigns_objective_check
  check (
    objective is null
    or objective in ('awareness', 'traffic', 'streaming')
  );

-- ---------------------------------------------------------------------------
-- releases: split Meta spend + simplify objective check
-- ---------------------------------------------------------------------------
alter table public.releases
  add column if not exists meta_traffic_spend_planned numeric default 0;

alter table public.releases
  add column if not exists meta_awareness_spend_planned numeric default 0;

alter table public.releases
  drop constraint if exists releases_meta_traffic_spend_planned_check;

alter table public.releases
  add constraint releases_meta_traffic_spend_planned_check
  check (meta_traffic_spend_planned is null or meta_traffic_spend_planned >= 0);

alter table public.releases
  drop constraint if exists releases_meta_awareness_spend_planned_check;

alter table public.releases
  add constraint releases_meta_awareness_spend_planned_check
  check (meta_awareness_spend_planned is null or meta_awareness_spend_planned >= 0);

-- Backfill split from legacy single spend + objective (reach → awareness).
update public.releases
set
  meta_traffic_spend_planned = case
    when lower(coalesce(meta_objective, 'traffic')) = 'traffic'
      then coalesce(meta_spend_planned, 0)
    else 0
  end,
  meta_awareness_spend_planned = case
    when lower(coalesce(meta_objective, '')) in ('awareness', 'reach')
      then coalesce(meta_spend_planned, 0)
    else 0
  end
where coalesce(meta_traffic_spend_planned, 0) = 0
  and coalesce(meta_awareness_spend_planned, 0) = 0
  and coalesce(meta_spend_planned, 0) > 0;

update public.releases
set meta_objective = 'awareness'
where lower(coalesce(meta_objective, '')) = 'reach';

alter table public.releases
  drop constraint if exists releases_meta_objective_check;

alter table public.releases
  add constraint releases_meta_objective_check
  check (
    meta_objective is null
    or meta_objective in ('awareness', 'traffic', 'streaming')
  );
