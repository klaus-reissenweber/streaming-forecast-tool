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

export const RELEASE_TYPES = [
  "single",
  "ep",
  "album",
] as const;

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

/** % of week-1 streams by day (index 0 = day 1 … index 27 = day 28). */
export const STREAM_CURVE_TEMPLATE = {
  median: [
    0.5, 27.2, 16.0, 11.7, 13.6, 14.0, 14.4, 14.4, 12.5, 9.3, 7.4, 8.6, 10.3,
    9.5, 9.5, 9.8, 8.1, 6.4, 7.4, 7.3, 7.8, 7.7, 8.1, 7.4, 6.2, 6.6, 7.4, 7.6,
  ],
  p25: [
    0.2, 23.3, 14.9, 10.8, 12.3, 12.2, 12.4, 12.9, 10.9, 7.8, 6.1, 6.3, 6.9, 6.9,
    7.0, 8.2, 6.1, 5.0, 5.6, 6.0, 6.5, 6.4, 6.5, 5.2, 4.0, 4.2, 4.8, 4.8,
  ],
  p75: [
    0.7, 31.7, 18.2, 13.5, 15.5, 15.4, 17.1, 16.3, 14.5, 12.3, 9.8, 10.6, 11.7,
    10.7, 10.7, 13.1, 10.2, 8.2, 9.5, 10.1, 10.6, 10.2, 12.5, 10.2, 7.4, 8.8, 9.3,
    9.7,
  ],
} as const;

export type CurvePercentile = keyof typeof STREAM_CURVE_TEMPLATE;

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
