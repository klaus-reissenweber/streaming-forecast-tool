/**
 * Load ad campaign history for the ad-spend forecast layer.
 * Service role: same pattern as model_coefficients (non-user config tables;
 * RLS only grants SELECT to authenticated).
 */

import { createServiceClient } from "@/lib/supabase/service";

export type AdSpotifyCampaignRow = {
  id: string;
  artist: string;
  release_key: string;
  campaign_uid: string;
  format: "marquee" | "showcase";
  release_type: string | null;
  country: string | null;
  segment_targeting: string | null;
  spend_usd: number | null;
  reach: number | null;
  clicks: number | null;
  converted_listeners: number | null;
  active_streams_per_listener: number | null;
  est_attributed_streams: number | null;
  conversion_rate_pct: number | null;
  release_date: string | null;
  start_date: string | null;
  end_date: string | null;
  days_release_to_campaign: number | null;
  campaign_days: number | null;
  usable_for_modeling: boolean;
  exclusion_reason: string | null;
};

export type AdMetaCampaignRow = {
  id: string;
  release_key: string;
  campaign_name: string | null;
  objective: string | null;
  spend_usd: number | null;
  link_clicks: number | null;
  landing_page_views: number | null;
  cpc: number | null;
  linkfire_visits: number | null;
  linkfire_clickthroughs: number | null;
  spotify_click_share: number | null;
  start_date: string | null;
  end_date: string | null;
};

const SPOTIFY_SELECT =
  "id, artist, release_key, campaign_uid, format, release_type, country, segment_targeting, spend_usd, reach, clicks, converted_listeners, active_streams_per_listener, est_attributed_streams, conversion_rate_pct, release_date, start_date, end_date, days_release_to_campaign, campaign_days, usable_for_modeling, exclusion_reason";

const META_SELECT =
  "id, release_key, campaign_name, objective, spend_usd, link_clicks, landing_page_views, cpc, linkfire_visits, linkfire_clickthroughs, spotify_click_share, start_date, end_date";

export async function loadAdSpotifyCampaigns(options?: {
  usableOnly?: boolean;
}): Promise<AdSpotifyCampaignRow[]> {
  const supabase = createServiceClient();
  let query = supabase.from("ad_spotify_campaigns").select(SPOTIFY_SELECT);
  if (options?.usableOnly) {
    query = query.eq("usable_for_modeling", true);
  }
  const { data, error } = await query;
  if (error) {
    throw new Error(`ad_spotify_campaigns: ${error.message}`);
  }
  return (data ?? []) as AdSpotifyCampaignRow[];
}

export async function loadAdMetaCampaigns(): Promise<AdMetaCampaignRow[]> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("ad_meta_campaigns")
    .select(META_SELECT);
  if (error) {
    throw new Error(`ad_meta_campaigns: ${error.message}`);
  }
  return (data ?? []) as AdMetaCampaignRow[];
}
