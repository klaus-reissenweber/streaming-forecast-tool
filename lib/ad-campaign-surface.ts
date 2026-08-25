/**
 * Ad-campaign surface classification.
 *
 * Meta stores meta_awareness | meta_traffic (or null). Ads Manager Result
 * indicator is the gold signal (surface_source = imported). The CTR rule fills
 * only what the indicator leaves null — it does not read objective or names.
 * Spotify stores marquee | showcase; prefix spotify_ at read time for the
 * benchmark Surface union. Release format is a separate column (single | album).
 */

export type MetaAdSurface = "meta_awareness" | "meta_traffic";
export type MetaSurfaceSource = "ctr_rule" | "imported";
export type SpotifyAdSurface = "marquee" | "showcase";
export type SpotifyReleaseFormat = "single" | "album";

export type MetaSurfaceClassification =
  | { surface: MetaAdSurface; source: "ctr_rule" }
  | { surface: MetaAdSurface; source: "imported" }
  | { surface: null; source: null };

/** ThruPlay and reach. Video-view optimizations match as view-style. */
const RESULT_INDICATOR_AWARENESS = new Set([
  "video_thruplay_watched_actions",
  "reach",
]);

/** Link click and landing-page view. Streaming/click-out equivalents stay here. */
const RESULT_INDICATOR_TRAFFIC = new Set([
  "actions:link_click",
  "actions:omni_landing_page_view",
]);

function normalizeResultIndicator(
  raw: string | null | undefined,
): string {
  return (raw ?? "").trim().toLowerCase();
}

/** Video view / ThruPlay optimizations. Not profile visits or page views. */
function isVideoViewStyleIndicator(indicator: string): boolean {
  if (indicator.includes("thruplay")) return true;
  if (indicator === "video_view" || indicator.endsWith(":video_view")) {
    return true;
  }
  if (/^video_p\d+_watched_actions$/.test(indicator)) return true;
  return false;
}

/**
 * Ads Manager Result indicator → surface. Blank, pixel, engagement, and
 * unknown values stay null — they are not forced into a surface.
 */
export function classifyMetaSurfaceFromResultIndicator(
  raw: string | null | undefined,
): MetaSurfaceClassification {
  const indicator = normalizeResultIndicator(raw);
  if (!indicator) return { surface: null, source: null };
  if (
    RESULT_INDICATOR_AWARENESS.has(indicator) ||
    isVideoViewStyleIndicator(indicator)
  ) {
    return { surface: "meta_awareness", source: "imported" };
  }
  if (RESULT_INDICATOR_TRAFFIC.has(indicator)) {
    return { surface: "meta_traffic", source: "imported" };
  }
  return { surface: null, source: null };
}

/**
 * Prefer Result indicator; CTR classifies only when the indicator is null.
 */
export function resolveMetaSurface(input: {
  resultIndicator?: string | null;
  linkClicks?: number | null;
  impressions?: number | null;
}): MetaSurfaceClassification {
  const imported = classifyMetaSurfaceFromResultIndicator(
    input.resultIndicator,
  );
  if (imported.surface) return imported;
  return classifyMetaSurfaceFromCtr(input.linkClicks, input.impressions);
}

/**
 * Link CTR vs impressions. Impressions missing or zero → unclassified.
 * CTR < 1% → awareness; CTR ≥ 2% → traffic; 1–2% stays null.
 * Null / non-finite link_clicks count as zero clicks.
 */
export function classifyMetaSurfaceFromCtr(
  linkClicks: number | null | undefined,
  impressions: number | null | undefined,
): MetaSurfaceClassification {
  if (
    impressions == null ||
    !Number.isFinite(impressions) ||
    impressions <= 0
  ) {
    return { surface: null, source: null };
  }
  const clicks =
    linkClicks == null || !Number.isFinite(linkClicks) ? 0 : linkClicks;
  const ctr = (clicks / impressions) * 100;
  if (ctr < 1) return { surface: "meta_awareness", source: "ctr_rule" };
  if (ctr >= 2) return { surface: "meta_traffic", source: "ctr_rule" };
  return { surface: null, source: null };
}

export function releaseFormatFromCampaignType(
  raw: string | null | undefined,
): SpotifyReleaseFormat | null {
  const v = (raw ?? "").trim().toLowerCase();
  if (v === "single") return "single";
  if (v === "album" || v === "ep") return "album";
  return null;
}

export function asSpotifyAdSurface(raw: unknown): SpotifyAdSurface | null {
  return raw === "marquee" || raw === "showcase" ? raw : null;
}

/** Prefix stored marquee|showcase for the benchmark Surface union. */
export function asBenchmarkSpotifySurface(
  stored: unknown,
): "spotify_marquee" | "spotify_showcase" | null {
  if (stored === "marquee") return "spotify_marquee";
  if (stored === "showcase") return "spotify_showcase";
  return null;
}

export function asMetaAdSurface(raw: unknown): MetaAdSurface | null {
  return raw === "meta_awareness" || raw === "meta_traffic" ? raw : null;
}
