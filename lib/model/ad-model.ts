/**
 * Ad-spend response model (spec §3) — additive payload block on ActiveModel.
 * Spotify CPL/SPL are measured from ad_spotify_campaigns; Meta funnel is an estimate.
 */

import { coerceMetaObjective } from "@/lib/meta-objective";

export const AD_SPL_SHRINKAGE_K = 5;
export const AD_SPL_GLOBAL_FALLBACK = 2.65;
export const AD_META_SPOTIFY_CLICK_SHARE_DEFAULT = 0.45;
export const AD_META_STREAMS_PER_SPOTIFY_CLICK = 1.2;
/** Fit from master-release-campaigns.csv (n=168 usable spend+imps+reach). */
export const AD_META_AWARENESS_CPM = 3.7;
export const AD_META_AWARENESS_COST_PER_REACH = 0.0053;

export type AdFormat = "marquee" | "showcase";
export type AdGenre =
  | "dubstep"
  | "house"
  | "melodic-bass"
  | "downtempo"
  | "big-room";

export type AdModel = {
  spotifyCpl: Record<AdFormat, number>;
  /** Shrunk per-artist SPL (streams per converted listener). */
  spotifySplByArtist: Record<string, number>;
  /** Genre-level SPL priors (unshrunk medians). */
  spotifySplByGenre: Partial<Record<AdGenre, number>>;
  spotifySplGlobal: number;
  spotifySplShrinkageK: number;
  metaFunnel: {
    cpc: number;
    spotifyClickShare: number;
    /**
     * Tunable global base (~1.2). Forecast-time effective value scales by
     * resolved SPL / spotifySplGlobal — not a per-artist stored constant.
     */
    streamsPerSpotifyClickBase: number;
    confidence: "estimate";
  };
  /** Awareness / reach-only Meta rates (0 attributed streams). */
  metaAwareness: {
    cpm: number;
    costPerReach: number;
    confidence: "estimate";
  };
  sampleSizes: {
    spotifyUsable: number;
    cplMarquee: number;
    cplShowcase: number;
    splArtists: number;
    metaCpc: number;
    metaSpotifyClickShare: number;
    metaAwareness: number;
  };
};

/** Spec seed / cold-start defaults (pre-fit). */
export const SEED_AD_MODEL: AdModel = {
  spotifyCpl: { marquee: 0.49, showcase: 0.35 },
  spotifySplByArtist: {},
  spotifySplByGenre: {},
  spotifySplGlobal: AD_SPL_GLOBAL_FALLBACK,
  spotifySplShrinkageK: AD_SPL_SHRINKAGE_K,
  metaFunnel: {
    cpc: 0.15,
    spotifyClickShare: AD_META_SPOTIFY_CLICK_SHARE_DEFAULT,
    streamsPerSpotifyClickBase: AD_META_STREAMS_PER_SPOTIFY_CLICK,
    confidence: "estimate",
  },
  metaAwareness: {
    cpm: AD_META_AWARENESS_CPM,
    costPerReach: AD_META_AWARENESS_COST_PER_REACH,
    confidence: "estimate",
  },
  sampleSizes: {
    spotifyUsable: 0,
    cplMarquee: 0,
    cplShowcase: 0,
    splArtists: 0,
    metaCpc: 0,
    metaSpotifyClickShare: 0,
    metaAwareness: 0,
  },
};

export type MetaAwarenessFitRow = {
  spendUsd: number | null;
  impressions: number | null;
  reach: number | null;
};

export type SpotifyCampaignFitRow = {
  artist: string;
  format: AdFormat;
  spendUsd: number | null;
  convertedListeners: number | null;
  estAttributedStreams: number | null;
  usableForModeling: boolean;
};

