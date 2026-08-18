-- Seed the global week-1 stream forecast-error band (actual / locked forecast).
-- Descriptive of historical error; not used in forecast math.
-- Idempotent: skip if an active stream_bands row already exists.

insert into public.model_coefficients (
  model_type,
  coefficients_json,
  r_squared,
  sample_size,
  fitted_at,
  is_active,
  training_notes
)
select
  'stream_bands',
  '{"lo": 0.45, "hi": 1.05, "n": 58}'::jsonb,
  null,
  58,
  '2026-08-17T00:00:00.000Z'::timestamptz,
  true,
  'Seed: catalog p25/p75 of actual_wk1 / locked_forecast_streams (global).'
where not exists (
  select 1
  from public.model_coefficients
  where model_type = 'stream_bands'
    and is_active = true
);
