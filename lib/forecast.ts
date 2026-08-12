import {
  META_CLICK_TO_STREAM_CONVERSION,
  META_DELIVERY_PER_OBJECTIVE,
  STREAM_CURVE_BASELINE,
  TIER_ML_THRESHOLDS,
  type CurvePercentile,
} from "./constants";
import {
  dowMultiplierByIso,
  type ForecastModel,
} from "./model/forecast-model";

// --- Enums / unions ---

export type Genre =
  | "dubstep"
  | "house"
  | "melodic-bass"
  | "downtempo"
  | "big-room";

export type ArtistTier = "developing" | "mid" | "established";

export type EditorialTier = 0 | 1 | 2 | 3;

export type MetaObjective = "awareness" | "traffic" | "streaming";

/** Catalog release role on `releases.release_type` (multipliers TBD). */
export type ReleaseType =
  | "single"
  | "lead_single"
  | "focus_track"
  | "album_track"
  | "alternate_version";

/**
 * Keys in ad_rates.spotify_rates (legacy product types).
 * Catalog ReleaseType is not used for CPS until rates are recalibrated.
 */
export type SpotifyCpsReleaseType = "single" | "ep" | "album";

export type SpotifyFormat = "marquee" | "showcase";

export type StreamsModelKey =
  | "streams_d0"
  | "streams_d1"
  | "streams_d2"
  | "streams_d3"
  | "streams_d4"
  | "streams_d5"
  | "streams_d6"
  | "streams_d7";

export type AlgoBand = "weak" | "typical" | "strong" | "elite";

export type ForecastDay = 1 | 2 | 3 | 4 | 5 | 6 | 7;

// --- Inputs ---

export interface ReleaseForecastInputs {
  monthlyListeners: number;
  isFeature: boolean;
  editorialTier: EditorialTier;
  genre: Genre;
  releaseType: ReleaseType;
  spotifyFormat: SpotifyFormat;
  metaSpendPlanned: number;
  metaObjective: MetaObjective;
  spotifySpendPlanned: number;
}

export interface StreamsRefinementActuals {
  streamsByDay: Partial<
    Record<ForecastDay, number | null | undefined>
  >;
}

function isValidDayStreams(
  value: number | null | undefined,
): value is number {
  return value != null && value > 0;
}

// --- Coefficients (parsed from model_coefficients.coefficients_json) ---

export interface RegressionModel {
  intercept: number;
  rmse: number;
  r2: number;
  [coefficient: string]: number;
}

export interface StreamsModelSet {
  streams_d0: RegressionModel;
  streams_d1: RegressionModel;
  streams_d2: RegressionModel;
  streams_d3: RegressionModel;
  streams_d4: RegressionModel;
  streams_d5: RegressionModel;
  streams_d6: RegressionModel;
  streams_d7: RegressionModel;
}

export interface SavesModel {
  intercept: number;
  log_ml: number;
  feat: number;
  ed_tier: number;
  rmse: number;
  r2: number;
  genre_offset: Record<Genre, number>;
}

export interface ForecastCoefficients {
  streams: StreamsModelSet;
  saves: SavesModel;
}

/** Spotify CPS: product type → format → tier. Null cells use fallback logic at lookup. */
export type SpotifyRateMatrix = Record<
  SpotifyCpsReleaseType,
  Record<SpotifyFormat, Record<ArtistTier, number | null | undefined>>
>;

/** Full ad_rates payload from DB (Meta fields match SCOPE; Spotify is nested). */
export interface AdRates {
  spotify_rates: SpotifyRateMatrix;
  meta_rates_by_genre?: Record<Genre, number>;
  meta_objective_multipliers?: Record<MetaObjective, number>;
  meta_delivery_per_objective?: Record<
    MetaObjective,
    { cpm: number; cpr: number; cpc: number }
  >;
}

// --- Outputs ---

export interface PredictionInterval {
  low: number;
  high: number;
}

export interface StreamsForecast {
  week1Streams: number;
  logWeek1Streams: number;
  modelUsed: StreamsModelKey;
  refinementDay: 0 | ForecastDay;
  rmse: number;
  r2: number;
  interval: PredictionInterval;
}