export type MetaCampaignFitRow = {
  releaseKey: string;
  /**
   * Normalized objective: awareness | traffic | streaming.
   * Funnel (cpc, click share) is fit from traffic rows only.
   */
  objective: "awareness" | "traffic" | "streaming" | null;
  /** Meta spend_usd — CPC numerator. */
  spendUsd: number | null;
  /** Meta link_clicks — CPC denominator. */
  linkClicks: number | null;
  /**
   * (Spotify + Spotify Pre-Release click-throughs) / total click-throughs
   * for a normal multi-service landing page. Null if unknown.
   */
  spotifyClickShare: number | null;
  /**
   * Spotify-first auto-routing Linkfire pages (~100% CTR / ~0% bounce /
   * 0 on-page streams). Excluded from spotify_click_share median.
   */
  isAutoRouter: boolean;
};

/** Known Spotify-first auto-routers (bias click-share toward 1.0). */
export const AUTO_ROUTER_RELEASE_KEYS = new Set([
  "movement",
  "eyes cut deeper",
  "fall back to nothing",
]);

/** Heuristic twin of the named auto-routers (CTR≈100, bounce≈0, streams=0). */
export function isLinkfireAutoRouter(options: {
  releaseKey?: string | null;
  ctrPct?: number | null;
  bounceRatePct?: number | null;
  streams?: number | null;
}): boolean {
  const key = (options.releaseKey ?? "").trim().toLowerCase();
  if (key && AUTO_ROUTER_RELEASE_KEYS.has(key)) return true;
  const ctr = options.ctrPct;
  const bounce = options.bounceRatePct;
  const streams = options.streams;
  if (ctr == null || bounce == null) return false;
  const zeroStreams = streams == null || streams === 0;
  return ctr >= 99 && bounce <= 1 && zeroStreams;
}

export type AdModelFitDetail = {
  model: AdModel;
  /** Raw (unshrunk) per-artist median SPL + n, for review tables. */
  artistRaw: Array<{
    artist: string;
    genre: AdGenre | null;
    n: number;
    rawSpl: number;
    shrunkSpl: number;
    prior: number;
  }>;
  metaReview: {
    /** CPC samples = spend_usd / link_clicks (traffic objective only). */
    cpcValues: number[];
    /** Click-share samples after excluding auto-routers (traffic only). */
    clickShareValues: number[];
    excludedAutoRouters: string[];
    /** Rows skipped because objective ≠ traffic (after normalize). */
    excludedNonTraffic: number;
    awarenessCpmValues: number[];
    awarenessCostPerReachValues: number[];
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireFinite(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`ad_model.${label} must be a finite number`);
  }
  return value;
}

