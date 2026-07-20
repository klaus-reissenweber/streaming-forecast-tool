/** Monthly-listener thresholds for artist tier (used across forecast + monitoring). */
export const TIER_ML_THRESHOLDS = {
  mid: 500_000,
  established: 2_000_000,
} as const;

/** Minimum closed releases for retrain guardrail (mirrors retrain/config.py MIN_SAMPLE_SIZE). */
export const RETRAIN_MIN_SAMPLE_SIZE = 40;

export const GENRES = [
  "dubstep",
  "house",
  "melodic-bass",
  "downtempo",
  "big-room",
] as const;

export const META_OBJECTIVES = [
  "traffic",
  "awareness",
  "reach",
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
  focus_track: 1.03,
  album_track: 1.0,
  alternate_version: 0.87,
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
 * Release-anchored organic launch/decay (% of wk1), editorial-free.
 * Index 0 = day 1 … index 27 = day 28. Day 28 is a d27 carry-forward
 * (no calibration source); golden fixtures assert d1–d27 only.
 * Seeded from Elderbrook Thursday reference; p25/p75 = median until retrain.
 */
export const STREAM_CURVE_BASELINE = {
  median: [
    6.37, 7.21, 8.05, 8.9, 13.58, 14.89, 14.19, 13.78, 11.18, 7.48, 5.36, 6.69,
    6.74, 6.45, 5.6, 6.07, 4.92, 3.68, 4.47, 4.89, 4.63, 4.71, 5.81, 4.12, 2.83,
    3.29, 3.62, 3.62,
  ],
  p25: [
    6.37, 7.21, 8.05, 8.9, 13.58, 14.89, 14.19, 13.78, 11.18, 7.48, 5.36, 6.69,
    6.74, 6.45, 5.6, 6.07, 4.92, 3.68, 4.47, 4.89, 4.63, 4.71, 5.81, 4.12, 2.83,
    3.29, 3.62, 3.62,
  ],
  p75: [
    6.37, 7.21, 8.05, 8.9, 13.58, 14.89, 14.19, 13.78, 11.18, 7.48, 5.36, 6.69,
    6.74, 6.45, 5.6, 6.07, 4.92, 3.68, 4.47, 4.89, 4.63, 4.71, 5.81, 4.12, 2.83,
    3.29, 3.62, 3.62,
  ],
} as const;

/**
 * Calendar day-of-week multipliers (mean=1 over a week). Applied on top of
 * STREAM_CURVE_TREND so non-Thursday releases get the right Fri/Sun shape.
 */
export const STREAM_DOW_MULTIPLIER = {
  Mon: 0.912,
  Tue: 0.971,
  Wed: 0.982,
  Thu: 1.099,
  Fri: 1.262,
  Sat: 0.983,
  Sun: 0.814,
} as const;

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

/** Elderbrook calibration release weekday (Thursday). */
const ELDERBROOK_RELEASE_ISO_WEEKDAY = 4;

function deseasonalizeBaseline(
  baseline: readonly number[],
  releaseIsoWeekday: number,
): number[] {
  return baseline.map((pct, index) => {
    const dayNumber = index + 1;
    const iso =
      ((releaseIsoWeekday - 1 + dayNumber - 1) % 7) + 1;
    const mult = STREAM_DOW_MULTIPLIER_BY_ISO[iso]!;
    return pct / mult;
  });
}

/**
 * Seasonless trend (% of wk1): STREAM_CURVE_BASELINE ÷ Elderbrook-Thursday DOW.
 * Recompose as trend[d] × dow(release, d) + editorialKernel.
 */
export const STREAM_CURVE_TREND = {
  median: deseasonalizeBaseline(
    STREAM_CURVE_BASELINE.median,
    ELDERBROOK_RELEASE_ISO_WEEKDAY,
  ),
  p25: deseasonalizeBaseline(
    STREAM_CURVE_BASELINE.p25,
    ELDERBROOK_RELEASE_ISO_WEEKDAY,
  ),
  p75: deseasonalizeBaseline(
    STREAM_CURVE_BASELINE.p75,
    ELDERBROOK_RELEASE_ISO_WEEKDAY,
  ),
} as const;

/** New Music Friday bump (% of wk1). Index 0 = editorial Friday. */
export const STREAM_EDITORIAL_KERNEL = [21.33, 5.49] as const;

/** @deprecated Use STREAM_CURVE_BASELINE — kept as alias for retrain sync until fast-follow. */
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
  reach: 8.9,
} as const;

export const META_DELIVERY_PER_OBJECTIVE = {
  traffic: { cpm: 3.83, cpr: 6.91, cpc: 0.1 },
  awareness: { cpm: 4.3, cpr: 6.58, cpc: 2.14 },
  reach: { cpm: 2.09, cpr: 2.18, cpc: 0.89 },
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
export const SAVE_RATE_BANDS = {
  dubstep: { lo: 17, hi: 22 },
  "melodic-bass": { lo: 13, hi: 23 },
  house: { lo: 9, hi: 16 },
  "big-room": { lo: 5, hi: 10 },
  downtempo: { lo: 10, hi: 16 },
} as const;

/** Algorithmic positioning thresholds (week-1 save counts) by artist tier. */
export const SAVE_COUNT_BANDS = {
  developing: { p25: 3018, p50: 5341, p75: 9101, p90: 13116 },
  mid: { p25: 7545, p50: 12284, p75: 22628, p90: 42747 },
  established: { p25: 19038, p50: 32482, p75: 53399, p90: 71510 },
} as const;

export { GENRE_PLAYBOOKS, type GenrePlaybook } from "@/lib/constants/playbooks";
