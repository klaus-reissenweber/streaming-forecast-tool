/**
 * Load campaign flight windows for a release (by seed-style release_key).
 */

import { createServiceClient } from "@/lib/supabase/service";
import type { CampaignFlight } from "@/lib/campaign-flights";

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
      .select("id, campaign_uid, format, start_date, end_date, spend_usd")
      .eq("release_key", key),
    sb
      .from("ad_meta_campaigns")
      .select("id, campaign_uid, campaign_name, start_date, end_date, spend_usd")
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
    const format = strOrNull(row.format);
    const uid = strOrNull(row.campaign_uid);
    const name = [format, uid].filter(Boolean).join(" · ") || "Spotify";
    flights.push({
      id: String(row.id),
      name,
      startDate: strOrNull(row.start_date),
      endDate: strOrNull(row.end_date),
      platform: "spotify",
      spendUsd: numOrZero(row.spend_usd),
    });
  }

  for (const row of metaRes.data ?? []) {
    const name =
      strOrNull(row.campaign_name) ??
      strOrNull(row.campaign_uid) ??
      "Meta";
    flights.push({
      id: String(row.id),
      name,
      startDate: strOrNull(row.start_date),
      endDate: strOrNull(row.end_date),
      platform: "meta",
      spendUsd: numOrZero(row.spend_usd),
    });
  }

  return flights;
}
