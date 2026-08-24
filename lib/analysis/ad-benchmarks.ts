/**
 * RLM digital advertising benchmarks, 4 Nov 2025.
 *
 * Two things to know before reading the data:
 *
 * 1. Good and Excellent ranges OVERLAP in the source document. Bass traffic CPC
 *    is "Good $0.15–$0.35 / Excellent <$0.20", so $0.18 satisfies both.
 *    `classify` resolves this by checking Excellent first.
 *
 * 2. Direction matters. Lower is better for cost metrics, higher for rate
 *    metrics, and `excellent` is a threshold read in that direction.
 */

export type Surface =
  | "meta_awareness"      // TABLE 1 — inferred, needs confirmation
  | "meta_traffic"        // TABLE 2 — matches the $0.25 bass / $0.25–0.50 house citations
  | "meta_lpv"            // TABLE 3 — only table with cost per landing page view
  | "meta_sales"          // TABLE 4 — only table with ROAS and cost per purchase
  | "youtube_trueview"    // TABLE 5 — only table with view rate
  | "tiktok"              // TABLE 6 — only table with 6-second view rate
  | "spotify_marquee"     // TABLE 7 — higher targets than table 8
  | "spotify_showcase";   // TABLE 8

export type Genre = "bass" | "house";

/** Spotify benchmarks differ sharply by release format — Marquee CTR for an
 *  album averages 13.5% against 6.5% for a single. Never compare across them. */
export type Format = "single" | "album";

export type Metric =
  | "ctr" | "cpc" | "cpv" | "cplpv" | "cost_per_purchase" | "roas"
  | "view_rate" | "six_second_view_rate"
  | "conversion_rate" | "streams_per_listener" | "intent_rate"
  | "playlist_add_rate" | "save_rate";

export type Verdict = "excellent" | "good" | "outside";

export interface Benchmark {
  surface: Surface;
  /** Omitted on format-level references, which are not split by genre. */
  genre?: Genre;
  /** Set on Spotify surfaces only. */
  format?: Format;
  metric: Metric;
  /** Which direction is better. Cost metrics are "lower". */
  direction: "higher" | "lower";
  /** Inclusive Good range. Absent on point references that carry only an average. */
  good?: [number, number];
  /** Excellent threshold, read in `direction`. Omitted where the source gives none. */
  excellent?: number;
  /** Observed roster average from the benchmark document. Context, not a target. */
  observed?: number;
  /** A single reference figure rather than a range — the 2025 platform benchmark
   *  or the EDM average. Compare against it, do not band against it. */
  average?: number;
  source: "rlm_2025_11_04" | "spotify_2025" | "edm_avg";
}

const LOWER = "lower" as const;
const HIGHER = "higher" as const;