export interface SavesForecast {
  week1Saves: number;
  logWeek1Saves: number;
  rmse: number;
  r2: number;
  impliedSaveRate?: number;
  interval: PredictionInterval;
}

export interface AdChannelImpact {
  channel: "spotify" | "meta";
  spend: number;
  costPerStream: number;
  estimatedStreams: number;
}

export interface AdImpactForecast {
  tier: ArtistTier;
  spotify: AdChannelImpact;
  meta: AdChannelImpact;
  totalEstimatedStreams: number;
}

export interface PaidDeliveryForecast {
  spend: number;
  objective: MetaObjective;
  impressions: number;
  reach: number;
  clicks: number;
}

export interface AlgoPositioningResult {
  band: AlgoBand;
  tier: ArtistTier;
  saves: number;
  thresholds: {
    p25: number;
    p75: number;
    p90: number;
  };
}

export interface StreamCurveForecast {
  week1Streams: number;
  dailyStreams: number[];
  dailyPct: number[];
  cumulativeStreams: number[];
}

export type CumulativePaceMethod = "locked" | "blended" | "cumulative";

export interface CumulativePaceProjection {
  projectedWeek1: number;
  cumActual: number;
  cumExpectedPct: number;
  daysEntered: number;
  method: CumulativePaceMethod;
}

const LOG_DAY_COEFFICIENT_KEYS: Record<ForecastDay, `log_d${ForecastDay}`> = {
  1: "log_d1",
  2: "log_d2",
  3: "log_d3",
  4: "log_d4",
  5: "log_d5",
  6: "log_d6",
  7: "log_d7",
};

// --- Helpers ---

export function artistTierFromMonthlyListeners(
  monthlyListeners: number,
  thresholds: ForecastModel["config"]["tierMlThresholds"] = TIER_ML_THRESHOLDS,
): ArtistTier {
  if (monthlyListeners >= thresholds.established) {
    return "established";
  }
  if (monthlyListeners >= thresholds.mid) {
    return "mid";
  }
  return "developing";
}

export function selectStreamsModel(actuals?: StreamsRefinementActuals): {
  modelKey: StreamsModelKey;
  refinementDay: 0 | ForecastDay;
} {
  if (!actuals?.streamsByDay) {
    return { modelKey: "streams_d0", refinementDay: 0 };
  }

  let highestDay: 0 | ForecastDay = 0;
  for (let day = 1 as ForecastDay; day <= 7; day++) {
    const value = actuals.streamsByDay[day];
    if (isValidDayStreams(value)) {
      highestDay = day;
    }
  }

  if (highestDay === 0) {
    return { modelKey: "streams_d0", refinementDay: 0 };
  }

  return {
    modelKey: `streams_d${highestDay}` as StreamsModelKey,
    refinementDay: highestDay,
  };
}

function logInterval(mu: number, rmse: number): PredictionInterval {
  return {
    low: Math.round(Math.exp(mu - rmse)),
    high: Math.round(Math.exp(mu + rmse)),
  };
}

function featureValue(isFeature: boolean): number {
  return isFeature ? 1 : 0;
}

function predictLogStreams(
  model: RegressionModel,
  inputs: ReleaseForecastInputs,
  refinementDay: 0 | ForecastDay,
  dayStreams?: number,
): number {
  const logMl = Math.log(inputs.monthlyListeners);

  let mu = model.intercept;
  mu += model.log_ml * logMl;
  mu += model.feat * featureValue(inputs.isFeature);
  mu += model.ed_tier * inputs.editorialTier;

  if (refinementDay > 0 && isValidDayStreams(dayStreams)) {
    const logDayKey = LOG_DAY_COEFFICIENT_KEYS[refinementDay as ForecastDay];
    mu += model[logDayKey] * Math.log(dayStreams);
  }

  return mu;
}

// --- Core forecasts ---

