/** Monthly-listener thresholds for artist tier (used across forecast + monitoring). */
export const TIER_ML_THRESHOLDS = {
  mid: 500_000,
  established: 2_000_000,
} as const;

/** Minimum closed releases for retrain guardrail (mirrors retrain/config.py MIN_SAMPLE_SIZE). */
export const RETRAIN_MIN_SAMPLE_SIZE = 40;

/**
 * Archive progress-card denominator: new eligible closes since last retrain
 * before the UI shows [ELIGIBLE]. Soft threshold (RETRAINING.md rule of thumb).
 */
export const RETRAIN_THRESHOLD = 10;

/**
 * Minimum forward-bias improvement for new_beats_live (approve HARD gate).
 * Required on both all + clean: |live| − |new| ≥ this value (bias fraction;
 * 0.01 = one percentage point). Filters float noise / no-op refits where
 * new ≈ live within ~1e-15.
 */
export const FORWARD_BIAS_MIN_IMPROVEMENT = 0.01;

/**
 * Initial seed for the archive retrain-progress cutoff (ISO).
 * Runtime cutoff = max(this, max active model_coefficients.fitted_at).
 * Live promotes stamp fitted_at = promote time; do not bump this for future
 * retrains — only keep as fallback if active fitted_at is missing/older.
 */
export const RETRAIN_LAST_AT = "2026-07-27T05:20:00.000Z";

export const GENRES = [
  "dubstep",
  "house",
  "melodic-bass",
  "downtempo",
  "big-room",
] as const;

/** Paid-media objectives: awareness (reach-only), traffic (click funnel), streaming (Spotify SPL). */
export const META_OBJECTIVES = [
  "awareness",
  "traffic",
  "streaming",
] as const;

/** Catalog release role (form + magnitude at lock; curve shape unchanged). */
export const RELEASE_TYPES = [
  "single",
  "lead_single",
  "focus_track",
  "album_track",
  "alternate_version",
] as const;

export const RELEASE_TYPE_LABELS: Record<(typeof RELEASE_TYPES)[number], string> = {
  single: "Standalone single",
  lead_single: "Lead single (pre-album)",
  focus_track: "Focus track (album lead)",
  album_track: "Album track",
  alternate_version: "Alternate version (remix/reimagining)",
};

/**
 * Scales locked wk1 streams + saves at create time (save-rate unchanged).
 * Does not alter curve shape. Existing locked rows are not retroactively updated.
 *
 * Retrain-owned: median (actual_wk1 / locked_forecast_streams) vs single/lead
 * reference, then k=5 shrinkage toward 1.0
 * (see retrain/fit.py derive_release_type_magnitude_multipliers).
 */
// RETRAIN:RELEASE_TYPE_MAGNITUDE_MULTIPLIER:START
export const RELEASE_TYPE_MAGNITUDE_MULTIPLIER = {
  single: 1.0,
  lead_single: 1.0,
  focus_track: 1.06,
  album_track: 0.87,
  alternate_version: 0.82
} as const;
// RETRAIN:RELEASE_TYPE_MAGNITUDE_MULTIPLIER:END

export const SPOTIFY_FORMATS = [
  "marquee",
  "showcase",
] as const;

/** Expected Spotify editorial coverage at lock time (forecast input 0–3). */
export const EDITORIAL_TIER_DEFINITIONS = {
  0: {
    label: "None",
    description: "No editorial coverage of any kind.",
  },
  1: {
    label: "Small",
    description:
      "1-2 placements on smaller editorial playlists (genre-specific, regional, niche). Not on flagship playlists.",
  },
  2: {
    label: "Medium",
    description:
      "A few placements including at least one prominent placement (mid-tier editorial cover slot), or multiple smaller placements totaling meaningful reach.",
  },
  3: {
    label: "Large",
    description:
      "Major coverage: New Music Friday placement, flagship editorial cover slot, or OOH/billboard support tied to the release.",
  },
} as const;

export type EditorialTierValue = keyof typeof EDITORIAL_TIER_DEFINITIONS;

export const EDITORIAL_TIER_VALUES = [0, 1, 2, 3] as const satisfies readonly EditorialTierValue[];