export const BENCHMARKS: Benchmark[] = [
  // TABLE 1 — surface inferred
  { surface:"meta_awareness", genre:"bass",  metric:"ctr", direction:HIGHER, good:[1.0,2.5], excellent:2.5 , source:"rlm_2025_11_04" },
  { surface:"meta_awareness", genre:"house", metric:"ctr", direction:HIGHER, good:[1.5,3.0], excellent:3.0 , source:"rlm_2025_11_04" },
  { surface:"meta_awareness", genre:"bass",  metric:"cpc", direction:LOWER,  good:[0.15,0.35], excellent:0.20 , source:"rlm_2025_11_04" },
  { surface:"meta_awareness", genre:"house", metric:"cpc", direction:LOWER,  good:[0.20,0.45], excellent:0.30 , source:"rlm_2025_11_04" },
  { surface:"meta_awareness", genre:"bass",  metric:"cpv", direction:LOWER,  good:[0.01,0.03], excellent:0.02 , source:"rlm_2025_11_04" },
  { surface:"meta_awareness", genre:"house", metric:"cpv", direction:LOWER,  good:[0.005,0.02], excellent:0.01 , source:"rlm_2025_11_04" },

  // TABLE 2 — Meta traffic
  { surface:"meta_traffic", genre:"bass",  metric:"ctr", direction:HIGHER, good:[1.5,3.0], excellent:3.0 , source:"rlm_2025_11_04" },
  { surface:"meta_traffic", genre:"house", metric:"ctr", direction:HIGHER, good:[2.5,4.0], excellent:4.0 , source:"rlm_2025_11_04" },
  { surface:"meta_traffic", genre:"bass",  metric:"cpc", direction:LOWER,  good:[0.25,0.40], excellent:0.25 , source:"rlm_2025_11_04" },
  { surface:"meta_traffic", genre:"house", metric:"cpc", direction:LOWER,  good:[0.25,0.50], excellent:0.30 , source:"rlm_2025_11_04" },

  // TABLE 3 — Meta landing page views
  { surface:"meta_lpv", genre:"bass",  metric:"ctr",   direction:HIGHER, good:[3.0,5.0], excellent:5.0 , source:"rlm_2025_11_04" },
  { surface:"meta_lpv", genre:"house", metric:"ctr",   direction:HIGHER, good:[4.0,7.0], excellent:7.0 , source:"rlm_2025_11_04" },
  { surface:"meta_lpv", genre:"bass",  metric:"cpc",   direction:LOWER,  good:[0.50,1.00], excellent:0.75 , source:"rlm_2025_11_04" },
  { surface:"meta_lpv", genre:"house", metric:"cpc",   direction:LOWER,  good:[0.25,0.50], excellent:0.40 , source:"rlm_2025_11_04" },
  { surface:"meta_lpv", genre:"bass",  metric:"cplpv", direction:LOWER,  good:[1.00,1.50], excellent:1.00 , source:"rlm_2025_11_04" },
  { surface:"meta_lpv", genre:"house", metric:"cplpv", direction:LOWER,  good:[0.40,1.00], excellent:0.75 , source:"rlm_2025_11_04" },

  // TABLE 4 — Meta sales
  { surface:"meta_sales", genre:"bass",  metric:"ctr", direction:HIGHER, good:[3.0,5.0], excellent:5.0 , source:"rlm_2025_11_04" },
  { surface:"meta_sales", genre:"house", metric:"ctr", direction:HIGHER, good:[3.0,6.0], excellent:6.0 , source:"rlm_2025_11_04" },
  { surface:"meta_sales", genre:"bass",  metric:"cpc", direction:LOWER,  good:[0.20,0.35], excellent:0.25 , source:"rlm_2025_11_04" },
  { surface:"meta_sales", genre:"house", metric:"cpc", direction:LOWER,  good:[0.25,0.45], excellent:0.35 , source:"rlm_2025_11_04" },
  { surface:"meta_sales", genre:"bass",  metric:"cost_per_purchase", direction:LOWER, good:[3,5], excellent:3 , source:"rlm_2025_11_04" },
  { surface:"meta_sales", genre:"house", metric:"cost_per_purchase", direction:LOWER, good:[8,12], excellent:8 , source:"rlm_2025_11_04" },
  { surface:"meta_sales", genre:"bass",  metric:"roas", direction:HIGHER, good:[10,25], excellent:25 , source:"rlm_2025_11_04" },
  { surface:"meta_sales", genre:"house", metric:"roas", direction:HIGHER, good:[5,10],  excellent:10 , source:"rlm_2025_11_04" },

  // TABLE 5 — YouTube TrueView.
  // NOTE: campaign writeups through 2026 cite a blended 45–65% view rate. These
  // genre-split ranges from the Nov 2025 document are stricter. Adopting them
  // reclassifies several past house campaigns (48%, 49%, 51%, 57%) from "within
  // benchmark" to below it. The dated document wins, but see AD_BENCHMARK_NOTES.
  { surface:"youtube_trueview", genre:"bass",  metric:"view_rate", direction:HIGHER, good:[55,65], excellent:65 , source:"rlm_2025_11_04" },
  { surface:"youtube_trueview", genre:"house", metric:"view_rate", direction:HIGHER, good:[60,70], excellent:70 , source:"rlm_2025_11_04" },
  { surface:"youtube_trueview", genre:"bass",  metric:"cpv", direction:LOWER, good:[0.01,0.03], excellent:0.015 , source:"rlm_2025_11_04" },
  { surface:"youtube_trueview", genre:"house", metric:"cpv", direction:LOWER, good:[0.01,0.03], excellent:0.01 , source:"rlm_2025_11_04" },
  { surface:"youtube_trueview", genre:"bass",  metric:"ctr", direction:HIGHER, good:[0.15,0.30] , source:"rlm_2025_11_04" },
  { surface:"youtube_trueview", genre:"house", metric:"ctr", direction:HIGHER, good:[0.20,0.35] , source:"rlm_2025_11_04" },

  // TABLE 6 — TikTok. Source notes a limited sample.
  { surface:"tiktok", genre:"bass",  metric:"cpv", direction:LOWER, good:[0.01,0.02], excellent:0.015 , source:"rlm_2025_11_04" },
  { surface:"tiktok", genre:"house", metric:"cpv", direction:LOWER, good:[0.02,0.04], excellent:0.02 , source:"rlm_2025_11_04" },
  { surface:"tiktok", genre:"bass",  metric:"six_second_view_rate", direction:HIGHER, good:[18,25], excellent:25 , source:"rlm_2025_11_04" },
  { surface:"tiktok", genre:"house", metric:"six_second_view_rate", direction:HIGHER, good:[12,20], excellent:20 , source:"rlm_2025_11_04" },
  { surface:"tiktok", genre:"bass",  metric:"cpc", direction:LOWER, good:[1.00,1.50], excellent:1.00 , source:"rlm_2025_11_04" },
  { surface:"tiktok", genre:"house", metric:"cpc", direction:LOWER, good:[1.25,1.75], excellent:1.25 , source:"rlm_2025_11_04" },
  { surface:"tiktok", genre:"bass",  metric:"ctr", direction:HIGHER, good:[0.6,1.0], excellent:1.0 , source:"rlm_2025_11_04" },
  { surface:"tiktok", genre:"house", metric:"ctr", direction:HIGHER, good:[0.3,0.6], excellent:0.6 , source:"rlm_2025_11_04" },

  // TABLE 7 — Spotify Marquee. Source notes a limited sample.
  { surface:"spotify_marquee", genre:"bass",  metric:"ctr", direction:HIGHER, good:[6,9], excellent:9, observed:8.8 , source:"rlm_2025_11_04" },
  { surface:"spotify_marquee", genre:"house", metric:"ctr", direction:HIGHER, good:[6,9], excellent:9, observed:8.9 , source:"rlm_2025_11_04" },
  { surface:"spotify_marquee", genre:"bass",  metric:"conversion_rate", direction:HIGHER, good:[5,8], excellent:8, observed:7.2 , source:"rlm_2025_11_04" },
  { surface:"spotify_marquee", genre:"house", metric:"conversion_rate", direction:HIGHER, good:[5,8], excellent:8, observed:6.4 , source:"rlm_2025_11_04" },
  { surface:"spotify_marquee", genre:"bass",  metric:"streams_per_listener", direction:HIGHER, good:[1.8,2.2], observed:2 , source:"rlm_2025_11_04" },
  { surface:"spotify_marquee", genre:"house", metric:"streams_per_listener", direction:HIGHER, good:[2.5,3.2], observed:3 , source:"rlm_2025_11_04" },
  { surface:"spotify_marquee", genre:"bass",  metric:"intent_rate", direction:HIGHER, good:[28,35], observed:32.7 , source:"rlm_2025_11_04" },
  { surface:"spotify_marquee", genre:"house", metric:"intent_rate", direction:HIGHER, good:[22,30], observed:25.1 , source:"rlm_2025_11_04" },
  { surface:"spotify_marquee", genre:"bass",  metric:"playlist_add_rate", direction:HIGHER, good:[10,13], observed:12 , source:"rlm_2025_11_04" },
  { surface:"spotify_marquee", genre:"house", metric:"playlist_add_rate", direction:HIGHER, good:[8,11], observed:9.4 , source:"rlm_2025_11_04" },
  { surface:"spotify_marquee", genre:"bass",  metric:"save_rate", direction:HIGHER, good:[22,28], observed:25.8 , source:"rlm_2025_11_04" },
  { surface:"spotify_marquee", genre:"house", metric:"save_rate", direction:HIGHER, good:[17,22], observed:18.8 , source:"rlm_2025_11_04" },

  // TABLE 8 — Spotify Showcase
  { surface:"spotify_showcase", genre:"bass",  metric:"ctr", direction:HIGHER, good:[4,7], excellent:7, observed:5.5 , source:"rlm_2025_11_04" },
  { surface:"spotify_showcase", genre:"house", metric:"ctr", direction:HIGHER, good:[5,8], excellent:8, observed:6.4 , source:"rlm_2025_11_04" },
  { surface:"spotify_showcase", genre:"bass",  metric:"conversion_rate", direction:HIGHER, good:[3,5], excellent:5, observed:3.6 , source:"rlm_2025_11_04" },
  { surface:"spotify_showcase", genre:"house", metric:"conversion_rate", direction:HIGHER, good:[4,6], excellent:6, observed:4.8 , source:"rlm_2025_11_04" },
  { surface:"spotify_showcase", genre:"bass",  metric:"streams_per_listener", direction:HIGHER, good:[1.8,2.2], observed:1.8 , source:"rlm_2025_11_04" },
  { surface:"spotify_showcase", genre:"house", metric:"streams_per_listener", direction:HIGHER, good:[2.5,3.0], observed:2.7 , source:"rlm_2025_11_04" },
  { surface:"spotify_showcase", genre:"bass",  metric:"intent_rate", direction:HIGHER, good:[20,25], observed:23.7 , source:"rlm_2025_11_04" },
  { surface:"spotify_showcase", genre:"house", metric:"intent_rate", direction:HIGHER, good:[25,30], observed:26.3 , source:"rlm_2025_11_04" },
  { surface:"spotify_showcase", genre:"bass",  metric:"playlist_add_rate", direction:HIGHER, good:[7,10], observed:8.6 , source:"rlm_2025_11_04" },
  { surface:"spotify_showcase", genre:"house", metric:"playlist_add_rate", direction:HIGHER, good:[10,13], observed:10.9 , source:"rlm_2025_11_04" },
  { surface:"spotify_showcase", genre:"bass",  metric:"save_rate", direction:HIGHER, good:[15,20], observed:17.4 , source:"rlm_2025_11_04" },
  { surface:"spotify_showcase", genre:"house", metric:"save_rate", direction:HIGHER, good:[17,22], observed:18.5 , source:"rlm_2025_11_04" },

  // ---- Format-level references. Point figures, not ranges. Not genre-split. ----
  // Spotify Showcase, 2025 platform benchmark
  { surface:"spotify_showcase", format:"single", metric:"ctr",                  direction:HIGHER, average:3.10, source:"spotify_2025" },
  { surface:"spotify_showcase", format:"single", metric:"conversion_rate",      direction:HIGHER, average:1.70, source:"spotify_2025" },
  { surface:"spotify_showcase", format:"single", metric:"streams_per_listener", direction:HIGHER, average:2.4,  source:"spotify_2025" },
  { surface:"spotify_showcase", format:"single", metric:"save_rate",            direction:HIGHER, average:15.10, source:"spotify_2025" },
  { surface:"spotify_showcase", format:"album",  metric:"ctr",                  direction:HIGHER, average:3.80, source:"spotify_2025" },
  { surface:"spotify_showcase", format:"album",  metric:"conversion_rate",      direction:HIGHER, average:2.00, source:"spotify_2025" },
  { surface:"spotify_showcase", format:"album",  metric:"streams_per_listener", direction:HIGHER, average:5.8,  source:"spotify_2025" },
  { surface:"spotify_showcase", format:"album",  metric:"save_rate",            direction:HIGHER, average:11.30, source:"spotify_2025" },

  // Spotify Marquee
  { surface:"spotify_marquee", format:"single", metric:"ctr",                  direction:HIGHER, average:6.50, source:"spotify_2025" },
  { surface:"spotify_marquee", format:"single", metric:"conversion_rate",      direction:HIGHER, average:6.50, source:"spotify_2025" },
  { surface:"spotify_marquee", format:"single", metric:"streams_per_listener", direction:HIGHER, average:2.6,  source:"spotify_2025" },
  { surface:"spotify_marquee", format:"single", metric:"intent_rate",          direction:HIGHER, average:21.40, source:"spotify_2025" },
  { surface:"spotify_marquee", format:"single", metric:"playlist_add_rate",    direction:HIGHER, average:8.10, source:"spotify_2025" },
  { surface:"spotify_marquee", format:"single", metric:"save_rate",            direction:HIGHER, average:16.20, source:"spotify_2025" },
  { surface:"spotify_marquee", format:"album",  metric:"ctr",                  direction:HIGHER, average:13.50, source:"edm_avg" },
  { surface:"spotify_marquee", format:"album",  metric:"conversion_rate",      direction:HIGHER, average:9.33, source:"edm_avg" },
  { surface:"spotify_marquee", format:"album",  metric:"streams_per_listener", direction:HIGHER, average:10.8, source:"edm_avg" },
  { surface:"spotify_marquee", format:"album",  metric:"intent_rate",          direction:HIGHER, average:29.00, source:"edm_avg" },
  { surface:"spotify_marquee", format:"album",  metric:"playlist_add_rate",    direction:HIGHER, average:11.50, source:"edm_avg" },
  { surface:"spotify_marquee", format:"album",  metric:"save_rate",            direction:HIGHER, average:21.79, source:"edm_avg" },
];

