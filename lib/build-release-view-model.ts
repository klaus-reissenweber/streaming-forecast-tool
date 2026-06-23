import {
  formatLockTimestamp,
  formatReleaseDate,
} from "@/lib/format";
import type { ChannelMixRecommendation } from "@/lib/channel-mix";
import { recommendChannelMix } from "@/lib/channel-mix";
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
  releaseRowToForecastInputs,
  type DailyDataPoint,
  type ReleaseRecord,
} from "@/lib/map-release-row";

export type ReleasePhase = "pre-release" | "monitoring";

export interface OtherPctDayPoint {
  day: number;
  otherPct: number | null;
}

export interface LockedForecastSummary {
  streams: number;
  saves: number;
  impliedSaveRate: number;
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
  algoPositioning: AlgoPositioningResult;
  channelMix: ChannelMixRecommendation;
  modelConfidenceR2: number;
  streamCurve: StreamCurveForecast;
  actualStreamsByDay: (number | null)[];
  otherPctByDay: OtherPctDayPoint[];
}

function chartSeriesFromDailyData(dailyData: DailyDataPoint[]): {
  actualStreamsByDay: (number | null)[];
  otherPctByDay: OtherPctDayPoint[];
} {
  const streamsByDay = new Map<number, number>();
  const otherByDay = new Map<number, number | null>();

  for (const row of dailyData) {
    streamsByDay.set(row.day_number, row.streams);
    otherByDay.set(row.day_number, row.other_pct);
  }

  const actualStreamsByDay = Array.from({ length: 28 }, (_, index) =>
    streamsByDay.get(index + 1) ?? null,
  );
  const otherPctByDay = Array.from({ length: 28 }, (_, index) => ({
    day: index + 1,
    otherPct: otherByDay.get(index + 1) ?? null,
  }));

  return { actualStreamsByDay, otherPctByDay };
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
  adRates: AdRates,
  streamsD0R2: number,
): ReleaseViewModel {
  const daysEntered = dailyData.length;
  const phase: ReleasePhase = daysEntered === 0 ? "pre-release" : "monitoring";
  const inputs = releaseRowToForecastInputs(release);

  const locked: LockedForecastSummary = {
    streams: release.locked_forecast_streams,
    saves: release.locked_forecast_saves,
    impliedSaveRate: computeImpliedSaveRate(
      release.locked_forecast_streams,
      release.locked_forecast_saves,
    ),
    lockedAt: release.created_at,
    lockedAtDisplay: formatLockTimestamp(release.created_at),
  };

  const tier = artistTierFromMonthlyListeners(release.monthly_listeners);
  const algoPositioning = algoPositioningBand(release.locked_forecast_saves, tier);
  const channelMix = recommendChannelMix(inputs, adRates);
  const streamCurve = buildStreamCurve(release.locked_forecast_streams);
  const { actualStreamsByDay, otherPctByDay } =
    chartSeriesFromDailyData(dailyData);

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
    algoPositioning,
    channelMix,
    modelConfidenceR2: streamsD0R2,
    streamCurve,
    actualStreamsByDay,
    otherPctByDay,
  };
}
