/**
 * Snapshot stores enum keys. Display strings live in the report UI.
 * Existing rows may still hold the pre-enum strings; parse both on read.
 */

import type {
  AdReportCampaignRow,
  AdReportChannelSnapshot,
  AdReportMetricsSnapshot,
  AdReportResultLabel,
  AdReportStreamsLabel,
} from "./types";

export const STREAMS_LABEL_DISPLAY: Record<AdReportStreamsLabel, string> = {
  estimated: "Estimated",
  measured: "Measured",
  unavailable: "Not available",
};

export const RESULT_LABEL_DISPLAY: Record<AdReportResultLabel, string> = {
  streams: "Streams",
  spotify_clicks: "Spotify clicks",
  impressions: "Impressions",
};

export function parseStreamsLabel(raw: unknown): AdReportStreamsLabel | null {
  switch (raw) {
    case "estimated":
    case "estimate":
      return "estimated";
    case "measured":
      return "measured";
    case "unavailable":
    case "n/a":
      return "unavailable";
    default:
      return null;
  }
}

export function parseResultLabel(raw: unknown): AdReportResultLabel | null {
  switch (raw) {
    case "streams":
    case "Streams":
      return "streams";
    case "spotify_clicks":
    case "Spotify clicks":
      return "spotify_clicks";
    case "impressions":
    case "Impressions":
      return "impressions";
    default:
      return null;
  }
}

export function isEstimatedStreams(raw: unknown): boolean {
  return parseStreamsLabel(raw) === "estimated";
}

export function isUnavailableStreams(raw: unknown): boolean {
  return parseStreamsLabel(raw) === "unavailable";
}

export function displayStreamsLabel(raw: unknown): string | null {
  const key = parseStreamsLabel(raw);
  return key ? STREAMS_LABEL_DISPLAY[key] : null;
}

export function displayResultLabel(raw: unknown): string | null {
  const key = parseResultLabel(raw);
  return key ? RESULT_LABEL_DISPLAY[key] : null;
}

/** Coerce stored snapshot labels to canonical enums. Does not write back. */
export function normalizeMetricsSnapshot(
  snapshot: AdReportMetricsSnapshot,
): AdReportMetricsSnapshot {
  for (const channel of snapshot.channels ?? []) {
    normalizeChannel(channel);
  }
  for (const campaign of snapshot.campaigns ?? []) {
    normalizeCampaign(campaign);
  }
  return snapshot;
}

function normalizeChannel(channel: AdReportChannelSnapshot): void {
  const next = parseStreamsLabel(channel.streamsLabel);
  if (next) channel.streamsLabel = next;
}

function normalizeCampaign(campaign: AdReportCampaignRow): void {
  campaign.streamsLabel = parseStreamsLabel(campaign.streamsLabel);
  const result = parseResultLabel(campaign.resultLabel);
  if (campaign.resultLabel != null) {
    campaign.resultLabel = result;
  }
}