export function predictStreams(
  inputs: ReleaseForecastInputs,
  coefficients: ForecastCoefficients,
  actuals?: StreamsRefinementActuals,
): StreamsForecast {
  const { modelKey, refinementDay } = selectStreamsModel(actuals);
  const model = coefficients.streams[modelKey];

  const dayStreams =
    refinementDay > 0
      ? (() => {
          const value = actuals?.streamsByDay[refinementDay as ForecastDay];
          return isValidDayStreams(value) ? value : undefined;
        })()
      : undefined;

  const logWeek1Streams = predictLogStreams(
    model,
    inputs,
    refinementDay,
    dayStreams,
  );
  const week1Streams = Math.round(Math.exp(logWeek1Streams));

  return {
    week1Streams,
    logWeek1Streams,
    modelUsed: modelKey,
    refinementDay,
    rmse: model.rmse,
    r2: model.r2,
    interval: logInterval(logWeek1Streams, model.rmse),
  };
}

export function projectFromCumulativePace(
  actuals: StreamsRefinementActuals,
  lockedForecast: number,
  curve: readonly number[] = STREAM_CURVE_BASELINE.median,
): CumulativePaceProjection {
  let cumActual = 0;
  let cumExpectedPct = 0;
  let daysEntered = 0;

  for (let day = 1 as ForecastDay; day <= 7; day++) {
    const value = actuals.streamsByDay[day];
    if (!isValidDayStreams(value)) {
      continue;
    }

    cumActual += value;
    cumExpectedPct += curve[day - 1] ?? 0;
    daysEntered += 1;
  }

  const onlyDay1Entered =
    daysEntered === 1 && isValidDayStreams(actuals.streamsByDay[1]);

  if (daysEntered === 0 || cumExpectedPct <= 0) {
    return {
      projectedWeek1: Math.round(lockedForecast),
      cumActual: 0,
      cumExpectedPct: 0,
      daysEntered: 0,
      method: "locked",
    };
  }

  const paceProjection = cumActual / (cumExpectedPct / 100);

  if (onlyDay1Entered) {
    return {
      projectedWeek1: Math.round(
        lockedForecast * 0.7 + paceProjection * 0.3,
      ),
      cumActual,
      cumExpectedPct,
      daysEntered,
      method: "blended",
    };
  }

  return {
    projectedWeek1: Math.round(paceProjection),
    cumActual,
    cumExpectedPct,
    daysEntered,
    method: "cumulative",
  };
}

export function predictSaves(
  inputs: ReleaseForecastInputs,
  coefficients: ForecastCoefficients,
  options?: { week1Streams?: number },
): SavesForecast {
  const model = coefficients.saves;
  const logMl = Math.log(inputs.monthlyListeners);

  const logWeek1Saves =
    model.intercept +
    model.log_ml * logMl +
    model.feat * featureValue(inputs.isFeature) +
    model.ed_tier * inputs.editorialTier +
    model.genre_offset[inputs.genre];

  const week1Saves = Math.round(Math.exp(logWeek1Saves));

  const result: SavesForecast = {
    week1Saves,
    logWeek1Saves,
    rmse: model.rmse,
    r2: model.r2,
    interval: logInterval(logWeek1Saves, model.rmse),
  };

  if (options?.week1Streams && options.week1Streams > 0) {
    result.impliedSaveRate =
      (week1Saves / options.week1Streams) * 100;
  }

  return result;
}

export function predictPaidDelivery(
  spend: number,
  objective: MetaObjective,
  adRates?: AdRates,
): PaidDeliveryForecast {
  const delivery =
    adRates?.meta_delivery_per_objective?.[objective] ??
    META_DELIVERY_PER_OBJECTIVE[objective];

  if (spend <= 0) {
    return {
      spend,
      objective,
      impressions: 0,
      reach: 0,
      clicks: 0,
    };
  }

  return {
    spend,
    objective,
    impressions: Math.round((spend / delivery.cpm) * 1000),
    reach: Math.round((spend / delivery.cpr) * 1000),
    clicks: Math.round(spend / delivery.cpc),
  };
}

export function algoPositioningBand(
  saves: number,
  tier: ArtistTier,
  saveCountBands: ForecastModel["saveCountBands"],
): AlgoPositioningResult {
  const thresholds = saveCountBands[tier];

  let band: AlgoBand;
  if (saves < thresholds.p25) {
    band = "weak";
  } else if (saves < thresholds.p75) {
    band = "typical";
  } else if (saves < thresholds.p90) {
    band = "strong";
  } else {
    band = "elite";
  }

  return {
    band,
    tier,
    saves,
    thresholds,
  };
}

