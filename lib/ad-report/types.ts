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
  streams: number | null;
  streamsLabel: "measured" | "estimate" | "n/a";
  /** Null when the metric was not captured (never show a bare 0). */
  impressions: number | null;
  reach: number | null;
  clicks: number | null;
  convertedListeners: number | null;
  saves: number | null;
  linkfireVisits: number | null;
  linkfireSpotifyClicks: number | null;
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
  convertedListeners: number | null;
  saves: number | null;
  streamsPerListener: number | null;
  /** Measured Linkfire Spotify clicks when present (Meta traffic). */
  linkfireSpotifyClicks: number | null;
  linkfireVisits: number | null;
  /** Predicted Spotify clicks from (spend/cpc)×click_share (Meta traffic). */
  predictedSpotifyClicks: number | null;
  costPerStream: number | null;
  usableForModeling: boolean;
  derivedFields: string[];
  startDate: string | null;
  endDate: string | null;
};

/**
 * Meta traffic funnel: predicted vs measured at the Spotify-click level.
 * Streams stay estimates (measured clicks × SPL effective when available).
 */
export type AdReportMetaFunnelComparison = {
  predictedSpotifyClicks: number;
  measuredSpotifyClicks: number | null;
  estimatedStreams: number;
  streamsFromMeasuredClicks: boolean;
  cpc: number;
  spotifyClickShare: number;
  streamsPerSpotifyClickEffective: number;
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
    /** Locked week-1 saves forecast from the release. */
    forecastSaves: number;
    /** Sum of Spotify campaign saves when any campaign captured saves. */
    actualSaves: number | null;
    savesDelta: number | null;
    savesPctOfForecast: number | null;
  };
  paid: {
    totalSpend: number;
    attributedStreams: number;
    /** Null when no campaign captured the metric (never bare 0). */
    impressions: number | null;
    reach: number | null;
    clicks: number | null;
    saves: number | null;
    blendedCostPerStream: number | null;
  };
  channels: AdReportChannelSnapshot[];
  campaigns: AdReportCampaignRow[];
  /** Present when Meta traffic spend > 0. */
  metaFunnelComparison: AdReportMetaFunnelComparison | null;
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
