/**
 * Phase 2b: draft vs active diff + HARD/SOFT guardrail evaluation for approve UI.
 */

import { FORWARD_BIAS_MIN_IMPROVEMENT } from "@/lib/constants";
import { composeStreamCurvePct } from "@/lib/forecast";
import type { ActiveModel, DowKey } from "@/lib/model/active-model";
import type { AdModel } from "@/lib/model/ad-model";
import { AD_META_STREAMS_PER_SPOTIFY_CLICK } from "@/lib/model/ad-model";
import type { ForecastModel } from "@/lib/model/forecast-model";

const DOW_KEYS: DowKey[] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const RELEASE_TYPE_KEYS = [
  "single",
  "lead_single",
  "focus_track",
  "album_track",
  "alternate_version",
] as const;
const GENRE_KEYS = [
  "dubstep",
  "house",
  "melodic-bass",
  "downtempo",
  "big-room",
] as const;
const TIER_KEYS = ["developing", "mid", "established"] as const;
const BAND_PCTS = ["p25", "p50", "p75", "p90"] as const;

/** Soft bands for ad_model review (warn only — same override discipline as curve). */
const AD_CPL_MIN = 0.05;
const AD_CPL_MAX = 2.0;
const AD_SPL_MIN = 1.0;
const AD_CPC_MIN = 0.01;
const AD_CPC_MAX = 5.0;
const AD_CPM_MIN = 0.5;
const AD_CPM_MAX = 50.0;
const AD_COST_PER_REACH_MIN = 0.0005;
const AD_COST_PER_REACH_MAX = 0.05;
const AD_CLICK_SHARE_MIN = 0.05;
const AD_CLICK_SHARE_MAX = 0.95;
const AD_SAMPLE_WARN_N = 5;
const AD_LARGE_MOVE_REL = 0.35;

/** Sample calendar dates for composed-curve preview. */
export const PREVIEW_FRIDAY = "2026-05-29";
export const PREVIEW_WEDNESDAY = "2026-05-27";

const DOW_MEAN_TOLERANCE = 0.05;
const WK1_SUM_TOLERANCE = 0.51;
const LARGE_MOVE_ABS = {
  dow: 0.05,
  kernel: 1.0,
  trend: 1.5,
  magnitude: 0.05,
  saveRate: 2.0,
  saveCountRel: 0.15,
} as const;
const SAVE_RATE_MIN_WIDTH = 1.0;

export type DiffRow = {
  label: string;
  active: number;
  draft: number;
  delta: number;
};

export type ModelDiff = {
  dow: DiffRow[];
  editorialKernel: DiffRow[];
  trendMedian: DiffRow[];
  trendP25: DiffRow[];
  trendP75: DiffRow[];
  releaseTypeMagnitude: DiffRow[];
  saveRateBands: DiffRow[];
  saveCountBands: DiffRow[];
  /** Fitted ad_model scalars + genre priors + sample sizes. */
  adModel: DiffRow[];
};

export type GuardrailSeverity = "hard" | "soft";

export type GuardrailCheck = {
  id: string;
  severity: GuardrailSeverity;
  label: string;
  passed: boolean;
  /** Human-readable computed value for the panel. */
  value: string;
  detail?: string;
};

export type CurvePreview = {
  label: string;
  releaseDate: string;
  activePct: number[];
  draftPct: number[];
  activeWk1Sum: number;
  draftWk1Sum: number;
};

export type DraftReview = {
  diff: ModelDiff;
  hard: GuardrailCheck[];
  soft: GuardrailCheck[];
  allHardPassed: boolean;
  curves: CurvePreview[];
};

export type DraftRawGuardrails = {
  passed: boolean;
  insufficientSample: boolean;
  codes: string[];
  message: string | null;
};

/** Attach optional raw guardrails from draft metadata JSON. */
export type DraftWithRawGuardrails = ActiveModel & {
  rawGuardrails?: DraftRawGuardrails | null;
};

function asForecastModel(model: ActiveModel): ForecastModel {
  return model;
}