/**
 * Day-number (1-based from release_date) of the first Friday on-or-after release.
 * isoWeekday: Mon=1 … Sun=7, Friday=5.
 * UTC-based so `'YYYY-MM-DD'` and `new Date('YYYY-MM-DD')` agree across timezones.
 */
export function editorialDayNumber(releaseDate: string | Date): number {
  const date =
    typeof releaseDate === "string"
      ? new Date(`${releaseDate}T00:00:00Z`)
      : new Date(releaseDate);

  if (Number.isNaN(date.getTime())) {
    throw new RangeError(`Invalid releaseDate: ${String(releaseDate)}`);
  }

  // JS: Sun=0 … Sat=6 → ISO: Mon=1 … Sun=7 (UTC calendar day)
  const jsDay = date.getUTCDay();
  const isoWeekday = jsDay === 0 ? 7 : jsDay;
  return 1 + ((5 - isoWeekday + 7) % 7);
}

/** ISO weekday Mon=1 … Sun=7 of a calendar release date (UTC). */
function releaseIsoWeekdayFromDate(releaseDate: string | Date): number {
  const date =
    typeof releaseDate === "string"
      ? new Date(`${releaseDate}T00:00:00Z`)
      : new Date(releaseDate);
  if (Number.isNaN(date.getTime())) {
    throw new RangeError(`Invalid releaseDate: ${String(releaseDate)}`);
  }
  const jsDay = date.getUTCDay();
  return jsDay === 0 ? 7 : jsDay;
}

/**
 * ISO weekday of campaign day `dayNumber` (1-based) given release ISO weekday.
 * releaseIso=4 (Thu), day 1 → Thu; day 2 → Fri; …
 */
export function isoWeekdayOnCampaignDay(
  releaseIsoWeekday: number,
  dayNumber: number,
): number {
  return ((releaseIsoWeekday - 1 + dayNumber - 1) % 7) + 1;
}

/**
 * Infer release ISO weekday from editorial offset when no releaseDate is passed.
 * offset 1 → Fri … offset 2 → Thu (calibration default).
 */
function releaseIsoFromEditorialOffset(offset: number): number {
  let iso = 5 - (offset - 1);
  if (iso < 1) iso += 7;
  return iso;
}

export interface BuildStreamCurveOptions {
  percentile?: CurvePercentile;
  /** Release calendar date — preferred way to place the editorial kernel. */
  releaseDate?: string | Date;
  /** Precomputed editorial day-number; overrides releaseDate when set. */
  editorialDayNumber?: number;
}

/**
 * Compose seasonless trend × DOW multiplier + editorial kernel, then rescale
 * days 1–7 to sum to 100% so dailyStreams preserve the locked week-1 total.
 *
 * TODO: weekend-release normalization — Sat/Sun place part of the editorial
 * bump at/beyond the wk1 boundary; kernel is clamped to the available window.
 */
export function composeStreamCurvePct(
  model: ForecastModel,
  options?: BuildStreamCurveOptions,
): number[] {
  const percentile = options?.percentile ?? "median";
  const trend = model.trend[percentile];
  const dowByIso = dowMultiplierByIso(model.dow);
  const offset =
    options?.editorialDayNumber ??
    (options?.releaseDate != null
      ? editorialDayNumber(options.releaseDate)
      : 2); // Thursday calibration default when callers omit date
  const releaseIso =
    options?.releaseDate != null
      ? releaseIsoWeekdayFromDate(options.releaseDate)
      : releaseIsoFromEditorialOffset(offset);

  const composed = trend.map((trendPct, index) => {
    const dayNumber = index + 1;
    const iso = isoWeekdayOnCampaignDay(releaseIso, dayNumber);
    const dow = dowByIso[iso]!;
    const kernelIndex = dayNumber - offset;
    const editorial =
      kernelIndex >= 0 && kernelIndex < model.editorialKernel.length
        ? model.editorialKernel[kernelIndex]!
        : 0;
    return trendPct * dow + editorial;
  });

  const week1Sum = composed.slice(0, 7).reduce((sum, pct) => sum + pct, 0);
  if (week1Sum <= 0) {
    return composed;
  }

  const scale = 100 / week1Sum;
  return composed.map((pct, index) =>
    index < 7 ? pct * scale : pct,
  );
}

