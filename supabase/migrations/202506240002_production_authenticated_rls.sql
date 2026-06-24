-- Production RLS: authenticated users only. Anon gets nothing.
-- Apply ONLY after Supabase Auth is enabled, allowlisted users exist, and local
-- verification confirms login + app flows work. Retrain uses service_role (bypasses RLS).

-- ---------------------------------------------------------------------------
-- 1) Remove ALL existing policies on the three app tables
-- ---------------------------------------------------------------------------
do $$
declare
  pol record;
begin
  for pol in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('releases', 'daily_data', 'model_coefficients')
  loop
    execute format(
      'drop policy if exists %I on %I.%I',
      pol.policyname,
      pol.schemaname,
      pol.tablename
    );
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 2) releases — authenticated read/write (no delete)
-- ---------------------------------------------------------------------------
create policy "authenticated_select_releases"
  on public.releases
  for select
  to authenticated
  using (true);

create policy "authenticated_insert_releases"
  on public.releases
  for insert
  to authenticated
  with check (true);

create policy "authenticated_update_releases"
  on public.releases
  for update
  to authenticated
  using (true)
  with check (true);

-- ---------------------------------------------------------------------------
-- 3) daily_data — authenticated read/write/delete
-- ---------------------------------------------------------------------------
create policy "authenticated_select_daily_data"
  on public.daily_data
  for select
  to authenticated
  using (true);

create policy "authenticated_insert_daily_data"
  on public.daily_data
  for insert
  to authenticated
  with check (true);

create policy "authenticated_update_daily_data"
  on public.daily_data
  for update
  to authenticated
  using (true)
  with check (true);

create policy "authenticated_delete_daily_data"
  on public.daily_data
  for delete
  to authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- 4) model_coefficients — authenticated read only
-- ---------------------------------------------------------------------------
create policy "authenticated_select_model_coefficients"
  on public.model_coefficients
  for select
  to authenticated
  using (true);