/** Median of a nonempty finite array (sorts a copy). */
export function median(values: number[]): number {
  if (values.length === 0) {
    throw new Error("median() requires a nonempty array");
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Empirical Bayes shrink toward prior: (n * raw + k * prior) / (n + k). */
export function shrinkTowardPrior(
  raw: number,
  n: number,
  prior: number,
  k: number,
): number {
  return (n * raw + k * prior) / (n + k);
}

/** Normalize artist keys for campaign↔release genre joins. */
export function normalizeArtistKey(artist: string): string {
  return artist
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

const GENRE_SET = new Set<AdGenre>([
  "dubstep",
  "house",
  "melodic-bass",
  "downtempo",
  "big-room",
]);

function asGenre(raw: string | null | undefined): AdGenre | null {
  if (!raw) return null;
  return GENRE_SET.has(raw as AdGenre) ? (raw as AdGenre) : null;
}

export function parseAdModel(raw: unknown): AdModel {
  if (!isRecord(raw)) {
    return {
      ...SEED_AD_MODEL,
      spotifyCpl: { ...SEED_AD_MODEL.spotifyCpl },
      metaFunnel: { ...SEED_AD_MODEL.metaFunnel },
      metaAwareness: { ...SEED_AD_MODEL.metaAwareness },
      sampleSizes: { ...SEED_AD_MODEL.sampleSizes },
    };
  }

  const cplRaw = isRecord(raw.spotify_cpl) ? raw.spotify_cpl : {};
  const artistRaw = isRecord(raw.spotify_spl_by_artist)
    ? raw.spotify_spl_by_artist
    : {};
  const genreRaw = isRecord(raw.spotify_spl_by_genre)
    ? raw.spotify_spl_by_genre
    : {};
  const funnelRaw = isRecord(raw.meta_funnel) ? raw.meta_funnel : {};
  const awarenessRaw = isRecord(raw.meta_awareness) ? raw.meta_awareness : {};
  const samplesRaw = isRecord(raw.sample_sizes) ? raw.sample_sizes : {};

  const spotifySplByArtist: Record<string, number> = {};
  for (const [artist, value] of Object.entries(artistRaw)) {
    if (typeof value === "number" && Number.isFinite(value)) {
      spotifySplByArtist[artist] = value;
    }
  }

  const spotifySplByGenre: Partial<Record<AdGenre, number>> = {};
  for (const genre of GENRE_SET) {
    const value = genreRaw[genre];
    if (typeof value === "number" && Number.isFinite(value)) {
      spotifySplByGenre[genre] = value;
    }
  }

  return {
    spotifyCpl: {
      marquee: requireFinite(
        cplRaw.marquee ?? SEED_AD_MODEL.spotifyCpl.marquee,
        "spotify_cpl.marquee",
      ),
      showcase: requireFinite(
        cplRaw.showcase ?? SEED_AD_MODEL.spotifyCpl.showcase,
        "spotify_cpl.showcase",
      ),
    },
    spotifySplByArtist,
    spotifySplByGenre,
    spotifySplGlobal: requireFinite(
      raw.spotify_spl_global ?? AD_SPL_GLOBAL_FALLBACK,
      "spotify_spl_global",
    ),
    spotifySplShrinkageK: requireFinite(
      raw.spotify_spl_shrinkage_k ?? AD_SPL_SHRINKAGE_K,
      "spotify_spl_shrinkage_k",
    ),
    metaFunnel: {
      cpc: requireFinite(
        funnelRaw.cpc ?? SEED_AD_MODEL.metaFunnel.cpc,
        "meta_funnel.cpc",
      ),
      spotifyClickShare: requireFinite(
        funnelRaw.spotify_click_share ?? AD_META_SPOTIFY_CLICK_SHARE_DEFAULT,
        "meta_funnel.spotify_click_share",
      ),
      streamsPerSpotifyClickBase: requireFinite(
        funnelRaw.streams_per_spotify_click_base ??
          funnelRaw.streams_per_spotify_click ??
          AD_META_STREAMS_PER_SPOTIFY_CLICK,
        "meta_funnel.streams_per_spotify_click_base",
      ),
      confidence: "estimate",
    },
    metaAwareness: {
      cpm: requireFinite(
        awarenessRaw.cpm ?? AD_META_AWARENESS_CPM,
        "meta_awareness.cpm",
      ),
      costPerReach: requireFinite(
        awarenessRaw.cost_per_reach ?? AD_META_AWARENESS_COST_PER_REACH,
        "meta_awareness.cost_per_reach",
      ),
      confidence: "estimate",
    },
    sampleSizes: {
      spotifyUsable: Number(samplesRaw.spotify_usable ?? 0),
      cplMarquee: Number(samplesRaw.cpl_marquee ?? 0),
      cplShowcase: Number(samplesRaw.cpl_showcase ?? 0),
      splArtists: Number(samplesRaw.spl_artists ?? 0),
      metaCpc: Number(samplesRaw.meta_cpc ?? 0),
      metaSpotifyClickShare: Number(samplesRaw.meta_spotify_click_share ?? 0),
      metaAwareness: Number(samplesRaw.meta_awareness ?? 0),
    },
  };
}

/** Snake_case payload fragment for model_coefficients.payload.ad_model. */
export function adModelToPayload(model: AdModel): Record<string, unknown> {
  return {
    spotify_cpl: {
      marquee: model.spotifyCpl.marquee,
      showcase: model.spotifyCpl.showcase,
    },
    spotify_spl_by_artist: { ...model.spotifySplByArtist },
    spotify_spl_by_genre: { ...model.spotifySplByGenre },
    spotify_spl_global: model.spotifySplGlobal,
    spotify_spl_shrinkage_k: model.spotifySplShrinkageK,
    meta_funnel: {
      cpc: model.metaFunnel.cpc,
      spotify_click_share: model.metaFunnel.spotifyClickShare,
      streams_per_spotify_click_base: model.metaFunnel.streamsPerSpotifyClickBase,
      confidence: "estimate",
    },
    meta_awareness: {
      cpm: model.metaAwareness.cpm,
      cost_per_reach: model.metaAwareness.costPerReach,
      confidence: "estimate",
    },
    sample_sizes: {
      spotify_usable: model.sampleSizes.spotifyUsable,
      cpl_marquee: model.sampleSizes.cplMarquee,
      cpl_showcase: model.sampleSizes.cplShowcase,
      spl_artists: model.sampleSizes.splArtists,
      meta_cpc: model.sampleSizes.metaCpc,
      meta_spotify_click_share: model.sampleSizes.metaSpotifyClickShare,
      meta_awareness: model.sampleSizes.metaAwareness,
    },
  };
}

/**
 * Fit ad_model from campaign rows + artist→genre map (normalized keys).
 * Genre map values are AdGenre strings keyed by normalizeArtistKey(artist).
 */
export function fitAdModel(options: {
  spotify: SpotifyCampaignFitRow[];
  meta: MetaCampaignFitRow[];
  /** Optional Meta awareness rows (spend + impressions + reach). */
  awareness?: MetaAwarenessFitRow[];
  artistGenreByKey: Map<string, AdGenre>;
  shrinkageK?: number;
  globalSplFallback?: number;
}): AdModelFitDetail {
  const k = options.shrinkageK ?? AD_SPL_SHRINKAGE_K;
  const globalFallback = options.globalSplFallback ?? AD_SPL_GLOBAL_FALLBACK;

  const usable = options.spotify.filter((r) => r.usableForModeling);

  const cplByFormat: Record<AdFormat, number[]> = {
    marquee: [],
    showcase: [],
  };
  const splByArtist = new Map<string, number[]>();
  const splByGenre = new Map<AdGenre, number[]>();
  const allSpl: number[] = [];

  for (const row of usable) {
    const listeners = row.convertedListeners;
    if (listeners == null || listeners <= 0) continue;

    if (row.spendUsd != null && row.spendUsd > 0) {
      cplByFormat[row.format].push(row.spendUsd / listeners);
    }

    if (row.estAttributedStreams != null && row.estAttributedStreams > 0) {
      const spl = row.estAttributedStreams / listeners;
      allSpl.push(spl);
      const list = splByArtist.get(row.artist) ?? [];
      list.push(spl);
      splByArtist.set(row.artist, list);

      const genre = options.artistGenreByKey.get(normalizeArtistKey(row.artist));
      if (genre) {
        const genreList = splByGenre.get(genre) ?? [];
        genreList.push(spl);
        splByGenre.set(genre, genreList);
      }
    }
  }

  const spotifyCpl: Record<AdFormat, number> = {
    marquee:
      cplByFormat.marquee.length > 0
        ? median(cplByFormat.marquee)
        : SEED_AD_MODEL.spotifyCpl.marquee,
    showcase:
      cplByFormat.showcase.length > 0
        ? median(cplByFormat.showcase)
        : SEED_AD_MODEL.spotifyCpl.showcase,
  };

  const spotifySplGlobal =
    allSpl.length > 0 ? median(allSpl) : globalFallback;

  const spotifySplByGenre: Partial<Record<AdGenre, number>> = {};
  for (const [genre, values] of splByGenre) {
    spotifySplByGenre[genre] = median(values);
  }

  const spotifySplByArtist: Record<string, number> = {};
  const artistRaw: AdModelFitDetail["artistRaw"] = [];

  for (const [artist, values] of [...splByArtist.entries()].sort((a, b) =>
    a[0].localeCompare(b[0]),
  )) {
    const n = values.length;
    const rawSpl = median(values);
    const genre = options.artistGenreByKey.get(normalizeArtistKey(artist)) ?? null;
    const prior =
      (genre ? spotifySplByGenre[genre] : undefined) ?? spotifySplGlobal;
    const shrunkSpl = shrinkTowardPrior(rawSpl, n, prior, k);
    spotifySplByArtist[artist] = shrunkSpl;
    artistRaw.push({ artist, genre, n, rawSpl, shrunkSpl, prior });
  }

  // Funnel rates from traffic-objective campaigns only (awareness excluded).
  const trafficMeta = options.meta.filter(
    (r) => coerceMetaObjective(r.objective, "traffic") === "traffic",
  );
  const excludedNonTraffic = options.meta.length - trafficMeta.length;

  // CPC := Meta spend_usd / link_clicks (not a stored CPC column).
  const cpcValues: number[] = [];
  for (const row of trafficMeta) {
    if (
      row.spendUsd != null &&
      row.spendUsd > 0 &&
      row.linkClicks != null &&
      row.linkClicks > 0
    ) {
      cpcValues.push(row.spendUsd / row.linkClicks);
    }
  }

  // Click-share over normal multi-service pages only (exclude auto-routers).
  const excludedAutoRouters = [
    ...new Set(
      trafficMeta.filter((r) => r.isAutoRouter).map((r) => r.releaseKey),
    ),
  ].sort();
  const shareValues = trafficMeta
    .filter((r) => !r.isAutoRouter)
    .map((r) => r.spotifyClickShare)
    .filter((v): v is number => v != null && Number.isFinite(v) && v > 0);

  const awarenessCpmValues: number[] = [];
  const awarenessCostPerReachValues: number[] = [];
  for (const row of options.awareness ?? []) {
    if (
      row.spendUsd != null &&
      row.spendUsd > 0 &&
      row.impressions != null &&
      row.impressions > 0
    ) {
      awarenessCpmValues.push((row.spendUsd / row.impressions) * 1000);
    }
    if (
      row.spendUsd != null &&
      row.spendUsd > 0 &&
      row.reach != null &&
      row.reach > 0
    ) {
      awarenessCostPerReachValues.push(row.spendUsd / row.reach);
    }
  }

  const model: AdModel = {
    spotifyCpl,
    spotifySplByArtist,
    spotifySplByGenre,
    spotifySplGlobal,
    spotifySplShrinkageK: k,
    metaFunnel: {
      cpc: cpcValues.length > 0 ? median(cpcValues) : SEED_AD_MODEL.metaFunnel.cpc,
      spotifyClickShare:
        shareValues.length > 0
          ? median(shareValues)
          : AD_META_SPOTIFY_CLICK_SHARE_DEFAULT,
      streamsPerSpotifyClickBase: AD_META_STREAMS_PER_SPOTIFY_CLICK,
      confidence: "estimate",
    },
    metaAwareness: {
      cpm:
        awarenessCpmValues.length > 0
          ? median(awarenessCpmValues)
          : AD_META_AWARENESS_CPM,
      costPerReach:
        awarenessCostPerReachValues.length > 0
          ? median(awarenessCostPerReachValues)
          : AD_META_AWARENESS_COST_PER_REACH,
      confidence: "estimate",
    },
    sampleSizes: {
      spotifyUsable: usable.length,
      cplMarquee: cplByFormat.marquee.length,
      cplShowcase: cplByFormat.showcase.length,
      splArtists: artistRaw.length,
      metaCpc: cpcValues.length,
      metaSpotifyClickShare: shareValues.length,
      metaAwareness: Math.min(
        awarenessCpmValues.length,
        awarenessCostPerReachValues.length,
      ),
    },
  };

  return {
    model,
    artistRaw,
    metaReview: {
      cpcValues,
      clickShareValues: shareValues,
      excludedAutoRouters,
      excludedNonTraffic,
      awarenessCpmValues,
      awarenessCostPerReachValues,
    },
  };
}
