/**
 * Load existing ad_* rows for the manual-entry wizard.
 */

import {
  emptyManualDraft,
  type ManualCampaignDraft,
} from "@/lib/ad-upload/manual-rows";
import type { AdUploadFormat, AdUploadObjective } from "@/lib/ad-upload/canonical";
import { createServiceClient } from "@/lib/supabase/service";

function str(value: unknown): string {
  if (value == null) return "";
  const s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return s;
}

function num(value: unknown): string {
  if (value == null || value === "") return "";
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? String(n) : "";
}

function asFormat(value: unknown): "" | AdUploadFormat {
  return value === "marquee" || value === "showcase" ? value : "";
}

function asObjective(value: unknown): AdUploadObjective {
  if (value === "awareness" || value === "streaming" || value === "traffic") {
    return value;
  }
  return "traffic";
}

export type ManualCampaignsForWizard = {
  spotify: ManualCampaignDraft[];
  meta: ManualCampaignDraft[];
  metaObjective: AdUploadObjective;
};

export async function loadManualCampaignsForReleaseKey(
  releaseKey: string,
): Promise<ManualCampaignsForWizard> {
  const key = releaseKey.trim();
  if (!key) {
    return { spotify: [emptyManualDraft()], meta: [emptyManualDraft()], metaObjective: "traffic" };
  }

  const sb = createServiceClient();
  const [spotifyRes, metaRes] = await Promise.all([
    sb
      .from("ad_spotify_campaigns")
      .select(
        "campaign_uid, surface, spend_usd, reach, clicks, converted_listeners, est_attributed_streams, saves, start_date, end_date",
      )
      .eq("release_key", key),
    sb
      .from("ad_meta_campaigns")
      .select(
        "campaign_uid, campaign_name, objective, spend_usd, impressions, link_clicks, linkfire_visits, linkfire_spotify_clicks, start_date, end_date",
      )
      .eq("release_key", key),
  ]);

  if (spotifyRes.error) {
    throw new Error(`ad_spotify_campaigns: ${spotifyRes.error.message}`);
  }
  if (metaRes.error) {
    throw new Error(`ad_meta_campaigns: ${metaRes.error.message}`);
  }

  const spotify: ManualCampaignDraft[] = (spotifyRes.data ?? []).map((row) => ({
    ...emptyManualDraft(),
    campaign_uid: str(row.campaign_uid) || null,
    campaign_name: asFormat(row.surface)
      ? asFormat(row.surface) === "marquee"
        ? "Marquee"
        : "Showcase"
      : "",
    spend: num(row.spend_usd),
    format: asFormat(row.surface),
    reach: num(row.reach),
    clicks: num(row.clicks),
    converted_listeners: num(row.converted_listeners),
    est_attributed_streams: num(row.est_attributed_streams),
    saves: num(row.saves),
    start_date: str(row.start_date),
    end_date: str(row.end_date),
  }));

  const metaRows = metaRes.data ?? [];
  const meta: ManualCampaignDraft[] = metaRows.map((row) => ({
    ...emptyManualDraft(),
    campaign_uid: str(row.campaign_uid) || null,
    campaign_name: str(row.campaign_name),
    spend: num(row.spend_usd),
    impressions: num(row.impressions),
    clicks: num(row.link_clicks),
    linkfire_visits: num(row.linkfire_visits),
    linkfire_spotify_clicks: num(row.linkfire_spotify_clicks),
    start_date: str(row.start_date),
    end_date: str(row.end_date),
  }));

  return {
    spotify: spotify.length > 0 ? spotify : [emptyManualDraft()],
    meta: meta.length > 0 ? meta : [emptyManualDraft()],
    metaObjective: asObjective(metaRows[0]?.objective),
  };
}
