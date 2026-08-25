/**
 * Load campaign flight windows for a release (by seed-style release_key).
 */

import { readableCampaignName } from "@/lib/campaign-display-name";
import type { CampaignFlight } from "@/lib/campaign-flights";
import { coerceMetaObjective } from "@/lib/meta-objective";
import { createServiceClient } from "@/lib/supabase/service";

function strOrNull(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  return s || null;
}

function numOrZero(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

export async function loadCampaignFlightsForReleaseKey(
  releaseKey: string,
): Promise<CampaignFlight[]> {
  const key = releaseKey.trim();
  if (!key) {
    return [];
  }

  const sb = createServiceClient();
  const [spotifyRes, metaRes] = await Promise.all([
    sb
      .from("ad_spotify_campaigns")
      .select("id, surface, start_date, end_date, spend_usd")
      .eq("release_key", key),
    sb
      .from("ad_meta_campaigns")
      .select(
        "id, campaign_uid, campaign_name, objective, start_date, end_date, spend_usd",
      )
      .eq("release_key", key),
  ]);

  if (spotifyRes.error) {
    throw new Error(`ad_spotify_campaigns flights: ${spotifyRes.error.message}`);
  }
  if (metaRes.error) {
    throw new Error(`ad_meta_campaigns flights: ${metaRes.error.message}`);
  }

  const flights: CampaignFlight[] = [];

  for (const row of spotifyRes.data ?? []) {
    flights.push({
      id: String(row.id),
      name: readableCampaignName({
        platform: "spotify",
        format: strOrNull(row.surface),
      }),
      startDate: strOrNull(row.start_date),
      endDate: strOrNull(row.end_date),
      platform: "spotify",
      spendUsd: numOrZero(row.spend_usd),
    });
  }

  for (const row of metaRes.data ?? []) {
    flights.push({
      id: String(row.id),
      name: readableCampaignName({
        campaignName: strOrNull(row.campaign_name),
        campaignUid: strOrNull(row.campaign_uid),
        platform: "meta",
        objective: coerceMetaObjective(
          strOrNull(row.objective),
          "traffic",
        ),
      }),
      startDate: strOrNull(row.start_date),
      endDate: strOrNull(row.end_date),
      platform: "meta",
      spendUsd: numOrZero(row.spend_usd),
    });
  }

  return flights;
}
