-- Shareable per-release performance reports.
-- Public page loads by slug via service role (RLS denies listing for anon).

create table if not exists public.ad_reports (
  id uuid primary key default gen_random_uuid(),
  release_id uuid not null references public.releases (id) on delete cascade,
  slug text not null,
  title text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metrics_snapshot jsonb not null default '{}'::jsonb,
  expires_at timestamptz,

  constraint ad_reports_slug_key unique (slug),
  constraint ad_reports_release_id_key unique (release_id),
  constraint ad_reports_slug_format_check check (
    char_length(slug) >= 16 and slug ~ '^[A-Za-z0-9_-]+$'
  )
);

create index if not exists ad_reports_slug_idx on public.ad_reports (slug);
create index if not exists ad_reports_release_id_idx on public.ad_reports (release_id);

alter table public.ad_reports enable row level security;

-- No anon/authenticated policies: no listing, no direct client reads.
-- Public /report/[slug] uses service role and looks up by exact slug.
-- Authenticated users also go through service-role helpers for View/Copy link.

comment on table public.ad_reports is
  'Frozen performance snapshots; shareable by unguessable slug only.';
comment on column public.ad_reports.metrics_snapshot is
  'Frozen KPIs at generation time — stable even as live data changes.';