export function buildStreamCurve(
  model: ForecastModel,
  week1Streams: number,
  options?: BuildStreamCurveOptions,
): StreamCurveForecast {
  const dailyPct = composeStreamCurvePct(model, options);

  const dailyStreams = dailyPct.map((pct) =>
    Math.round((week1Streams * pct) / 100),
  );

  const cumulativeStreams: number[] = [];
  let runningTotal = 0;
  for (const dayStreams of dailyStreams) {
    runningTotal += dayStreams;
    cumulativeStreams.push(runningTotal);
  }

  return {
    week1Streams,
    dailyStreams,
    dailyPct,
    cumulativeStreams,
  };
}

export function expectedStreamsOnDay(
  model: ForecastModel,
  week1Streams: number,
  dayNumber: number,
  options?: BuildStreamCurveOptions,
): number {
  if (dayNumber < 1 || dayNumber > 28) {
    throw new RangeError(`dayNumber must be 1–28, got ${dayNumber}`);
  }

  const dailyPct = composeStreamCurvePct(model, options)[dayNumber - 1]!;
  return Math.round((week1Streams * dailyPct) / 100);
}

export function computeLockedForecast(
  inputs: ReleaseForecastInputs,
  coefficients: ForecastCoefficients,
  adRates: AdRates,
  model: ForecastModel,
  options: { releaseDate: string | Date },
): {
  streams: StreamsForecast;
  saves: SavesForecast;
  metaDelivery: PaidDeliveryForecast;
  algoPositioning: AlgoPositioningResult;
  streamCurve: StreamCurveForecast;
} {
  const magnitude =
    model.releaseTypeMagnitudeMultipliers[inputs.releaseType];

  const rawStreams = predictStreams(inputs, coefficients);
  const rawSaves = predictSaves(inputs, coefficients, {
    week1Streams: rawStreams.week1Streams,
  });

  // Scale locked wk1 totals only — curve dailyPct shape is unchanged.
  const week1Streams = Math.round(rawStreams.week1Streams * magnitude);
  const week1Saves = Math.round(rawSaves.week1Saves * magnitude);
  const streams: StreamsForecast = {
    ...rawStreams,
    week1Streams,
  };
  const saves: SavesForecast = {
    ...rawSaves,
    week1Saves,
    impliedSaveRate:
      week1Streams > 0 ? (week1Saves / week1Streams) * 100 : rawSaves.impliedSaveRate,
  };

  const metaDelivery = predictPaidDelivery(
    inputs.metaSpendPlanned,
    inputs.metaObjective,
    adRates,
  );
  const tier = artistTierFromMonthlyListeners(
    inputs.monthlyListeners,
    model.config.tierMlThresholds,
  );
  const algoPositioning = algoPositioningBand(
    saves.week1Saves,
    tier,
    model.saveCountBands,
  );
  const streamCurve = buildStreamCurve(model, streams.week1Streams, {
    releaseDate: options.releaseDate,
  });

  return {
    streams,
    saves,
    metaDelivery,
    algoPositioning,
    streamCurve,
  };
}

export interface MetaFunnelForecast {
  projectedImpressions: number;
  projectedClicks: number;
  projectedStreamConversions: number;
  cpm: number;
  cpc: number;
  ctr: number;
  clickToStreamRate: number;
}

/** Meta funnel readout from catalog-calibrated delivery rates + genre click-to-stream. */
export function computeMetaFunnel(
  spend: number,
  objective: MetaObjective,
  genre: Genre,
): MetaFunnelForecast {
  const delivery = META_DELIVERY_PER_OBJECTIVE[objective];
  const cpm = delivery.cpm;
  const cpc = delivery.cpc;
  const ctr = cpm / 1000 / cpc;
  const clickToStreamRate = META_CLICK_TO_STREAM_CONVERSION[genre];

  const paidDelivery = predictPaidDelivery(spend, objective);

  const projectedStreamConversions =
    paidDelivery.clicks > 0
      ? Math.round(paidDelivery.clicks * clickToStreamRate)
      : 0;

  return {
    projectedImpressions: paidDelivery.impressions,
    projectedClicks: paidDelivery.clicks,
    projectedStreamConversions,
    cpm,
    cpc,
    ctr,
    clickToStreamRate,
  };
}
