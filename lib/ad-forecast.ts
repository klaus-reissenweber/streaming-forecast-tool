/**
 * Additive ad-attributed stream layer (spec §4).
 * Pure math — does not mutate the organic locked curve.
 */

import type { AdModel } from "@/lib/model/ad-model";
import type { Genre, MetaObjective, SpotifyFormat } from "@/lib/forecast";
import { splitMetaSpendByObjective } from "@/lib/meta-objective";

export const CAMPAIGN_WINDOW_DAYS = 28;
export const DEFAULT_MARQUEE_DURATION_DAYS = 2;
export const DEFAULT_SHOWCASE_DURATION_DAYS = 14;
export const DEFAULT_META_DURATION_DAYS = 14;

export type AdSpendPlan = {
  artistName: string;
  genre: Genre;
  marqueeSpend: number;
  showcaseSpend: number;
  /** Meta traffic spend — flows through click→stream funnel. */
  metaTrafficSpend: number;
  /** Meta awareness spend — reach-only; zero attributed streams. */
  metaAwarenessSpend: number;
  /** Days after release day 1 that campaigns start (0 = release day). */
  campaignStartOffsetDays: number;
  /** Meta flight length; marquee/showcase use format defaults. */
  metaDurationDays: number;
};

export type AdAttributedTotals = {
  spotifyMarquee: number;
  spotifyShowcase: number;
  spotifyTotal: number;
  /** Attributed streams from Meta traffic funnel only. */
  meta: number;
  /** Awareness spend tracked for display; never contributes streams. */
  metaAwarenessSpend: number;
  grandTotal: number;
  splUsed: number;
  splSource: "artist" | "genre" | "global";
  /** base × (spl / spl_global) — derived at forecast time. */
  metaStreamsPerSpotifyClickEffective: number;
  /** meta_traffic_spend / meta_streams when meta > 0; else null. */
  metaCostPerStream: number | null;
};

export type AdDailyLayer = {
  totals: AdAttributedTotals;
  /** Resolved spend plan (after legacy split / fallbacks). */
  plan: AdSpendPlan;
  /** 28-length daily Marquee attributed streams. */
  marqueeDaily: number[];
  /** 28-length daily Showcase attributed streams. */
  showcaseDaily: number[];
  /** 28-length daily Meta attributed streams. */
  metaDaily: number[];
  /** Organic wk1 + ad streams landing in D1–D7. */
  week1WithAds: number;
  week1AdMarquee: number;
  week1AdShowcase: number;
  week1AdMeta: number;
  week1AdTotal: number;
};

/** Meta funnel readout driven by active adModel (not catalog META_DELIVERY constants). */
export type AdMetaFunnelDisplay = {
  cpc: number;
  spotifyClickShare: number;
  streamsPerSpotifyClickEffective: number;
  projectedClicks: number;
  projectedSpotifyClicks: number;
  projectedStreams: number;
  costPerStream: number | null;
  confidence: AdModel["metaFunnel"]["confidence"];
  splUsed: number;
  splSource: AdAttributedTotals["splSource"];
  cplMarquee: number;
  cplShowcase: number;
};

/** Awareness reach-only readout from adModel.metaAwareness (0 attributed streams). */
export type AdAwarenessDisplay = {
  cpm: number;
  costPerReach: number;
  projectedImpressions: number;
  projectedReach: number;
  confidence: AdModel["metaAwareness"]["confidence"];
};

