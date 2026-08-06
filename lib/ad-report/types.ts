/**
 * Frozen metrics_snapshot shape for ad_reports.
 * All numbers are computed at generation time — the public page never recomputes.
 */

export type AdReportChannelId =
  | "marquee"
  | "showcase"
  | "meta_traffic"
  | "meta_awareness";

export type AdReportChannelSnapshot = {
  id: AdReportChannelId;
  label: string;
  spend: number;
  /** Primary stream output (measured Spotify; estimated Meta traffic). */
  streams: number;
  streamsLabel: "measured" | "estimate" | "n/a";
  impressions: number;
  reach: number;
  clicks: number;
  /** spend / streams when streams > 0. */
  costPerStream: number | null;
  hasDerivedValues: boolean;
};

export type AdReportCampaignRow = {
  platform: "spotify" | "meta";
  channel: AdReportChannelId;
  campaignName: string;
  format: string | null;
  objective: string | null;
  spend: number;
  streams: number | null;
  streamsLabel: "measured" | "estimate" | null;
  impressions: number | null;
  reach: number | null;
  clicks: number | null;
  costPerStream: number | null;
  usableForModeling: boolean;
  derivedFields: string[];
  startDate: string | null;
  endDate: string | null;
};

export type AdReportDailyPoint = {
  day: number;
  forecastStreams: number;
  actualStreams: number | null;
};

export type AdReportMetricsSnapshot = {
  version: 1;
  generatedAt: string;
  release: {
    id: string;
    trackName: string;
    artistName: string;
    genre: string;
    releaseDate: string;
    releaseKey: string;
  };
  campaignWindow: {
    startDate: string | null;
    endDate: string | null;
    label: string;
  };
  headline: {
    forecastStreams: number;
    actualStreams: number | null;
    actualDaysEntered: number;
    delta: number | null;
    pctOfForecast: number | null;
  };
  paid: {
    totalSpend: number;
    attributedStreams: number;
    impressions: number;
    reach: number;
    clicks: number;
    blendedCostPerStream: number | null;
  };
  channels: AdReportChannelSnapshot[];
  campaigns: AdReportCampaignRow[];
  charts: {
    spendByChannel: Array<{ channel: string; spend: number }>;
    forecastVsActualDaily: AdReportDailyPoint[];
  };
};

export type AdReportRecord = {
  id: string;
  releaseId: string;
  slug: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  expiresAt: string | null;
  metricsSnapshot: AdReportMetricsSnapshot;
};
