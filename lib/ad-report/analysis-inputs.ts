/**
 * Map frozen report figures onto analysis-module inputs.
 * Copy lives in lib/analysis — this file only derives numbers.
 */

import {
  asBenchmarkSpotifySurface,
  asMetaAdSurface,
  type SpotifyReleaseFormat,
} from "@/lib/ad-campaign-surface";
import type {
  AdCampaign,
  AdRelease,
  CampaignMetric,
  ChannelComparisonInput,
  MetaFunnelInput,
} from "@/lib/analysis/ads";
import type { Surface } from "@/lib/analysis/ad-benchmarks";
import type { MetricOutcome } from "@/lib/analysis/types";
import type {
  AdReportChannelId,
  AdReportChannelSnapshot,
  AdReportMetricsSnapshot,
  AdReportMetaFunnelComparison,
} from "@/lib/ad-report/types";
import { expectedStreamRange } from "@/lib/save-rate-band-label";

function pushMetric(
  out: CampaignMetric[],
  key: string,
  value: number | null | undefined,
): void {
  if (value == null || !Number.isFinite(value)) return;
  out.push({ key, value });
}

function surfaceOf(id: AdReportChannelId): Surface | null {
  if (id === "marquee" || id === "showcase") {
    return asBenchmarkSpotifySurface(id);
  }
  return asMetaAdSurface(id);
}

function platformOf(id: AdReportChannelId): AdCampaign["platform"] {
  return id === "marquee" || id === "showcase" ? "spotify" : "meta";
}

function channelMetrics(ch: AdReportChannelSnapshot): CampaignMetric[] {
  const out: CampaignMetric[] = [];
  if (ch.clicks != null && ch.impressions != null && ch.impressions > 0) {
    pushMetric(out, "ctr", (ch.clicks / ch.impressions) * 100);
  }
  if (ch.clicks != null && ch.clicks > 0 && ch.spend > 0) {
    pushMetric(out, "cpc", ch.spend / ch.clicks);
  }
  if (
    ch.convertedListeners != null &&
    ch.clicks != null &&
    ch.clicks > 0
  ) {
    pushMetric(
      out,
      "conversion_rate",
      (ch.convertedListeners / ch.clicks) * 100,
    );
  }
  if (
    ch.streams != null &&
    ch.convertedListeners != null &&
    ch.convertedListeners > 0
  ) {
    pushMetric(
      out,
      "streams_per_listener",
      ch.streams / ch.convertedListeners,
    );
  }
  if (
    ch.saves != null &&
    ch.convertedListeners != null &&
    ch.convertedListeners > 0
  ) {
    pushMetric(out, "save_rate", (ch.saves / ch.convertedListeners) * 100);
  }
  return out;
}

export function releaseForAnalysis(
  snapshot: AdReportMetricsSnapshot,
): AdRelease {
  const stored = snapshot.release.releaseFormat;
  const format: SpotifyReleaseFormat | null =
    stored === "single" || stored === "album" ? stored : null;
  return {
    genre: snapshot.release.genre,
    format,
  };
}

export function channelsForAnalysis(
  snapshot: AdReportMetricsSnapshot,
): ChannelComparisonInput[] {
  return snapshot.channels.map((ch) => ({
    id: ch.id,
    label: ch.label,
    costPerStream: ch.costPerStream,
    campaign: {
      platform: platformOf(ch.id),
      surface: surfaceOf(ch.id),
      metrics: channelMetrics(ch),
    },
  }));
}

export function week1OutcomesForAnalysis(input: {
  forecastStreams: number;
  actualStreams: number | null;
  expectedLo: number;
  expectedHi: number;
  forecastSaves: number | null;
  actualSaves: number | null;
  streamBand: { lo: number; hi: number };
}): MetricOutcome[] {
  const out: MetricOutcome[] = [];
  if (input.actualStreams != null && Number.isFinite(input.actualStreams)) {
    out.push({
      key: "Streams",
      actual: input.actualStreams,
      forecast: input.forecastStreams,
      lo: input.expectedLo,
      hi: input.expectedHi,
    });
  }
  if (
    input.forecastSaves != null &&
    input.actualSaves != null &&
    Number.isFinite(input.forecastSaves) &&
    Number.isFinite(input.actualSaves)
  ) {
    const saveRange = expectedStreamRange(input.forecastSaves, input.streamBand);
    out.push({
      key: "Saves",
      actual: input.actualSaves,
      forecast: input.forecastSaves,
      lo: saveRange.lo,
      hi: saveRange.hi,
    });
  }
  return out;
}

export function metaFunnelForAnalysis(
  funnel: AdReportMetaFunnelComparison,
): MetaFunnelInput {
  return {
    predictedSpotifyClicks: funnel.predictedSpotifyClicks,
    measuredSpotifyClicks: funnel.measuredSpotifyClicks,
    clicksVariancePct: funnel.clicksVariancePct,
    cpc: funnel.cpc,
    spotifyClickShare: funnel.spotifyClickShare,
  };
}
