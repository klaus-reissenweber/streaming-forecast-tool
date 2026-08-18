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

export type AdReportCreativeAsset = {
  id: string;
  url: string;
  caption: string | null;
};

export type AdReportCampaignRow = {
  platform: "spotify" | "meta";
  channel: AdReportChannelId;
  /** Stable uid for creative linking. */
  campaignUid: string | null;
  campaignName: string;
  format: string | null;
  objective: string | null;
  spend: number;
  streams: number | null;
  streamsLabel: "measured" | "estimate" | null;
  impressions: number | null;
  reach: number | null;
  clicks: number | null;
  /** clicks / impressions when both captured. */
  ctr: number | null;
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
  creatives: AdReportCreativeAsset[];
  /** Channel planned spend allocated to this campaign. */
  budget?: number | null;
  resultLabel?: string | null;
  resultActual?: number | null;
  resultForecast?: number | null;
  status?: "achieved" | "under_achieved" | null;
};

/**
 * Meta traffic funnel: predicted vs measured at the Spotify-click level.
 * Streams stay estimates (measured clicks × SPL effective when available).
 */
export type AdReportMetaFunnelComparison = {
  predictedSpotifyClicks: number;
  measuredSpotifyClicks: number | null;
  /** (measured − predicted) / predicted × 100 when measured present. */
  clicksVariancePct: number | null;
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
    /** e.g. Traffic, Awareness, Streaming. */
    objectiveLabel?: string | null;
  };
  campaignWindow: {
    startDate: string | null;
    endDate: string | null;
    /** Null when absent or a degenerate same-day range — omit from header. */
    label: string | null;
  };
  headline: {
    /** Week-1 locked forecast. */
    forecastStreams: number;
    /** Week-1 actuals (D1–D7). */
    actualStreams: number | null;
    actualDaysEntered: number;
    delta: number | null;
    /** Legacy: actual / forecast × 100. Prefer variancePct in UI. */
    pctOfForecast: number | null;
    /** (actual − forecast) / forecast × 100 when actual present. */
    variancePct: number | null;
    /** Catalog p25/p75 multipliers of actual/forecast. */
    streamBand?: { lo: number; hi: number; n: number };
    expectedStreamsLo?: number;
    expectedStreamsHi?: number;
    streamsVsBand?: "below" | "within" | "above" | null;
    /** Locked week-1 saves forecast from the release. */
    forecastSaves: number;
    /** Week-1 organic saves from daily data. */
    actualSaves: number | null;
    savesDelta: number | null;
    savesPctOfForecast: number | null;
    savesVariancePct: number | null;
    /** Distinguishes week-1 organic saves from older paid-saves snapshots. */
    actualSavesWindow?: "week1" | "paid";
    /** D1–D28 actual total — no variance vs week-1 forecast. */
    d28ActualStreams?: number | null;
    d28DaysEntered?: number;
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
    /** Planned Meta + Spotify spend at create time. */
    budgetTotal?: number;
  };
  channels: AdReportChannelSnapshot[];
  campaigns: AdReportCampaignRow[];
  /** Present when Meta traffic spend > 0. */
  metaFunnelComparison: AdReportMetaFunnelComparison | null;
  /** True when any campaign has at least one creative. */
  hasCreatives: boolean;
  charts: {
    spendByChannel: Array<{ channel: string; spend: number; budget?: number }>;
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
