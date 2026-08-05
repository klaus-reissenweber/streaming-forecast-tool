/**
 * Consolidated active forecast model.
 * Shapes mirror lib/constants.ts marker blocks + streams_d0 regression.
 * Loaded once per request via loadActiveModel() and passed into forecast math.
 */

import {
  RELEASE_TYPE_MAGNITUDE_MULTIPLIER,
  RETRAIN_MIN_SAMPLE_SIZE,
  RETRAIN_THRESHOLD,
  SAVE_COUNT_BANDS,
  SAVE_RATE_BANDS,
  STREAM_CURVE_TREND,
  STREAM_DOW_MULTIPLIER,
  STREAM_EDITORIAL_KERNEL,
  TIER_ML_THRESHOLDS,
} from "@/lib/constants";
import type { RegressionModel } from "@/lib/forecast";
import {
  parseAdModel,
  SEED_AD_MODEL,
  type AdModel,
} from "@/lib/model/ad-model";
import liveSeed from "@/seed/live-model-version.json";

const DOW_KEYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
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

export type DowKey = (typeof DOW_KEYS)[number];
export type TrendPercentiles = {
  median: number[];
  p25: number[];
  p75: number[];
};
export type DowMultipliers = Record<DowKey, number>;
export type ReleaseTypeMagnitudeMultipliers = Record<
  (typeof RELEASE_TYPE_KEYS)[number],
  number
>;
export type SaveRateBands = Record<
  (typeof GENRE_KEYS)[number],
  { lo: number; hi: number }
>;
export type SaveCountBands = Record<
  (typeof TIER_KEYS)[number],
  { p25: number; p50: number; p75: number; p90: number }
>;

export type ActiveModelConfig = {
  tierMlThresholds: { mid: number; established: number };
  retrainMinSampleSize: number;
  retrainThreshold: number;
  editorialKernelK: number;
  streamCurveDayEnd: number;
  wk1DayEnd: number;
  releaseTypeMagnitudeShrinkageK: number;
};

export type ActiveModelMetadata = {
  sampleSizes: {
    eligible: number;
    clean: number;
    regression: number;
    derived: number;
  };
  forwardBias: {
    all: { live: number; new: number };
    clean: { live: number; new: number };
    newest10: { live: number; new: number };
  };
  cooksDDrops: number;
  threshold: {
    minSampleSize: number;
    retrainThreshold: number;
    cooksDThresholdFactor: number;
  };
  overrideNotes: string | null;
};

export type ActiveModel = {
  id: string | null;
  fittedAt: string;
  activatedAt: string | null;
  source: "db" | "fallback";
  trend: TrendPercentiles;
  dow: DowMultipliers;
  editorialKernel: number[];
  kernelLength: number;
  releaseTypeMagnitudeMultipliers: ReleaseTypeMagnitudeMultipliers;
  saveRateBands: SaveRateBands;
  saveCountBands: SaveCountBands;
  streamsD0: RegressionModel;
  config: ActiveModelConfig;
  /** Ad-spend layer (spec §3). Absent payload block → seed defaults. */
  adModel: AdModel;
  metadata: ActiveModelMetadata | null;
};

/** Live promote timestamp used by the Phase-1 seed row. */
export const LIVE_MODEL_FITTED_AT = liveSeed.fitted_at;

const FALLBACK_STREAMS_D0: RegressionModel = {
  intercept: liveSeed.payload.streams_d0.intercept,
  log_ml: liveSeed.payload.streams_d0.log_ml,
  feat: liveSeed.payload.streams_d0.feat,
  ed_tier: liveSeed.payload.streams_d0.ed_tier,
  rmse: liveSeed.payload.streams_d0.rmse,
  r2: liveSeed.payload.streams_d0.r2,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireNumberArray(
  value: unknown,
  label: string,
  expectedLength?: number,
): number[] {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.some((item) => typeof item !== "number" || !Number.isFinite(item))
  ) {
    throw new Error(`Active model payload ${label} must be a finite number[]`);
  }
  if (expectedLength != null && value.length !== expectedLength) {
    throw new Error(
      `Active model payload ${label} length ${value.length} !== ${expectedLength}`,
    );
  }
  return value.map(Number);
}

function requireNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Active model payload ${label} must be a finite number`);
  }
  return value;
}

function parseTrend(raw: unknown): TrendPercentiles {
  if (!isRecord(raw)) {
    throw new Error("Active model payload.trend must be an object");
  }
  return {
    median: requireNumberArray(raw.median, "trend.median", 28),
    p25: requireNumberArray(raw.p25, "trend.p25", 28),
    p75: requireNumberArray(raw.p75, "trend.p75", 28),
  };
}

function parseDow(raw: unknown): DowMultipliers {
  if (!isRecord(raw)) {
    throw new Error("Active model payload.dow must be an object");
  }
  const dow = {} as DowMultipliers;
  for (const key of DOW_KEYS) {
    dow[key] = requireNumber(raw[key], `dow.${key}`);
  }
  return dow;
}

function parseReleaseTypeMagnitude(
  raw: unknown,
): ReleaseTypeMagnitudeMultipliers {
  if (!isRecord(raw)) {
    throw new Error(
      "Active model payload.release_type_magnitude_multipliers must be an object",
    );
  }
  const out = {} as ReleaseTypeMagnitudeMultipliers;
  for (const key of RELEASE_TYPE_KEYS) {
    out[key] = requireNumber(raw[key], `release_type_magnitude_multipliers.${key}`);
  }
  return out;
}

function parseSaveRateBands(raw: unknown): SaveRateBands {
  if (!isRecord(raw)) {
    throw new Error("Active model payload.save_rate_bands must be an object");
  }
  const out = {} as SaveRateBands;
  for (const key of GENRE_KEYS) {
    const band = raw[key];
    if (!isRecord(band)) {
      throw new Error(`Active model payload.save_rate_bands.${key} invalid`);
    }
    out[key] = {
      lo: requireNumber(band.lo, `save_rate_bands.${key}.lo`),
      hi: requireNumber(band.hi, `save_rate_bands.${key}.hi`),
    };
  }
  return out;
}

function parseSaveCountBands(raw: unknown): SaveCountBands {
  if (!isRecord(raw)) {
    throw new Error("Active model payload.save_count_bands must be an object");
  }
  const out = {} as SaveCountBands;
  for (const key of TIER_KEYS) {
    const band = raw[key];
    if (!isRecord(band)) {
      throw new Error(`Active model payload.save_count_bands.${key} invalid`);
    }
    out[key] = {
      p25: requireNumber(band.p25, `save_count_bands.${key}.p25`),
      p50: requireNumber(band.p50, `save_count_bands.${key}.p50`),
      p75: requireNumber(band.p75, `save_count_bands.${key}.p75`),
      p90: requireNumber(band.p90, `save_count_bands.${key}.p90`),
    };
  }
  return out;
}

function parseStreamsD0(raw: unknown): RegressionModel {
  if (!isRecord(raw)) {
    throw new Error("Active model payload.streams_d0 must be an object");
  }
  return {
    intercept: requireNumber(raw.intercept, "streams_d0.intercept"),
    log_ml: requireNumber(raw.log_ml, "streams_d0.log_ml"),
    feat: requireNumber(raw.feat, "streams_d0.feat"),
    ed_tier: requireNumber(raw.ed_tier, "streams_d0.ed_tier"),
    rmse: requireNumber(raw.rmse, "streams_d0.rmse"),
    r2: requireNumber(raw.r2, "streams_d0.r2"),
  };
}

function parseConfig(raw: unknown): ActiveModelConfig {
  if (!isRecord(raw)) {
    throw new Error("Active model payload.config must be an object");
  }
  const thresholds = raw.tier_ml_thresholds;
  if (!isRecord(thresholds)) {
    throw new Error("Active model payload.config.tier_ml_thresholds invalid");
  }
  return {
    tierMlThresholds: {
      mid: requireNumber(thresholds.mid, "config.tier_ml_thresholds.mid"),
      established: requireNumber(
        thresholds.established,
        "config.tier_ml_thresholds.established",
      ),
    },
    retrainMinSampleSize: requireNumber(
      raw.retrain_min_sample_size,
      "config.retrain_min_sample_size",
    ),
    retrainThreshold: requireNumber(
      raw.retrain_threshold,
      "config.retrain_threshold",
    ),
    editorialKernelK: requireNumber(
      raw.editorial_kernel_k,
      "config.editorial_kernel_k",
    ),
    streamCurveDayEnd: requireNumber(
      raw.stream_curve_day_end,
      "config.stream_curve_day_end",
    ),
    wk1DayEnd: requireNumber(raw.wk1_day_end, "config.wk1_day_end"),
    releaseTypeMagnitudeShrinkageK: requireNumber(
      raw.release_type_magnitude_shrinkage_k,
      "config.release_type_magnitude_shrinkage_k",
    ),
  };
}

function parseBiasPair(
  raw: unknown,
  label: string,
): { live: number; new: number } {
  if (!isRecord(raw)) {
    throw new Error(`Active model metadata.forward_bias.${label} invalid`);
  }
  return {
    live: requireNumber(raw.live, `forward_bias.${label}.live`),
    new: requireNumber(raw.new, `forward_bias.${label}.new`),
  };
}

export function parseActiveModelMetadata(
  raw: unknown,
): ActiveModelMetadata | null {
  if (raw == null) {
    return null;
  }
  if (!isRecord(raw)) {
    throw new Error("Active model metadata must be an object");
  }
  const sampleSizes = raw.sample_sizes;
  const forwardBias = raw.forward_bias;
  const threshold = raw.threshold;
  if (!isRecord(sampleSizes) || !isRecord(forwardBias) || !isRecord(threshold)) {
    throw new Error("Active model metadata missing required sections");
  }
  return {
    sampleSizes: {
      eligible: requireNumber(sampleSizes.eligible, "metadata.sample_sizes.eligible"),
      clean: requireNumber(sampleSizes.clean, "metadata.sample_sizes.clean"),
      regression: requireNumber(
        sampleSizes.regression,
        "metadata.sample_sizes.regression",
      ),
      derived: requireNumber(sampleSizes.derived, "metadata.sample_sizes.derived"),
    },
    forwardBias: {
      all: parseBiasPair(forwardBias.all, "all"),
      clean: parseBiasPair(forwardBias.clean, "clean"),
      newest10: parseBiasPair(forwardBias.newest_10, "newest_10"),
    },
    cooksDDrops: requireNumber(raw.cooks_d_drops, "metadata.cooks_d_drops"),
    threshold: {
      minSampleSize: requireNumber(
        threshold.min_sample_size,
        "metadata.threshold.min_sample_size",
      ),
      retrainThreshold: requireNumber(
        threshold.retrain_threshold,
        "metadata.threshold.retrain_threshold",
      ),
      cooksDThresholdFactor: requireNumber(
        threshold.cooks_d_threshold_factor,
        "metadata.threshold.cooks_d_threshold_factor",
      ),
    },
    overrideNotes:
      raw.override_notes == null
        ? null
        : String(raw.override_notes),
  };
}

export function parseActiveModelPayload(raw: unknown): Omit<
  ActiveModel,
  "id" | "fittedAt" | "activatedAt" | "source" | "metadata"
> {
  if (!isRecord(raw)) {
    throw new Error("Active model payload must be an object");
  }
  const editorialKernel = requireNumberArray(
    raw.editorial_kernel,
    "editorial_kernel",
  );
  const kernelLength = requireNumber(raw.kernel_length, "kernel_length");
  if (kernelLength !== editorialKernel.length) {
    throw new Error(
      `kernel_length ${kernelLength} !== editorial_kernel.length ${editorialKernel.length}`,
    );
  }
  return {
    trend: parseTrend(raw.trend),
    dow: parseDow(raw.dow),
    editorialKernel,
    kernelLength,
    releaseTypeMagnitudeMultipliers: parseReleaseTypeMagnitude(
      raw.release_type_magnitude_multipliers,
    ),
    saveRateBands: parseSaveRateBands(raw.save_rate_bands),
    saveCountBands: parseSaveCountBands(raw.save_count_bands),
    streamsD0: parseStreamsD0(raw.streams_d0),
    config: parseConfig(raw.config),
    // Optional for pre-ad_model rows; seed fills until a fit is written.
    adModel: parseAdModel(raw.ad_model),
  };
}

/** Constants-backed fallback used when no active version row / DB read fails. */
export function buildFallbackActiveModel(): ActiveModel {
  const seedMeta = parseActiveModelMetadata(liveSeed.metadata);
  return {
    id: null,
    fittedAt: LIVE_MODEL_FITTED_AT,
    activatedAt: LIVE_MODEL_FITTED_AT,
    source: "fallback",
    trend: {
      median: [...STREAM_CURVE_TREND.median],
      p25: [...STREAM_CURVE_TREND.p25],
      p75: [...STREAM_CURVE_TREND.p75],
    },
    dow: { ...STREAM_DOW_MULTIPLIER },
    editorialKernel: [...STREAM_EDITORIAL_KERNEL],
    kernelLength: STREAM_EDITORIAL_KERNEL.length,
    releaseTypeMagnitudeMultipliers: { ...RELEASE_TYPE_MAGNITUDE_MULTIPLIER },
    saveRateBands: {
      dubstep: { ...SAVE_RATE_BANDS.dubstep },
      house: { ...SAVE_RATE_BANDS.house },
      "melodic-bass": { ...SAVE_RATE_BANDS["melodic-bass"] },
      downtempo: { ...SAVE_RATE_BANDS.downtempo },
      "big-room": { ...SAVE_RATE_BANDS["big-room"] },
    },
    saveCountBands: {
      developing: { ...SAVE_COUNT_BANDS.developing },
      mid: { ...SAVE_COUNT_BANDS.mid },
      established: { ...SAVE_COUNT_BANDS.established },
    },
    streamsD0: { ...FALLBACK_STREAMS_D0 },
    config: {
      tierMlThresholds: { ...TIER_ML_THRESHOLDS },
      retrainMinSampleSize: RETRAIN_MIN_SAMPLE_SIZE,
      retrainThreshold: RETRAIN_THRESHOLD,
      editorialKernelK: STREAM_EDITORIAL_KERNEL.length,
      streamCurveDayEnd: 28,
      wk1DayEnd: 7,
      releaseTypeMagnitudeShrinkageK: 5,
    },
    adModel: parseAdModel(
      (liveSeed.payload as { ad_model?: unknown }).ad_model,
    ),
    metadata: seedMeta,
  };
}

// Re-export for callers that already import from active-model.
export type { AdModel } from "@/lib/model/ad-model";
export { SEED_AD_MODEL };

export type ActiveModelRow = {
  id: string;
  fitted_at: string;
  activated_at: string | null;
  payload: unknown;
  metadata: unknown;
};

export function activeModelFromRow(row: ActiveModelRow): ActiveModel {
  const parsed = parseActiveModelPayload(row.payload);
  return {
    id: row.id,
    fittedAt: row.fitted_at,
    activatedAt: row.activated_at,
    source: "db",
    ...parsed,
    metadata: parseActiveModelMetadata(row.metadata),
  };
}

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export type ParityMismatch = { path: string; expected: unknown; actual: unknown };

/** Compare ActiveModel fields that map 1:1 to lib/constants.ts. */
export function collectConstantsParityMismatches(
  model: ActiveModel,
): ParityMismatch[] {
  const mismatches: ParityMismatch[] = [];
  const check = (path: string, expected: unknown, actual: unknown) => {
    if (!deepEqual(expected, actual)) {
      mismatches.push({ path, expected, actual });
    }
  };

  check("trend.median", [...STREAM_CURVE_TREND.median], model.trend.median);
  check("trend.p25", [...STREAM_CURVE_TREND.p25], model.trend.p25);
  check("trend.p75", [...STREAM_CURVE_TREND.p75], model.trend.p75);
  check("dow", { ...STREAM_DOW_MULTIPLIER }, model.dow);
  check(
    "editorialKernel",
    [...STREAM_EDITORIAL_KERNEL],
    model.editorialKernel,
  );
  check("kernelLength", STREAM_EDITORIAL_KERNEL.length, model.kernelLength);
  check(
    "releaseTypeMagnitudeMultipliers",
    { ...RELEASE_TYPE_MAGNITUDE_MULTIPLIER },
    model.releaseTypeMagnitudeMultipliers,
  );
  check(
    "saveRateBands",
    {
      dubstep: { ...SAVE_RATE_BANDS.dubstep },
      house: { ...SAVE_RATE_BANDS.house },
      "melodic-bass": { ...SAVE_RATE_BANDS["melodic-bass"] },
      downtempo: { ...SAVE_RATE_BANDS.downtempo },
      "big-room": { ...SAVE_RATE_BANDS["big-room"] },
    },
    model.saveRateBands,
  );
  check(
    "saveCountBands",
    {
      developing: { ...SAVE_COUNT_BANDS.developing },
      mid: { ...SAVE_COUNT_BANDS.mid },
      established: { ...SAVE_COUNT_BANDS.established },
    },
    model.saveCountBands,
  );
  check(
    "config.tierMlThresholds",
    { ...TIER_ML_THRESHOLDS },
    model.config.tierMlThresholds,
  );
  check(
    "config.retrainMinSampleSize",
    RETRAIN_MIN_SAMPLE_SIZE,
    model.config.retrainMinSampleSize,
  );
  check(
    "config.retrainThreshold",
    RETRAIN_THRESHOLD,
    model.config.retrainThreshold,
  );

  return mismatches;
}