function fmtPctBias(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) {
    return "n/a";
  }
  const pct = value * 100;
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(1)}%`;
}

function fmtNum(value: number, digits = 3): string {
  if (!Number.isFinite(value)) {
    return "n/a";
  }
  return value.toFixed(digits);
}

function row(label: string, active: number, draft: number): DiffRow {
  return { label, active, draft, delta: draft - active };
}

export function buildModelDiff(
  draft: ActiveModel,
  active: ActiveModel,
): ModelDiff {
  const dow = DOW_KEYS.map((key) =>
    row(key, active.dow[key], draft.dow[key]),
  );

  const kernelLen = Math.max(
    draft.editorialKernel.length,
    active.editorialKernel.length,
  );
  const editorialKernel = Array.from({ length: kernelLen }, (_, index) =>
    row(
      `k[${index}]`,
      active.editorialKernel[index] ?? 0,
      draft.editorialKernel[index] ?? 0,
    ),
  );

  const trendMedian = draft.trend.median.map((value, index) =>
    row(`D${index + 1}`, active.trend.median[index] ?? 0, value),
  );
  const trendP25 = draft.trend.p25.map((value, index) =>
    row(`D${index + 1}`, active.trend.p25[index] ?? 0, value),
  );
  const trendP75 = draft.trend.p75.map((value, index) =>
    row(`D${index + 1}`, active.trend.p75[index] ?? 0, value),
  );

  const releaseTypeMagnitude = RELEASE_TYPE_KEYS.map((key) =>
    row(
      key,
      active.releaseTypeMagnitudeMultipliers[key],
      draft.releaseTypeMagnitudeMultipliers[key],
    ),
  );

  const saveRateBands: DiffRow[] = [];
  for (const genre of GENRE_KEYS) {
    saveRateBands.push(
      row(
        `${genre}.lo`,
        active.saveRateBands[genre].lo,
        draft.saveRateBands[genre].lo,
      ),
      row(
        `${genre}.hi`,
        active.saveRateBands[genre].hi,
        draft.saveRateBands[genre].hi,
      ),
    );
  }

  const saveCountBands: DiffRow[] = [];
  for (const tier of TIER_KEYS) {
    for (const pct of BAND_PCTS) {
      saveCountBands.push(
        row(
          `${tier}.${pct}`,
          active.saveCountBands[tier][pct],
          draft.saveCountBands[tier][pct],
        ),
      );
    }
  }

  return {
    dow,
    editorialKernel,
    trendMedian,
    trendP25,
    trendP75,
    releaseTypeMagnitude,
    saveRateBands,
    saveCountBands,
    adModel: buildAdModelDiff(draft.adModel, active.adModel),
  };
}

/** Old-vs-new for every ad constant reviewed on approve (not per-artist SPL map). */
export function buildAdModelDiff(draft: AdModel, active: AdModel): DiffRow[] {
  const rows: DiffRow[] = [
    row("spotify_cpl.marquee", active.spotifyCpl.marquee, draft.spotifyCpl.marquee),
    row(
      "spotify_cpl.showcase",
      active.spotifyCpl.showcase,
      draft.spotifyCpl.showcase,
    ),
    row(
      "spotify_spl_global",
      active.spotifySplGlobal,
      draft.spotifySplGlobal,
    ),
    row(
      "spotify_spl_shrinkage_k",
      active.spotifySplShrinkageK,
      draft.spotifySplShrinkageK,
    ),
  ];

  for (const genre of GENRE_KEYS) {
    rows.push(
      row(
        `spotify_spl_by_genre.${genre}`,
        active.spotifySplByGenre[genre] ?? active.spotifySplGlobal,
        draft.spotifySplByGenre[genre] ?? draft.spotifySplGlobal,
      ),
    );
  }

  rows.push(
    row("meta_funnel.cpc", active.metaFunnel.cpc, draft.metaFunnel.cpc),
    row(
      "meta_funnel.spotify_click_share",
      active.metaFunnel.spotifyClickShare,
      draft.metaFunnel.spotifyClickShare,
    ),
    row(
      "meta_funnel.streams_per_spotify_click_base",
      active.metaFunnel.streamsPerSpotifyClickBase,
      draft.metaFunnel.streamsPerSpotifyClickBase,
    ),
    row("meta_awareness.cpm", active.metaAwareness.cpm, draft.metaAwareness.cpm),
    row(
      "meta_awareness.cost_per_reach",
      active.metaAwareness.costPerReach,
      draft.metaAwareness.costPerReach,
    ),
    row(
      "sample.cpl_marquee",
      active.sampleSizes.cplMarquee,
      draft.sampleSizes.cplMarquee,
    ),
    row(
      "sample.cpl_showcase",
      active.sampleSizes.cplShowcase,
      draft.sampleSizes.cplShowcase,
    ),
    row(
      "sample.spl_artists",
      active.sampleSizes.splArtists,
      draft.sampleSizes.splArtists,
    ),
    row("sample.meta_cpc", active.sampleSizes.metaCpc, draft.sampleSizes.metaCpc),
    row(
      "sample.meta_spotify_click_share",
      active.sampleSizes.metaSpotifyClickShare,
      draft.sampleSizes.metaSpotifyClickShare,
    ),
    row(
      "sample.meta_awareness",
      active.sampleSizes.metaAwareness,
      draft.sampleSizes.metaAwareness,
    ),
    row(
      "sample.spotify_usable",
      active.sampleSizes.spotifyUsable,
      draft.sampleSizes.spotifyUsable,
    ),
    row(
      "spotify_spl_by_artist.count",
      Object.keys(active.spotifySplByArtist).length,
      Object.keys(draft.spotifySplByArtist).length,
    ),
  );

  return rows;
}

/**
 * Meaningful improvement toward zero: |live| − |new| ≥ minDelta.
 * Rejects float-noise / no-op refits where new ≈ live.
 */
export function beatsLiveBias(
  newBias: number,
  liveBias: number,
  minDelta: number = FORWARD_BIAS_MIN_IMPROVEMENT,
): boolean {
  if (!Number.isFinite(newBias) || !Number.isFinite(liveBias)) {
    return false;
  }
  return Math.abs(liveBias) - Math.abs(newBias) >= minDelta;
}

function biasImprovement(
  newBias: number,
  liveBias: number,
): number {
  return Math.abs(liveBias) - Math.abs(newBias);
}

function evaluateNewBeatsLive(draft: ActiveModel): GuardrailCheck {
  const fb = draft.metadata?.forwardBias;
  if (!fb) {
    return {
      id: "new_beats_live",
      severity: "hard",
      label: "New beats live (forward bias)",
      passed: false,
      value: "missing metadata.forward_bias",
    };
  }

  // HARD gate: large reliable samples only (all + clean).
  // newest_10 is noisy (n=10) — soft warning via evaluateNewest10Bias.
  const hardSlices = [
    { key: "all", live: fb.all.live, neu: fb.all.new },
    { key: "clean", live: fb.clean.live, neu: fb.clean.new },
  ] as const;

  const results = hardSlices.map((slice) => {
    const improvement = biasImprovement(slice.neu, slice.live);
    return {
      ...slice,
      improvement,
      ok: beatsLiveBias(slice.neu, slice.live),
    };
  });

  const passed = results.every((r) => r.ok);
  const noOp = results.every(
    (r) => Math.abs(r.improvement) < FORWARD_BIAS_MIN_IMPROVEMENT,
  );
  const minPts = (FORWARD_BIAS_MIN_IMPROVEMENT * 100).toFixed(0);
  const value = results
    .map(
      (r) =>
        `${r.key}: live ${fmtPctBias(r.live)} → new ${fmtPctBias(r.neu)} (Δ|bias|=${fmtPctBias(r.improvement).replace("+", "")})`,
    )
    .join(" · ");

  return {
    id: "new_beats_live",
    severity: "hard",
    label: "New beats live (forward bias)",
    passed,
    value,
    detail: passed
      ? undefined
      : noOp
        ? `no improvement — |new| ≈ |live| on all + clean (need ≥ ${minPts}pt)`
        : `new must beat live by ≥ ${minPts}pt of |bias| on all + clean (newest_10 is soft-only)`,
  };
}

function evaluateNewest10Bias(draft: ActiveModel): GuardrailCheck {
  const fb = draft.metadata?.forwardBias;
  if (!fb) {
    return {
      id: "newest_10_bias",
      severity: "soft",
      label: "Newest-10 forward bias",
      passed: false,
      value: "missing metadata.forward_bias",
    };
  }

  const live = fb.newest10.live;
  const neu = fb.newest10.new;
  const improvement = biasImprovement(neu, live);
  const passed = beatsLiveBias(neu, live);
  const minPts = (FORWARD_BIAS_MIN_IMPROVEMENT * 100).toFixed(0);

  return {
    id: "newest_10_bias",
    severity: "soft",
    label: "Newest-10 forward bias",
    passed,
    value: `newest_10: live ${fmtPctBias(live)} → new ${fmtPctBias(neu)} (Δ|bias|=${fmtPctBias(improvement).replace("+", "")})`,
    detail: passed
      ? undefined
      : Math.abs(improvement) < FORWARD_BIAS_MIN_IMPROVEMENT
        ? `no meaningful improvement on newest_10 (need ≥ ${minPts}pt — warn only)`
        : "newer model worse on newest_10 (noisy n=10 — warn only)",
  };
}

function evaluateKernelDecreasing(draft: ActiveModel): GuardrailCheck {
  const k = draft.editorialKernel;
  const k0 = k[0];
  const k1 = k[1];
  const passed =
    k0 != null &&
    k1 != null &&
    k0 > k1 &&
    k1 >= 0 &&
    k.every((value) => Number.isFinite(value) && value >= 0);

  return {
    id: "kernel_decreasing",
    severity: "hard",
    label: "Kernel decreasing (k[0] > k[1] ≥ 0)",
    passed,
    value: `k=[${k.map((v) => fmtNum(v, 2)).join(", ")}]`,
  };
}

function evaluateTrendShape(draft: ActiveModel): GuardrailCheck {
  const { median, p25, p75 } = draft.trend;
  const lenOk =
    median.length === 28 && p25.length === 28 && p75.length === 28;
  const noZeroTail =
    (median[27] ?? 0) > 0 && (p25[27] ?? 0) > 0 && (p75[27] ?? 0) > 0;
  const passed = lenOk && noZeroTail;

  return {
    id: "trend_shape",
    severity: "hard",
    label: "Trend length 28, no zero tail",
    passed,
    value: `len=${median.length}/${p25.length}/${p75.length}; D28 median=${fmtNum(median[27] ?? NaN, 1)}`,
  };
}

function evaluateDowShape(draft: ActiveModel): GuardrailCheck {
  const values = DOW_KEYS.map((key) => draft.dow[key]);
  const fri = draft.dow.Fri;
  const sun = draft.dow.Sun;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  const friMax = fri === max;
  const sunMin = sun === min;
  const meanOk = Math.abs(mean - 1) <= DOW_MEAN_TOLERANCE;
  const passed = friMax && sunMin && meanOk;

  return {
    id: "dow_shape",
    severity: "hard",
    label: "DOW Fri-max / Sun-min, mean ≈ 1",
    passed,
    value: `Fri=${fmtNum(fri)} Sun=${fmtNum(sun)} mean=${fmtNum(mean)}`,
  };
}

function evaluateSaveCountMonotonic(draft: ActiveModel): GuardrailCheck {
  const failures: string[] = [];
  for (const pct of BAND_PCTS) {
    const dev = draft.saveCountBands.developing[pct];
    const mid = draft.saveCountBands.mid[pct];
    const est = draft.saveCountBands.established[pct];
    if (!(dev <= mid && mid <= est)) {
      failures.push(`${pct}: ${dev} ≰ ${mid} ≰ ${est}`);
    }
  }
  return {
    id: "save_count_monotonic",
    severity: "hard",
    label: "Save-count bands monotonic (dev ≤ mid ≤ est)",
    passed: failures.length === 0,
    value:
      failures.length === 0
        ? "dev ≤ mid ≤ est for p25/p50/p75/p90"
        : failures.join("; "),
  };
}

function wk1Sum(pct: number[]): number {
  return pct.slice(0, 7).reduce((sum, value) => sum + value, 0);
}

function evaluateWk1Composes(draft: ActiveModel): GuardrailCheck {
  const fri = composeStreamCurvePct(asForecastModel(draft), {
    releaseDate: PREVIEW_FRIDAY,
  });
  const wed = composeStreamCurvePct(asForecastModel(draft), {
    releaseDate: PREVIEW_WEDNESDAY,
  });
  const friSum = wk1Sum(fri);
  const wedSum = wk1Sum(wed);
  const passed =
    Math.abs(friSum - 100) <= WK1_SUM_TOLERANCE &&
    Math.abs(wedSum - 100) <= WK1_SUM_TOLERANCE;

  return {
    id: "wk1_composes",
    severity: "hard",
    label: "Wk1 composes to ~100",
    passed,
    value: `Fri Σd1–7=${fmtNum(friSum, 2)} · Wed Σd1–7=${fmtNum(wedSum, 2)}`,
  };
}

function evaluateInsufficientSample(
  draft: DraftWithRawGuardrails,
): GuardrailCheck {
  const clean = draft.metadata?.sampleSizes.clean ?? 0;
  const min = draft.metadata?.threshold.minSampleSize ?? 40;
  const flagged =
    draft.rawGuardrails?.insufficientSample === true || clean < min;
  return {
    id: "insufficient_sample",
    severity: "soft",
    label: "Clean count vs threshold",
    passed: !flagged,
    value: `clean=${clean} (need ≥ ${min})`,
    detail: flagged
      ? draft.rawGuardrails?.message ?? "insufficient_sample"
      : undefined,
  };
}

function evaluateSaveRateNotCollapsed(draft: ActiveModel): GuardrailCheck {
  const collapsed: string[] = [];
  for (const genre of GENRE_KEYS) {
    const { lo, hi } = draft.saveRateBands[genre];
    const width = hi - lo;
    if (!(hi > lo) || width < SAVE_RATE_MIN_WIDTH) {
      collapsed.push(`${genre} width=${fmtNum(width, 1)}`);
    }
  }
  return {
    id: "save_rate_width",
    severity: "soft",
    label: "Save-rate bands not collapsed",
    passed: collapsed.length === 0,
    value:
      collapsed.length === 0
        ? `all genres width ≥ ${SAVE_RATE_MIN_WIDTH}`
        : collapsed.join("; "),
  };
}

function evaluateLargeParameterMove(
  draft: ActiveModel,
  active: ActiveModel,
  diff: ModelDiff,
): GuardrailCheck {
  const movers: string[] = [];

  for (const row of diff.dow) {
    if (Math.abs(row.delta) > LARGE_MOVE_ABS.dow) {
      movers.push(`dow.${row.label} Δ=${fmtNum(row.delta)}`);
    }
  }
  for (const row of diff.editorialKernel) {
    if (Math.abs(row.delta) > LARGE_MOVE_ABS.kernel) {
      movers.push(`${row.label} Δ=${fmtNum(row.delta, 2)}`);
    }
  }
  for (const row of diff.trendMedian) {
    if (Math.abs(row.delta) > LARGE_MOVE_ABS.trend) {
      movers.push(`trend.median.${row.label} Δ=${fmtNum(row.delta, 1)}`);
    }
  }
  for (const row of diff.releaseTypeMagnitude) {
    if (Math.abs(row.delta) > LARGE_MOVE_ABS.magnitude) {
      movers.push(`mag.${row.label} Δ=${fmtNum(row.delta)}`);
    }
  }
  for (const row of diff.saveRateBands) {
    if (Math.abs(row.delta) > LARGE_MOVE_ABS.saveRate) {
      movers.push(`save_rate.${row.label} Δ=${fmtNum(row.delta, 1)}`);
    }
  }
  for (const row of diff.saveCountBands) {
    if (row.active === 0) {
      continue;
    }
    const rel = Math.abs(row.delta) / Math.abs(row.active);
    if (rel > LARGE_MOVE_ABS.saveCountRel) {
      movers.push(
        `save_count.${row.label} Δ=${(rel * 100).toFixed(0)}%`,
      );
    }
  }

  // Silence unused-param lint if structure changes — keep active for parity.
  void active;

  const passed = movers.length === 0;
  return {
    id: "large_parameter_move",
    severity: "soft",
    label: "Large parameter moves vs active",
    passed,
    value: passed
      ? "no large moves"
      : movers.slice(0, 8).join("; ") +
        (movers.length > 8 ? ` (+${movers.length - 8} more)` : ""),
  };
}

function inBand(value: number, lo: number, hi: number): boolean {
  return Number.isFinite(value) && value >= lo && value <= hi;
}

function adRelMove(active: number, draft: number): number {
  if (!Number.isFinite(active) || !Number.isFinite(draft)) return 0;
  if (active === 0) return Math.abs(draft) > 0 ? 1 : 0;
  return Math.abs(draft - active) / Math.abs(active);
}

/** Soft: CPL/CPC/CPM in-band, SPL priors ≥ 1, fixed base=1.0, large ad moves. */
export function evaluateAdModelBands(draft: ActiveModel): GuardrailCheck {
  const ad = draft.adModel;
  const issues: string[] = [];

  if (!inBand(ad.spotifyCpl.marquee, AD_CPL_MIN, AD_CPL_MAX)) {
    issues.push(`cpl.marquee=${fmtNum(ad.spotifyCpl.marquee, 3)}`);
  }
  if (!inBand(ad.spotifyCpl.showcase, AD_CPL_MIN, AD_CPL_MAX)) {
    issues.push(`cpl.showcase=${fmtNum(ad.spotifyCpl.showcase, 3)}`);
  }
  if (!(ad.spotifySplGlobal >= AD_SPL_MIN)) {
    issues.push(`spl_global=${fmtNum(ad.spotifySplGlobal, 2)} (<${AD_SPL_MIN})`);
  }
  for (const genre of GENRE_KEYS) {
    const prior = ad.spotifySplByGenre[genre];
    if (prior != null && !(prior >= AD_SPL_MIN)) {
      issues.push(`spl.${genre}=${fmtNum(prior, 2)}`);
    }
  }
  if (!inBand(ad.metaFunnel.cpc, AD_CPC_MIN, AD_CPC_MAX)) {
    issues.push(`cpc=${fmtNum(ad.metaFunnel.cpc, 3)}`);
  }
  if (
    !inBand(
      ad.metaFunnel.spotifyClickShare,
      AD_CLICK_SHARE_MIN,
      AD_CLICK_SHARE_MAX,
    )
  ) {
    issues.push(`click_share=${fmtNum(ad.metaFunnel.spotifyClickShare, 2)}`);
  }
  if (
    Math.abs(
      ad.metaFunnel.streamsPerSpotifyClickBase - AD_META_STREAMS_PER_SPOTIFY_CLICK,
    ) > 1e-9
  ) {
    issues.push(
      `streams_per_spotify_click_base=${fmtNum(ad.metaFunnel.streamsPerSpotifyClickBase, 2)} (want ${AD_META_STREAMS_PER_SPOTIFY_CLICK})`,
    );
  }
  if (!inBand(ad.metaAwareness.cpm, AD_CPM_MIN, AD_CPM_MAX)) {
    issues.push(`cpm=${fmtNum(ad.metaAwareness.cpm, 2)}`);
  }
  if (
    !inBand(
      ad.metaAwareness.costPerReach,
      AD_COST_PER_REACH_MIN,
      AD_COST_PER_REACH_MAX,
    )
  ) {
    issues.push(
      `cost_per_reach=${fmtNum(ad.metaAwareness.costPerReach, 5)}`,
    );
  }

  const passed = issues.length === 0;
  return {
    id: "ad_model_bands",
    severity: "soft",
    label: "Ad model rates in sane bands",
    passed,
    value: passed ? "CPL/SPL/CPC/CPM in band; base=1.0" : issues.join("; "),
    detail: passed
      ? undefined
      : "Soft only — lean on priors / review before promote",
  };
}

/** Soft: warn when a format/objective fit has fewer than ~5 campaigns. */
export function evaluateAdModelSampleSize(draft: ActiveModel): GuardrailCheck {
  const s = draft.adModel.sampleSizes;
  const thin: string[] = [];
  if (s.cplMarquee < AD_SAMPLE_WARN_N) {
    thin.push(`marquee n=${s.cplMarquee}`);
  }
  if (s.cplShowcase < AD_SAMPLE_WARN_N) {
    thin.push(`showcase n=${s.cplShowcase}`);
  }
  if (s.metaCpc < AD_SAMPLE_WARN_N) {
    thin.push(`meta_cpc n=${s.metaCpc}`);
  }
  if (s.metaSpotifyClickShare < AD_SAMPLE_WARN_N) {
    thin.push(`click_share n=${s.metaSpotifyClickShare}`);
  }
  if (s.metaAwareness < AD_SAMPLE_WARN_N) {
    thin.push(`awareness n=${s.metaAwareness}`);
  }

  const passed = thin.length === 0;
  return {
    id: "ad_model_sample",
    severity: "soft",
    label: "Ad fit sample counts",
    passed,
    value: passed
      ? `all buckets ≥ ${AD_SAMPLE_WARN_N}`
      : `${thin.join("; ")} — lean on prior`,
    detail: passed
      ? undefined
      : `Soft warning when n < ${AD_SAMPLE_WARN_N} for a format/objective`,
  };
}

/** Soft: large relative moves on fitted ad constants vs active. */
export function evaluateAdModelLargeMove(
  draft: ActiveModel,
  active: ActiveModel,
  diff: ModelDiff,
): GuardrailCheck {
  const skipPrefix = "sample.";
  const skipExact = new Set([
    "spotify_spl_by_artist.count",
    "spotify_spl_shrinkage_k",
    "meta_funnel.streams_per_spotify_click_base",
  ]);
  const movers: string[] = [];
  for (const row of diff.adModel) {
    if (row.label.startsWith(skipPrefix) || skipExact.has(row.label)) {
      continue;
    }
    if (adRelMove(row.active, row.draft) > AD_LARGE_MOVE_REL) {
      movers.push(
        `${row.label} Δ=${((adRelMove(row.active, row.draft) * 100).toFixed(0))}%`,
      );
    }
  }
  void draft;
  void active;
  const passed = movers.length === 0;
  return {
    id: "ad_model_large_move",
    severity: "soft",
    label: "Large ad_model moves vs active",
    passed,
    value: passed
      ? `no moves > ${(AD_LARGE_MOVE_REL * 100).toFixed(0)}%`
      : movers.slice(0, 8).join("; ") +
        (movers.length > 8 ? ` (+${movers.length - 8} more)` : ""),
  };
}

export function parseRawGuardrails(
  rawMetadata: Record<string, unknown> | null,
): DraftRawGuardrails | null {
  if (!rawMetadata) {
    return null;
  }
  const g = rawMetadata.guardrails;
  if (g == null || typeof g !== "object" || Array.isArray(g)) {
    return null;
  }
  const record = g as Record<string, unknown>;
  return {
    passed: Boolean(record.passed),
    insufficientSample: Boolean(record.insufficient_sample),
    codes: Array.isArray(record.codes)
      ? record.codes.map(String)
      : [],
    message: record.message == null ? null : String(record.message),
  };
}

export function parseCooksDroppedIds(
  rawMetadata: Record<string, unknown> | null,
): string[] {
  if (!rawMetadata) {
    return [];
  }
  const ids = rawMetadata.cooks_d_dropped_ids;
  if (!Array.isArray(ids)) {
    return [];
  }
  return ids.map(String);
}

function buildCurvePreview(
  label: string,
  releaseDate: string,
  draft: ActiveModel,
  active: ActiveModel,
): CurvePreview {
  const activePct = composeStreamCurvePct(asForecastModel(active), {
    releaseDate,
  });
  const draftPct = composeStreamCurvePct(asForecastModel(draft), {
    releaseDate,
  });
  return {
    label,
    releaseDate,
    activePct,
    draftPct,
    activeWk1Sum: wk1Sum(activePct),
    draftWk1Sum: wk1Sum(draftPct),
  };
}

export function buildDraftReview(
  draftInput: DraftWithRawGuardrails,
  active: ActiveModel,
): DraftReview {
  const draft = draftInput;
  const diff = buildModelDiff(draft, active);

  const hard: GuardrailCheck[] = [
    evaluateNewBeatsLive(draft),
    evaluateKernelDecreasing(draft),
    evaluateTrendShape(draft),
    evaluateDowShape(draft),
    evaluateSaveCountMonotonic(draft),
    evaluateWk1Composes(draft),
  ];

  const soft: GuardrailCheck[] = [
    evaluateInsufficientSample(draft),
    evaluateNewest10Bias(draft),
    evaluateSaveRateNotCollapsed(draft),
    evaluateLargeParameterMove(draft, active, diff),
    evaluateAdModelBands(draft),
    evaluateAdModelSampleSize(draft),
    evaluateAdModelLargeMove(draft, active, diff),
  ];

  return {
    diff,
    hard,
    soft,
    allHardPassed: hard.every((check) => check.passed),
    curves: [
      buildCurvePreview("Friday", PREVIEW_FRIDAY, draft, active),
      buildCurvePreview("Wednesday", PREVIEW_WEDNESDAY, draft, active),
    ],
  };
}