/** Options for editorial-tier ToggleGroup labels (descriptions shown separately). */
export const EDITORIAL_TIER_TOGGLE_OPTIONS = EDITORIAL_TIER_VALUES.map((tier) => ({
  value: tier,
  label: `${tier}: ${EDITORIAL_TIER_DEFINITIONS[tier].label}`,
}));

/**
 * Calendar day-of-week multipliers (mean=1 over a week). Applied on top of
 * STREAM_CURVE_TREND so non-Thursday releases get the right Fri/Sun shape.
 * Retrain-owned (see retrain/fit.py derive_dow_multiplier).
 */
// RETRAIN:STREAM_DOW_MULTIPLIER:START
export const STREAM_DOW_MULTIPLIER = {
  Mon: 0.916,
  Tue: 0.984,
  Wed: 1.019,
  Thu: 1.034,
  Fri: 1.265,
  Sat: 0.965,
  Sun: 0.817
} as const;
// RETRAIN:STREAM_DOW_MULTIPLIER:END

/** ISO weekday Mon=1 … Sun=7 → STREAM_DOW_MULTIPLIER value. */
export const STREAM_DOW_MULTIPLIER_BY_ISO: readonly number[] = [
  Number.NaN, // unused (1-based)
  STREAM_DOW_MULTIPLIER.Mon,
  STREAM_DOW_MULTIPLIER.Tue,
  STREAM_DOW_MULTIPLIER.Wed,
  STREAM_DOW_MULTIPLIER.Thu,
  STREAM_DOW_MULTIPLIER.Fri,
  STREAM_DOW_MULTIPLIER.Sat,
  STREAM_DOW_MULTIPLIER.Sun,
] as const;

/** New Music Friday bump (% of wk1). Index 0 = editorial Friday. */
// RETRAIN:STREAM_EDITORIAL_KERNEL:START
export const STREAM_EDITORIAL_KERNEL = [15.57, 7.50] as const;
// RETRAIN:STREAM_EDITORIAL_KERNEL:END

/**
 * Seasonless trend (% of wk1). Recompose as
 * trend[d] × dow(release, d) + editorialKernel, then rescale wk1 to 100.
 * Retrain-owned (see retrain/fit.py derive_stream_curve_trend).
 * Index 0 = day 1 … index 27 = day 28.
 */
// RETRAIN:STREAM_CURVE_TREND:START
export const STREAM_CURVE_TREND = {
  median: [
    7.6, 6.8, 13.2, 13.3, 12.6, 12.6, 12.5, 9.0, 8.6, 8.0, 8.9, 8.7, 8.0,
      7.6, 6.5, 7.5, 6.9, 7.1, 6.9, 6.6, 5.5, 5.5, 5.5, 5.5, 5.5, 5.5,
      5.5, 5.5
  ],
  p25: [
    5.7, 5.2, 11.2, 11.3, 11.8, 11.2, 11.1, 7.4, 6.9, 6.1, 6.3, 6.2, 5.8,
      5.5, 5.2, 4.8, 4.7, 4.8, 4.8, 4.7, 4.7, 4.7, 4.7, 4.7, 4.7, 4.7,
      4.7, 4.7
  ],
  p75: [
    10.2, 8.1, 13.9, 15.3, 13.9, 14.0, 13.9, 10.7, 10.4, 10.4, 10.4, 10.3, 10.1,
      9.2, 8.9, 9.1, 9.0, 8.8, 8.6, 8.3, 8.2, 8.2, 8.2, 8.2, 8.2, 8.2,
      8.2, 8.2
  ]
} as const;
// RETRAIN:STREAM_CURVE_TREND:END

/** Thursday release ISO weekday (compose view for STREAM_CURVE_BASELINE). */
const THURSDAY_RELEASE_ISO_WEEKDAY = 4;
/** Editorial day-number for a Thursday release (first Friday = day 2). */
const THURSDAY_EDITORIAL_OFFSET = 2;

