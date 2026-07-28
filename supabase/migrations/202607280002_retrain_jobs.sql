-- Phase 2a: async retrain job queue (GitHub Actions worker claims via RPC).

create table if not exists public.retrain_jobs (
  id uuid primary key default gen_random_uuid(),
  status text not null
    check (status in ('queued', 'running', 'completed', 'failed')),
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  triggered_by uuid,
  triggered_email text,
  draft_model_id uuid references public.model_coefficients (id) on delete set null,
  error text,
  report_json jsonb
);

create index if not exists retrain_jobs_created_at_idx
  on public.retrain_jobs (created_at desc);

-- Single-flight: at most one queued or running job.
create unique index if not exists retrain_jobs_one_inflight_idx
  on public.retrain_jobs ((true))
  where status in ('queued', 'running');

alter table public.retrain_jobs enable row level security;

drop policy if exists "authenticated_select_retrain_jobs" on public.retrain_jobs;
create policy "authenticated_select_retrain_jobs"
  on public.retrain_jobs
  for select
  to authenticated
  using (true);

-- Inserts from the Next.js server action use the user session; allowlisted
-- operators only (app-layer can_retrain). Updates/claims are service-role only.
drop policy if exists "authenticated_insert_retrain_jobs" on public.retrain_jobs;
create policy "authenticated_insert_retrain_jobs"
  on public.retrain_jobs
  for insert
  to authenticated
  with check (true);

-- Claim oldest queued job (FOR UPDATE SKIP LOCKED). Service role / security definer.
create or replace function public.claim_retrain_job()
returns setof public.retrain_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed public.retrain_jobs;
begin
  select *
  into claimed
  from public.retrain_jobs
  where status = 'queued'
  order by created_at asc
  for update skip locked
  limit 1;

  if not found then
    return;
  end if;

  update public.retrain_jobs
  set status = 'running',
      started_at = now(),
      error = null
  where id = claimed.id
  returning * into claimed;

  return next claimed;
end;
$$;

revoke all on function public.claim_retrain_job() from public;
grant execute on function public.claim_retrain_job() to service_role;
