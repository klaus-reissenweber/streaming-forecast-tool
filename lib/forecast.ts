import {
  META_DELIVERY_PER_OBJECTIVE,
  META_OBJECTIVE_MULTIPLIERS,
  META_RATES_BY_GENRE,
  SAVE_COUNT_BANDS,
  STREAM_CURVE_TEMPLATE,
  TIER_ML_THRESHOLDS,
  type CurvePercentile,
} from "./constants";

// --- Enums / unions ---

export type Genre =
  | "dubstep"
  | "house"
  | "melodic-bass"
  | "downtempo"
  | "big-room";

export type ArtistTier = "developing" | "mid" | "established";

export type EditorialTier = 0 | 1 | 2 | 3;

export type MetaObjective = "traffic" | "awareness" | "reach";

export type ReleaseType = "single" | "ep" | "album";

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

/** Spotify CPS: release_type → format → tier. Null cells use fallback logic at lookup. */
export type SpotifyRateMatrix = Record<
  ReleaseType,
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

const SPOTIFY_RATE_FALLBACK_MULTIPLIER: Partial<Record<ReleaseType, number>> = {
  ep: 0.5,
  album: 0.25,
};

// --- Helpers ---

export function artistTierFromMonthlyListeners(
  monthlyListeners: number,
): ArtistTier {
  if (monthlyListeners >= TIER_ML_THRESHOLDS.established) {
    return "established";
  }
  if (monthlyListeners >= TIER_ML_THRESHOLDS.mid) {
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

function isValidSpotifyRate(
  rate: number | null | undefined,
): rate is number {
  return rate != null && rate > 0;
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

function lookupSpotifyCps(
  adRates: AdRates,
  releaseType: ReleaseType,
  format: SpotifyFormat,
  tier: ArtistTier,
): number {
  const direct = adRates.spotify_rates[releaseType][format][tier];
  if (isValidSpotifyRate(direct)) {
    return direct;
  }

  const fallbackMultiplier = SPOTIFY_RATE_FALLBACK_MULTIPLIER[releaseType];
  if (fallbackMultiplier === undefined) {
    throw new Error(
      `No Spotify CPS rate for ${releaseType}/${format}/${tier} and no fallback is defined for this release type.`,
    );
  }

  const singleRate = adRates.spotify_rates.single[format][tier];
  if (!isValidSpotifyRate(singleRate)) {
    throw new Error(
      `No Spotify CPS rate for ${releaseType}/${format}/${tier} and single/${format}/${tier} fallback is also missing.`,
    );
  }

  return singleRate * fallbackMultiplier;
}

function metaCps(genre: Genre, objective: MetaObjective, adRates?: AdRates): number {
  const baseRate =
    adRates?.meta_rates_by_genre?.[genre] ?? META_RATES_BY_GENRE[genre];
  const multiplier =
    adRates?.meta_objective_multipliers?.[objective] ??
    META_OBJECTIVE_MULTIPLIERS[objective];
  return baseRate * multiplier;
}

function estimatedStreamsFromSpend(spend: number, costPerStream: number): number {
  if (spend <= 0 || costPerStream <= 0) {
    return 0;
  }
  return Math.round(spend / costPerStream);
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
  curve: readonly number[] = STREAM_CURVE_TEMPLATE.median,
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

export function predictAdImpact(
  inputs: Pick<
    ReleaseForecastInputs,
    | "monthlyListeners"
    | "genre"
    | "releaseType"
    | "spotifyFormat"
    | "spotifySpendPlanned"
    | "metaSpendPlanned"
    | "metaObjective"
  >,
  adRates: AdRates,
): AdImpactForecast {
  const tier = artistTierFromMonthlyListeners(inputs.monthlyListeners);

  const spotifyCps = lookupSpotifyCps(
    adRates,
    inputs.releaseType,
    inputs.spotifyFormat,
    tier,
  );
  const metaCpsValue = metaCps(inputs.genre, inputs.metaObjective, adRates);

  const spotify: AdChannelImpact = {
    channel: "spotify",
    spend: inputs.spotifySpendPlanned,
    costPerStream: spotifyCps,
    estimatedStreams: estimatedStreamsFromSpend(
      inputs.spotifySpendPlanned,
      spotifyCps,
    ),
  };

  const meta: AdChannelImpact = {
    channel: "meta",
    spend: inputs.metaSpendPlanned,
    costPerStream: metaCpsValue,
    estimatedStreams: estimatedStreamsFromSpend(
      inputs.metaSpendPlanned,
      metaCpsValue,
    ),
  };

  return {
    tier,
    spotify,
    meta,
    totalEstimatedStreams: spotify.estimatedStreams + meta.estimatedStreams,
  };
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
): AlgoPositioningResult {
  const thresholds = SAVE_COUNT_BANDS[tier];

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

export function buildStreamCurve(
  week1Streams: number,
  options?: { percentile?: CurvePercentile },
): StreamCurveForecast {
  const percentile = options?.percentile ?? "median";
  const dailyPct = [...STREAM_CURVE_TEMPLATE[percentile]];

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
  week1Streams: number,
  dayNumber: number,
  options?: { percentile?: CurvePercentile },
): number {
  if (dayNumber < 1 || dayNumber > 28) {
    throw new RangeError(`dayNumber must be 1–28, got ${dayNumber}`);
  }

  const percentile = options?.percentile ?? "median";
  const dailyPct = STREAM_CURVE_TEMPLATE[percentile][dayNumber - 1];
  return Math.round((week1Streams * dailyPct) / 100);
}

export function computeLockedForecast(
  inputs: ReleaseForecastInputs,
  coefficients: ForecastCoefficients,
  adRates: AdRates,
): {
  streams: StreamsForecast;
  saves: SavesForecast;
  adImpact: AdImpactForecast;
  metaDelivery: PaidDeliveryForecast;
  algoPositioning: AlgoPositioningResult;
  streamCurve: StreamCurveForecast;
} {
  const streams = predictStreams(inputs, coefficients);
  const saves = predictSaves(inputs, coefficients, {
    week1Streams: streams.week1Streams,
  });
  const adImpact = predictAdImpact(inputs, adRates);
  const metaDelivery = predictPaidDelivery(
    inputs.metaSpendPlanned,
    inputs.metaObjective,
    adRates,
  );
  const tier = artistTierFromMonthlyListeners(inputs.monthlyListeners);
  const algoPositioning = algoPositioningBand(saves.week1Saves, tier);
  const streamCurve = buildStreamCurve(streams.week1Streams);

  return {
    streams,
    saves,
    adImpact,
    metaDelivery,
    algoPositioning,
    streamCurve,
  };
}
