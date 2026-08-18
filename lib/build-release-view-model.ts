import {
  formatLockTimestamp,
  formatReleaseDate,
} from "@/lib/format";
import { computeFlagsForRelease } from "@/lib/flags";
import type { ReleaseFlag } from "@/lib/flags";
import type {
  AdRates,
  AlgoPositioningResult,
  ReleaseForecastInputs,
} from "@/lib/forecast";
import {
  algoPositioningBand,
  artistTierFromMonthlyListeners,
  buildStreamCurve,
  type StreamCurveForecast,
} from "@/lib/forecast";
import {
  adSpendPlanFromRelease,
  buildAdDailyLayer,
  type AdDailyLayer,
} from "@/lib/ad-forecast";
import {
  formatActiveModelSource,
  type ForecastModel,
} from "@/lib/model/forecast-model";
import type { ActiveModel } from "@/lib/model/active-model";
import {
  computeMonitoringSummary,
  emptyMonitoringSummary,
  type MonitoringSummary,
} from "@/lib/monitoring";
import {
  releaseRowToForecastInputs,
  type DailyDataPoint,
  type ReleaseRecord,
} from "@/lib/map-release-row";
import { computeWeek1Actuals } from "@/lib/compute-week1-actuals";
import {
  classifySaveRateVsBand,
  classifyStreamsVsBand,
  expectedStreamRange,
  type SaveRateVsBand,
} from "@/lib/save-rate-band-label";
import {
  primaryReleaseArtist,
  type ReleaseArtist,
} from "@/lib/release-artists";

export type ReleasePhase = "pre-release" | "monitoring";

export interface LockedForecastSummary {
  streams: number;
  saves: number;
  impliedSaveRate: number;
  saveRateBand: { lo: number; hi: number };
  streamBand: { lo: number; hi: number; n: number };
  expectedStreamRange: { lo: number; hi: number };
  lockedAt: string;
  lockedAtDisplay: string;
}

export interface ReleaseViewModel {
  release: ReleaseRecord;
  inputs: ReleaseForecastInputs;
  locked: LockedForecastSummary;
  dailyData: DailyDataPoint[];
  phase: ReleasePhase;
  daysEntered: number;
  header: {
    trackName: string;
    artistName: string;
    genre: ReleaseRecord["genre"];
    releaseDate: string;
    releaseDateDisplay: string;
    editorialTier: ReleaseRecord["editorial_tier"];
    status: ReleaseRecord["status"];
  };
  artists: ReleaseArtist[];
  algoPositioning: AlgoPositioningResult;
  modelConfidenceR2: number;
  /** DB row id / fitted_at, or "fallback" — for prod observability. */
  activeModelSource: string;
  streamCurve: StreamCurveForecast;
  /** Additive ad layer on top of organic locked curve (spec §4). */
  adLayer: AdDailyLayer;
  actualStreamsByDay: (number | null)[];
  monitoring: MonitoringSummary;
  flags: readonly ReleaseFlag[];
  actualSaveRate: number | null;
  actualSaveRateVsBand: SaveRateVsBand | null;
  actualStreams: number | null;
  actualStreamsVsBand: SaveRateVsBand | null;
  wk1Complete: boolean;
}

function chartSeriesFromDailyData(dailyData: DailyDataPoint[]): {
  actualStreamsByDay: (number | null)[];
} {
  const streamsByDay = new Map<number, number>();

  for (const row of dailyData) {
    streamsByDay.set(row.day_number, row.streams);
  }

  const actualStreamsByDay = Array.from({ length: 28 }, (_, index) =>
    streamsByDay.get(index + 1) ?? null,
  );

  return { actualStreamsByDay };
}

function computeImpliedSaveRate(streams: number, saves: number): number {
  if (streams <= 0) {
    return 0;
  }
  return (saves / streams) * 100;
}