function clampInt(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

/** Resolve SPL: artist (shrunk) → genre prior → global. */
export function resolveSpl(
  adModel: AdModel,
  artistName: string,
  genre: Genre,
): { spl: number; source: AdAttributedTotals["splSource"] } {
  const exact = adModel.spotifySplByArtist[artistName];
  if (exact != null && Number.isFinite(exact)) {
    return { spl: exact, source: "artist" };
  }
  const target = artistName.trim().toLowerCase();
  for (const [artist, spl] of Object.entries(adModel.spotifySplByArtist)) {
    if (artist.trim().toLowerCase() === target && Number.isFinite(spl)) {
      return { spl, source: "artist" };
    }
  }
  const genrePrior = adModel.spotifySplByGenre[genre];
  if (genrePrior != null && Number.isFinite(genrePrior)) {
    return { spl: genrePrior, source: "genre" };
  }
  return { spl: adModel.spotifySplGlobal, source: "global" };
}

/**
 * Scale Meta's tunable base by resolved SPL vs global fallback.
 * effective = base × (spl / spl_global)
 */
export function effectiveMetaStreamsPerSpotifyClick(
  adModel: AdModel,
  spl: number,
): number {
  const base = adModel.metaFunnel.streamsPerSpotifyClickBase;
  const global = adModel.spotifySplGlobal;
  if (!(global > 0) || !Number.isFinite(spl)) return base;
  return base * (spl / global);
}

export function computeAdAttributedTotals(
  plan: AdSpendPlan,
  adModel: AdModel,
): AdAttributedTotals {
  const { spl, source } = resolveSpl(adModel, plan.artistName, plan.genre);
  const cpl = adModel.spotifyCpl;
  const funnel = adModel.metaFunnel;
  const streamsPerClickEffective = effectiveMetaStreamsPerSpotifyClick(
    adModel,
    spl,
  );

  const spotifyMarquee =
    plan.marqueeSpend > 0 && cpl.marquee > 0
      ? (plan.marqueeSpend / cpl.marquee) * spl
      : 0;
  const spotifyShowcase =
    plan.showcaseSpend > 0 && cpl.showcase > 0
      ? (plan.showcaseSpend / cpl.showcase) * spl
      : 0;
  // Traffic only — awareness is reach-only (0 attributed streams).
  const meta =
    plan.metaTrafficSpend > 0 && funnel.cpc > 0
      ? (plan.metaTrafficSpend / funnel.cpc) *
        funnel.spotifyClickShare *
        streamsPerClickEffective
      : 0;

  const spotifyTotal = spotifyMarquee + spotifyShowcase;
  return {
    spotifyMarquee,
    spotifyShowcase,
    spotifyTotal,
    meta,
    metaAwarenessSpend: Math.max(0, plan.metaAwarenessSpend),
    grandTotal: spotifyTotal + meta,
    splUsed: spl,
    splSource: source,
    metaStreamsPerSpotifyClickEffective: streamsPerClickEffective,
    metaCostPerStream:
      meta > 0 && plan.metaTrafficSpend > 0
        ? plan.metaTrafficSpend / meta
        : null,
  };
}

/**
 * UI Meta funnel from active adModel — CPC/share/streams, not META_DELIVERY_PER_OBJECTIVE.
 */
export function computeAdMetaFunnelDisplay(
  spend: number,
  artistName: string,
  genre: Genre,
  adModel: AdModel,
): AdMetaFunnelDisplay {
  const totals = computeAdAttributedTotals(
    {
      artistName,
      genre,
      marqueeSpend: 0,
      showcaseSpend: 0,
      metaTrafficSpend: Math.max(0, spend),
      metaAwarenessSpend: 0,
      campaignStartOffsetDays: 0,
      metaDurationDays: DEFAULT_META_DURATION_DAYS,
    },
    adModel,
  );
  const cpc = adModel.metaFunnel.cpc;
  const spotifyClickShare = adModel.metaFunnel.spotifyClickShare;
  const projectedClicks = spend > 0 && cpc > 0 ? spend / cpc : 0;
  const projectedSpotifyClicks = projectedClicks * spotifyClickShare;

  return {
    cpc,
    spotifyClickShare,
    streamsPerSpotifyClickEffective: totals.metaStreamsPerSpotifyClickEffective,
    projectedClicks,
    projectedSpotifyClicks,
    projectedStreams: totals.meta,
    costPerStream: totals.metaCostPerStream,
    confidence: adModel.metaFunnel.confidence,
    splUsed: totals.splUsed,
    splSource: totals.splSource,
    cplMarquee: adModel.spotifyCpl.marquee,
    cplShowcase: adModel.spotifyCpl.showcase,
  };
}

/**
 * Awareness impressions/reach from adModel.metaAwareness.
 * impressions = spend/cpm×1000; reach = spend/cost_per_reach. Streams always 0.
 */
export function computeAdAwarenessDisplay(
  spend: number,
  adModel: AdModel,
): AdAwarenessDisplay {
  const { cpm, costPerReach, confidence } = adModel.metaAwareness;
  const safeSpend = Math.max(0, spend);
  return {
    cpm,
    costPerReach,
    projectedImpressions:
      safeSpend > 0 && cpm > 0 ? (safeSpend / cpm) * 1000 : 0,
    projectedReach:
      safeSpend > 0 && costPerReach > 0 ? safeSpend / costPerReach : 0,
    confidence,
  };
}

/**
 * Front-loaded weights over `duration` days: duration, duration-1, …, 1.
 * Even spread when mode is "even".
 */
export function campaignDayWeights(
  duration: number,
  mode: "front-loaded" | "even",
): number[] {
  const d = Math.max(1, Math.trunc(duration));
  if (mode === "even") {
    return Array.from({ length: d }, () => 1 / d);
  }
  const raw = Array.from({ length: d }, (_, i) => d - i);
  const sum = raw.reduce((a, b) => a + b, 0);
  return raw.map((w) => w / sum);
}

/** Largest-remainder allocation so daily ints sum to round(total). */
export function allocateDailyStreams(
  total: number,
  startDay: number,
  duration: number,
  mode: "front-loaded" | "even",
  windowDays = CAMPAIGN_WINDOW_DAYS,
): number[] {
  const daily = Array.from({ length: windowDays }, () => 0);
  const roundedTotal = Math.round(total);
  if (roundedTotal <= 0) return daily;

  const start = clampInt(startDay, 1, windowDays);
  const maxDuration = windowDays - start + 1;
  const dur = clampInt(duration, 1, maxDuration);
  const weights = campaignDayWeights(dur, mode);
  const exact = weights.map((w) => roundedTotal * w);
  const floors = exact.map((v) => Math.floor(v));
  let remainder = roundedTotal - floors.reduce((a, b) => a + b, 0);
  const order = exact
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac);
  for (let k = 0; k < remainder; k++) {
    floors[order[k % order.length]!.i]! += 1;
  }
  for (let i = 0; i < dur; i++) {
    daily[start - 1 + i] = floors[i]!;
  }
  return daily;
}