/** Release genres in the app map onto the two benchmark families. */
const GENRE_MAP: Record<string, Genre> = {
  dubstep: "bass",
  "melodic-bass": "bass",
  house: "house",
  "big-room": "house",
  // Downtempo is not in the source document. Mapped to house because the
  // observed cost and click profiles for Rhye, O'Flynn and Avalon Emerson sit
  // inside the house ranges, not the bass ones. Revisit if that stops holding.
  downtempo: "house",
};

/** Returns null for genres the benchmark document does not cover. */
export function benchmarkGenre(releaseGenre: string): Genre | null {
  return GENRE_MAP[releaseGenre.toLowerCase()] ?? null;
}

export function findBenchmark(surface: Surface, genre: Genre, metric: Metric): Benchmark | null {
  return BENCHMARKS.find(b => b.surface === surface && b.genre === genre && b.metric === metric) ?? null;
}

/** The format-level reference. Required for Spotify — a single and an album are
 *  not comparable on the same figure. */
export function findFormatReference(surface: Surface, format: Format, metric: Metric): Benchmark | null {
  return BENCHMARKS.find(b => b.surface === surface && b.format === format && b.metric === metric) ?? null;
}

/** Proportional distance from a point reference, signed so positive is better. */
export function vsAverage(value: number, b: Benchmark): number | null {
  if (b.average === undefined) return null;
  return b.direction === "higher"
    ? (value - b.average) / b.average
    : (b.average - value) / b.average;
}

/** Excellent is checked first because the source ranges overlap. */
export function classify(value: number, b: Benchmark): Verdict | null {
  if (!b.good) return null;   // point reference — use vsAverage instead
  const better = b.direction === "higher"
    ? (a: number, c: number) => a >= c
    : (a: number, c: number) => a <= c;

  if (b.excellent !== undefined && better(value, b.excellent)) return "excellent";
  if (value >= b.good[0] && value <= b.good[1]) return "good";
  return "outside";
}

/** How far past the Excellent threshold, or past the near edge of Good. */
export function marginVsBenchmark(value: number, b: Benchmark): number | null {
  if (!b.good) return null;
  const ref = b.excellent ?? (b.direction === "higher" ? b.good[1] : b.good[0]);
  return b.direction === "higher" ? (value - ref) / ref : (ref - value) / ref;
}
