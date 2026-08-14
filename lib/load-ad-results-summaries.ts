import {
  emptyAdResultsSummary,
  type AdResultsSummary,
} from "@/lib/ad-results-summary";
import { createServiceClient } from "@/lib/supabase/service";

function numOrZero(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function ensureSummary(
  map: Map<string, AdResultsSummary>,
  key: string,
): AdResultsSummary {
  const existing = map.get(key);
  if (existing) {
    return existing;
  }
  const created = emptyAdResultsSummary();
  map.set(key, created);
  return created;
}

/** Batch campaign counts + spend keyed by seed-style release_key. */
export async function loadAdResultsSummariesByReleaseKey(
  releaseKeys: string[],
): Promise<Map<string, AdResultsSummary>> {
  const keys = [...new Set(releaseKeys.map((key) => key.trim()).filter(Boolean))];
  const summaries = new Map<string, AdResultsSummary>();
  if (keys.length === 0) {
    return summaries;
  }

  const sb = createServiceClient();
  const [spotifyRes, metaRes] = await Promise.all([
    sb
      .from("ad_spotify_campaigns")
      .select("release_key, spend_usd")
      .in("release_key", keys),
    sb
      .from("ad_meta_campaigns")
      .select("release_key, spend_usd")
      .in("release_key", keys),
  ]);

  if (spotifyRes.error) {
    throw new Error(
      `ad_spotify_campaigns summaries: ${spotifyRes.error.message}`,
    );
  }
  if (metaRes.error) {
    throw new Error(`ad_meta_campaigns summaries: ${metaRes.error.message}`);
  }

  for (const row of spotifyRes.data ?? []) {
    const key = String(row.release_key ?? "").trim();
    if (!key) {
      continue;
    }
    const summary = ensureSummary(summaries, key);
    summary.spotifyCount += 1;
    summary.totalSpend += numOrZero(row.spend_usd);
  }

  for (const row of metaRes.data ?? []) {
    const key = String(row.release_key ?? "").trim();
    if (!key) {
      continue;
    }
    const summary = ensureSummary(summaries, key);
    summary.metaCount += 1;
    summary.totalSpend += numOrZero(row.spend_usd);
  }

  return summaries;
}
