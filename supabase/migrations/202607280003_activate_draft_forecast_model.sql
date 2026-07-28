-- Phase 2b: atomically activate a draft consolidated forecast_model.

create or replace function public.activate_draft_forecast_model(
  p_draft_id uuid,
  p_override_notes text default null
)
returns public.model_coefficients
language plpgsql
security definer
set search_path = public
as $$
declare
  draft_row public.model_coefficients;
  activated public.model_coefficients;
  next_metadata jsonb;
begin
  select *
  into draft_row
  from public.model_coefficients
  where id = p_draft_id
  for update;

  if not found then
    raise exception 'draft model_coefficients id=% not found', p_draft_id;
  end if;

  if draft_row.status is distinct from 'draft' then
    raise exception
      'model_coefficients id=% is status=% (expected draft)',
      p_draft_id, draft_row.status;
  end if;

  if draft_row.payload is null then
    raise exception 'model_coefficients id=% has null payload', p_draft_id;
  end if;

  next_metadata := coalesce(draft_row.metadata, '{}'::jsonb);
  if p_override_notes is not null then
    next_metadata := jsonb_set(
      next_metadata,
      '{override_notes}',
      to_jsonb(p_override_notes)
    );
  end if;

  -- Demote current consolidated active version(s).
  update public.model_coefficients
  set
    status = 'superseded',
    is_active = false
  where status = 'active'
    and payload is not null
    and id <> p_draft_id;

  update public.model_coefficients
  set
    status = 'active',
    is_active = true,
    activated_at = now(),
    metadata = next_metadata
  where id = p_draft_id
  returning * into activated;

  return activated;
end;
$$;

revoke all on function public.activate_draft_forecast_model(uuid, text) from public;
grant execute on function public.activate_draft_forecast_model(uuid, text) to service_role;