export function buildAdDailyLayer(
  plan: AdSpendPlan,
  adModel: AdModel,
  organicWeek1Streams: number,
): AdDailyLayer {
  const totals = computeAdAttributedTotals(plan, adModel);
  const startDay = 1 + Math.max(0, Math.trunc(plan.campaignStartOffsetDays));

  const marqueeDaily = allocateDailyStreams(
    totals.spotifyMarquee,
    startDay,
    DEFAULT_MARQUEE_DURATION_DAYS,
    "front-loaded",
  );
  const showcaseDaily = allocateDailyStreams(
    totals.spotifyShowcase,
    startDay,
    DEFAULT_SHOWCASE_DURATION_DAYS,
    "even",
  );
  const metaDaily = allocateDailyStreams(
    totals.meta,
    startDay,
    plan.metaDurationDays > 0
      ? plan.metaDurationDays
      : DEFAULT_META_DURATION_DAYS,
    "even",
  );

  const week1AdMarquee = marqueeDaily
    .slice(0, 7)
    .reduce((sum, v) => sum + v, 0);
  const week1AdShowcase = showcaseDaily
    .slice(0, 7)
    .reduce((sum, v) => sum + v, 0);
  const week1AdMeta = metaDaily.slice(0, 7).reduce((sum, v) => sum + v, 0);
  const week1AdTotal = week1AdMarquee + week1AdShowcase + week1AdMeta;

  return {
    totals,
    plan,
    marqueeDaily,
    showcaseDaily,
    metaDaily,
    week1WithAds: organicWeek1Streams + week1AdTotal,
    week1AdMarquee,
    week1AdShowcase,
    week1AdMeta,
    week1AdTotal,
  };
}

/**
 * Build spend plan from release fields.
 * - Spotify: falls back to spotify_spend_planned + format when marquee/showcase unset.
 * - Meta: prefers meta_traffic / meta_awareness spends; else splits meta_spend_planned
 *   by objective so awareness is never silently funneled.
 */
export function adSpendPlanFromRelease(release: {
  artist_name: string;
  genre: Genre;
  spotify_format: SpotifyFormat;
  spotify_spend_planned: number;
  meta_spend_planned: number;
  meta_objective?: MetaObjective | string | null;
  meta_traffic_spend_planned?: number | null;
  meta_awareness_spend_planned?: number | null;
  spotify_marquee_spend_planned?: number | null;
  spotify_showcase_spend_planned?: number | null;
  campaign_start_offset_days?: number | null;
  campaign_duration_days?: number | null;
}): AdSpendPlan {
  let marquee = release.spotify_marquee_spend_planned ?? null;
  let showcase = release.spotify_showcase_spend_planned ?? null;

  if (
    (marquee == null || marquee === 0) &&
    (showcase == null || showcase === 0) &&
    release.spotify_spend_planned > 0
  ) {
    if (release.spotify_format === "showcase") {
      showcase = release.spotify_spend_planned;
      marquee = 0;
    } else {
      marquee = release.spotify_spend_planned;
      showcase = 0;
    }
  }

  let traffic = release.meta_traffic_spend_planned ?? null;
  let awareness = release.meta_awareness_spend_planned ?? null;
  if (
    (traffic == null || traffic === 0) &&
    (awareness == null || awareness === 0) &&
    release.meta_spend_planned > 0
  ) {
    const split = splitMetaSpendByObjective(
      release.meta_spend_planned,
      release.meta_objective,
    );
    traffic = split.trafficSpend;
    awareness = split.awarenessSpend;
  }

  return {
    artistName: release.artist_name,
    genre: release.genre,
    marqueeSpend: Math.max(0, marquee ?? 0),
    showcaseSpend: Math.max(0, showcase ?? 0),
    metaTrafficSpend: Math.max(0, traffic ?? 0),
    metaAwarenessSpend: Math.max(0, awareness ?? 0),
    campaignStartOffsetDays: Math.max(
      0,
      release.campaign_start_offset_days ?? 0,
    ),
    metaDurationDays: Math.max(
      1,
      release.campaign_duration_days ?? DEFAULT_META_DURATION_DAYS,
    ),
  };
}