function composeThursdayBaseline(trend: readonly number[]): number[] {
  const composed = trend.map((trendPct, index) => {
    const dayNumber = index + 1;
    const iso =
      ((THURSDAY_RELEASE_ISO_WEEKDAY - 1 + dayNumber - 1) % 7) + 1;
    const dow = STREAM_DOW_MULTIPLIER_BY_ISO[iso]!;
    const kernelIndex = dayNumber - THURSDAY_EDITORIAL_OFFSET;
    const editorial =
      kernelIndex >= 0 && kernelIndex < STREAM_EDITORIAL_KERNEL.length
        ? STREAM_EDITORIAL_KERNEL[kernelIndex]!
        : 0;
    return trendPct * dow + editorial;
  });

  const week1Sum = composed.slice(0, 7).reduce((sum, pct) => sum + pct, 0);
  if (week1Sum <= 0) {
    return composed;
  }
  const scale = 100 / week1Sum;
  return composed.map((pct, index) => (index < 7 ? pct * scale : pct));
}

/**
 * Derived Thursday compose view: trend × DOW + editorial kernel, wk1-rescaled.
 * Not retrain-synced — rebuilds from STREAM_CURVE_TREND components.
 */
export const STREAM_CURVE_BASELINE = {
  median: composeThursdayBaseline(STREAM_CURVE_TREND.median),
  p25: composeThursdayBaseline(STREAM_CURVE_TREND.p25),
  p75: composeThursdayBaseline(STREAM_CURVE_TREND.p75),
};

/** @deprecated Use STREAM_CURVE_BASELINE — alias kept for older call sites. */
export const STREAM_CURVE_TEMPLATE = STREAM_CURVE_BASELINE;

export type CurvePercentile = keyof typeof STREAM_CURVE_BASELINE;

export const META_RATES_BY_GENRE = {
  dubstep: 0.24,
  "melodic-bass": 0.24,
  house: 2.73,
  "big-room": 2.73,
  downtempo: 14.69,
} as const;

export const META_OBJECTIVE_MULTIPLIERS = {
  traffic: 1.0,
  awareness: 21.4,
  /** Streaming uses Spotify SPL path; multiplier unused for Meta funnel. */
  streaming: 1.0,
} as const;

export const META_DELIVERY_PER_OBJECTIVE = {
  traffic: { cpm: 3.83, cpr: 6.91, cpc: 0.1 },
  awareness: { cpm: 4.3, cpr: 6.58, cpc: 2.14 },
  /** Reach-style delivery retained for display; attributed streams = 0 in ad layer. */
  streaming: { cpm: 2.09, cpr: 2.18, cpc: 0.89 },
} as const;

/**
 * Share of Meta clicks that convert to Spotify streams, by genre.
 * Not yet calibrated from catalog — update when Meta-to-Spotify attribution
 * data is available in the retrain pipeline.
 */
export const META_CLICK_TO_STREAM_CONVERSION: Record<
  (typeof GENRES)[number],
  number
> = {
  house: 0.15,
  dubstep: 0.18,
  "melodic-bass": 0.17,
  downtempo: 0.12,
  "big-room": 0.14,
};

/** Save-rate health benchmarks (%), used by flags/monitoring, not forecast math. */
// RETRAIN:SAVE_RATE_BANDS:START
export const SAVE_RATE_BANDS = {
  dubstep: { lo: 7.9, hi: 15.9 },
  house: { lo: 4.4, hi: 13.7 },
  "melodic-bass": { lo: 6.5, hi: 16 },
  downtempo: { lo: 4.9, hi: 18.6 },
  "big-room": { lo: 4.5, hi: 16 }
} as const;
// RETRAIN:SAVE_RATE_BANDS:END

/** Algorithmic positioning thresholds (week-1 save counts) by artist tier. */
// RETRAIN:SAVE_COUNT_BANDS:START
export const SAVE_COUNT_BANDS = {
  developing: { p25: 3641, p50: 7556, p75: 10896, p90: 10933 },
  mid: { p25: 5137, p50: 10012, p75: 26400, p90: 34551 },
  established: { p25: 5137, p50: 10012, p75: 26400, p90: 34551 }
} as const;
// RETRAIN:SAVE_COUNT_BANDS:END

export { GENRE_PLAYBOOKS, type GenrePlaybook } from "@/lib/constants/playbooks";
