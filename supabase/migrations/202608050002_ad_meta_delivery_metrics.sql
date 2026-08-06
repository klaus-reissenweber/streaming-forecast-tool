-- Delivery metrics on ad_meta_campaigns so ad_model fit can run from DB only.
-- impressions/reach: Ads Manager awareness rows + optional traffic reach.
-- linkfire_ctr_pct / linkfire_streams: auto-router exclusion for click-share.

alter table public.ad_meta_campaigns
  add column if not exists impressions numeric;

alter table public.ad_meta_campaigns
  add column if not exists reach numeric;

alter table public.ad_meta_campaigns
  add column if not exists linkfire_ctr_pct numeric;

alter table public.ad_meta_campaigns
  add column if not exists linkfire_streams numeric;

comment on column public.ad_meta_campaigns.impressions is
  'Meta impressions (Ads Manager). Used for meta_awareness.cpm.';
comment on column public.ad_meta_campaigns.reach is
  'Meta reach. Used for meta_awareness.cost_per_reach.';
comment on column public.ad_meta_campaigns.linkfire_ctr_pct is
  'Linkfire CTR %. Auto-router when CTR ≥ 95 and on-page streams = 0.';
comment on column public.ad_meta_campaigns.linkfire_streams is
  'Linkfire on-page streams. Zero with high CTR marks auto-routers.';