/** Pure assembly of release detail state from validated DB rows. */
export function buildReleaseViewModel(
  release: ReleaseRecord,
  dailyData: DailyDataPoint[],
  _adRates: AdRates,
  streamsD0R2: number,
  model: ActiveModel,
  artists: readonly ReleaseArtist[] = [],
): ReleaseViewModel {
  const daysEntered = dailyData.length;
  const phase: ReleasePhase = daysEntered === 0 ? "pre-release" : "monitoring";
  const inputs = releaseRowToForecastInputs(release);
  const forecastModel: ForecastModel = model;

  const impliedSaveRate = computeImpliedSaveRate(
    release.locked_forecast_streams,
    release.locked_forecast_saves,
  );
  const saveRateBand = forecastModel.saveRateBands[release.genre];
  const streamBand = forecastModel.streamBands;
  const wk1Actuals = computeWeek1Actuals(dailyData);
  const actualSaveRate =
    wk1Actuals.streams != null &&
    wk1Actuals.saves != null &&
    wk1Actuals.streams > 0
      ? (wk1Actuals.saves / wk1Actuals.streams) * 100
      : null;
  const actualSaveRateVsBand =
    actualSaveRate == null
      ? null
      : classifySaveRateVsBand(actualSaveRate, saveRateBand);
  const expectedRange = expectedStreamRange(
    release.locked_forecast_streams,
    streamBand,
  );
  const actualStreamsVsBand =
    wk1Actuals.isComplete && wk1Actuals.streams != null
      ? classifyStreamsVsBand(
          wk1Actuals.streams,
          release.locked_forecast_streams,
          streamBand,
        )
      : null;
  const locked: LockedForecastSummary = {
    streams: release.locked_forecast_streams,
    saves: release.locked_forecast_saves,
    impliedSaveRate,
    saveRateBand,
    streamBand,
    expectedStreamRange: expectedRange,
    lockedAt: release.created_at,
    lockedAtDisplay: formatLockTimestamp(release.created_at),
  };

  const tier = artistTierFromMonthlyListeners(
    release.monthly_listeners_at_release,
    forecastModel.config.tierMlThresholds,
  );
  const algoPositioning = algoPositioningBand(
    release.locked_forecast_saves,
    tier,
    forecastModel.saveCountBands,
  );
  const adPlan = adSpendPlanFromRelease(
    release,
    primaryReleaseArtist(artists)?.artist_name ?? "",
  );
  const streamCurve = buildStreamCurve(
    forecastModel,
    release.locked_forecast_streams,
    { releaseDate: release.release_date },
  );
  const adLayer = buildAdDailyLayer(
    adPlan,
    model.adModel,
    release.locked_forecast_streams,
  );
  const { actualStreamsByDay } = chartSeriesFromDailyData(dailyData);

  const monitoring =
    phase === "monitoring"
      ? computeMonitoringSummary(
          release,
          inputs,
          dailyData,
          locked,
          forecastModel,
        )
      : emptyMonitoringSummary(locked, release.release_date, forecastModel);

  const flags =
    phase === "monitoring"
      ? computeFlagsForRelease(
          release,
          inputs,
          dailyData,
          locked,
          monitoring,
          forecastModel,
        )
      : [];

  return {
    release,
    inputs,
    locked,
    dailyData,
    phase,
    daysEntered,
    header: {
      trackName: release.track_name,
      artistName: release.artist_name,
      genre: release.genre,
      releaseDate: release.release_date,
      releaseDateDisplay: formatReleaseDate(release.release_date),
      editorialTier: release.editorial_tier,
      status: release.status,
    },
    artists: [...artists],
    algoPositioning,
    modelConfidenceR2: streamsD0R2,
    activeModelSource: formatActiveModelSource(model),
    streamCurve,
    adLayer,
    actualStreamsByDay,
    monitoring,
    flags,
    actualSaveRate,
    actualSaveRateVsBand,
    actualStreams: wk1Actuals.streams,
    actualStreamsVsBand,
    wk1Complete: wk1Actuals.isComplete,
  };
}
