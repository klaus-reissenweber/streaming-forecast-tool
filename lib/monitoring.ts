import { SAVE_COUNT_BANDS } from "@/lib/constants";
import { formatCompactNumber } from "@/lib/format";
import type {
  AlgoBand,
  AlgoPositioningResult,
  ArtistTier,
  CumulativePaceMethod,
  ForecastDay,
  ReleaseForecastInputs,
  StreamCurveForecast,
  StreamsRefinementActuals,
} from "@/lib/forecast";
import {
  algoPositioningBand,
  artistTierFromMonthlyListeners,
  buildStreamCurve,
  projectFromCumulativePace,
} from "@/lib/forecast";
import type { DailyDataPoint, ReleaseRecord } from "@/lib/map-release-row";

/** ±10% band for on-track / outperforming / lagging (v1). */
export const HEALTH_OUTPERFORM_THRESHOLD_PCT = 10;
export const HEALTH_LAGGING_THRESHOLD_PCT = -10;

export type HealthStatus =
  | "awaiting"
  | "on-track"
  | "outperforming"
  | "lagging";

export type HealthTone = "neutral" | "positive" | "warning" | "negative";

export interface MonitoringLockedForecast {
  streams: number;
  saves: number;
}

export interface DailyActuals {
  streamsByDay: Partial<Record<ForecastDay, number>>;
  savesByDay: Partial<Record<ForecastDay, number>>;
  otherPctByDay: Partial<Record<number, number | null>>;
}

export interface HealthSummary {
  status: HealthStatus;
  tone: HealthTone;
  title: string;
  detail: string;
  projectedWk1: number;
  lockedWk1: number;
  deltaPct: number;
  method: CumulativePaceMethod;
  streamDaysEntered: number;
  cumActual: number;
  cumExpectedPct: number;
}

export interface SaveVelocitySummary {
  display: string | null;
  projectedWeek1Saves: number | null;
  cumSaves: number;
  saveDaysEntered: number;
  actualSaveRate: number | null;
  vsTypicalPct: number | null;
  liveAlgoBand: AlgoBand | null;
}

export interface MonitoringSummary {
  health: HealthSummary;
  saveVelocity: SaveVelocitySummary;
  lockedStreamCurve: StreamCurveForecast;
  projectedStreamCurve: StreamCurveForecast | null;
  liveAlgoPositioning: AlgoPositioningResult | null;
}

function isValidStreamDay(value: number | null | undefined): value is number {
  return value != null && value > 0;
}

function healthToneForStatus(status: HealthStatus): HealthTone {
  switch (status) {
    case "outperforming":
      return "positive";
    case "lagging":
      return "negative";
    default:
      return "neutral";
  }
}

function classifyHealthStatus(
  streamDaysEntered: number,
  deltaPct: number,
): HealthStatus {
  if (streamDaysEntered === 0) {
    return "awaiting";
  }
  if (deltaPct >= HEALTH_OUTPERFORM_THRESHOLD_PCT) {
    return "outperforming";
  }
  if (deltaPct <= HEALTH_LAGGING_THRESHOLD_PCT) {
    return "lagging";
  }
  return "on-track";
}

function healthCopy(
  status: HealthStatus,
  projectedWk1: number,
  lockedWk1: number,
  deltaPct: number,
  streamDaysEntered: number,
): { title: string; detail: string } {
  const projectedLabel = formatCompactNumber(projectedWk1);
  const lockedLabel = formatCompactNumber(lockedWk1);
  const dayRange =
    streamDaysEntered === 1
      ? "D1"
      : `D1–D${streamDaysEntered}`;

  switch (status) {
    case "awaiting":
      return {
        title: "Awaiting day 1 data",
        detail:
          "Health scoring activates once daily streams are entered after release.",
      };
    case "outperforming":
      return {
        title: "Outperforming locked forecast",
        detail: `Projected ${projectedLabel} wk1 vs ${lockedLabel} locked (+${Math.abs(deltaPct).toFixed(0)}% from ${dayRange} pace).`,
      };
    case "lagging":
      return {
        title: "Lagging locked forecast",
        detail: `Projected ${projectedLabel} wk1 vs ${lockedLabel} locked (${deltaPct.toFixed(0)}% from ${dayRange} pace).`,
      };
    case "on-track":
      return {
        title: "On track",
        detail: `Projected ${projectedLabel} wk1 vs ${lockedLabel} locked (within ±${HEALTH_OUTPERFORM_THRESHOLD_PCT}% from ${dayRange} pace).`,
      };
  }
}

/** Maps daily_data rows to day-indexed actuals for monitoring math. */
export function dailyDataToActuals(dailyData: DailyDataPoint[]): DailyActuals {
  const streamsByDay: Partial<Record<ForecastDay, number>> = {};
  const savesByDay: Partial<Record<ForecastDay, number>> = {};
  const otherPctByDay: Partial<Record<number, number | null>> = {};

  for (const row of dailyData) {
    if (row.day_number >= 1 && row.day_number <= 7) {
      if (isValidStreamDay(row.streams)) {
        streamsByDay[row.day_number as ForecastDay] = row.streams;
      }
      if (row.saves != null && row.saves >= 0) {
        savesByDay[row.day_number as ForecastDay] = row.saves;
      }
    }
    if (row.day_number >= 1 && row.day_number <= 28) {
      otherPctByDay[row.day_number] = row.other_pct;
    }
  }

  return { streamsByDay, savesByDay, otherPctByDay };
}

/** Stream pace health vs locked forecast via cumulative curve projection. */
export function computeHealthSummary(
  streamsActuals: StreamsRefinementActuals,
  lockedStreams: number,
): HealthSummary {
  const pace = projectFromCumulativePace(streamsActuals, lockedStreams);

  const deltaPct =
    lockedStreams > 0
      ? ((pace.projectedWeek1 - lockedStreams) / lockedStreams) * 100
      : 0;

  const status = classifyHealthStatus(pace.daysEntered, deltaPct);
  const { title, detail } = healthCopy(
    status,
    pace.projectedWeek1,
    lockedStreams,
    deltaPct,
    pace.daysEntered,
  );

  return {
    status,
    tone: healthToneForStatus(status),
    title,
    detail,
    projectedWk1: pace.projectedWeek1,
    lockedWk1: lockedStreams,
    deltaPct,
    method: pace.method,
    streamDaysEntered: pace.daysEntered,
    cumActual: pace.cumActual,
    cumExpectedPct: pace.cumExpectedPct,
  };
}

function countSaveDaysEntered(
  savesByDay: Partial<Record<ForecastDay, number>>,
): number {
  let count = 0;
  for (let day = 1 as ForecastDay; day <= 7; day++) {
    if (savesByDay[day] != null) {
      count += 1;
    }
  }
  return count;
}

function sumSavesOnStreamPaceDays(
  savesByDay: Partial<Record<ForecastDay, number>>,
  streamsByDay: Partial<Record<ForecastDay, number>>,
): number {
  let total = 0;
  for (let day = 1 as ForecastDay; day <= 7; day++) {
    if (isValidStreamDay(streamsByDay[day]) && savesByDay[day] != null) {
      total += savesByDay[day]!;
    }
  }
  return total;
}

/** Save pace vs tier-typical (SAVE_COUNT_BANDS p50 from lib/constants.ts). */
export function computeSaveVelocitySummary(
  actuals: DailyActuals,
  tier: ArtistTier,
  cumExpectedPct: number,
  cumStreams: number,
): SaveVelocitySummary {
  const saveDaysEntered = countSaveDaysEntered(actuals.savesByDay);
  const cumSaves = sumSavesOnStreamPaceDays(
    actuals.savesByDay,
    actuals.streamsByDay,
  );

  if (saveDaysEntered === 0 || cumExpectedPct <= 0) {
    return {
      display: null,
      projectedWeek1Saves: null,
      cumSaves,
      saveDaysEntered,
      actualSaveRate: null,
      vsTypicalPct: null,
      liveAlgoBand: null,
    };
  }

  const projectedWeek1Saves = Math.round(
    cumSaves / (cumExpectedPct / 100),
  );

  const tierTypicalSaves = SAVE_COUNT_BANDS[tier].p50;
  const vsTypicalPct =
    tierTypicalSaves > 0
      ? (projectedWeek1Saves / tierTypicalSaves) * 100
      : null;

  const actualSaveRate =
    cumStreams > 0 ? (cumSaves / cumStreams) * 100 : null;

  const liveAlgoBand = algoPositioningBand(
    projectedWeek1Saves,
    tier,
  ).band;

  const display =
    vsTypicalPct != null
      ? `${Math.round(vsTypicalPct)}% of typical`
      : null;

  return {
    display,
    projectedWeek1Saves,
    cumSaves,
    saveDaysEntered,
    actualSaveRate,
    vsTypicalPct,
    liveAlgoBand,
  };
}

/** Assembles all live monitoring metrics from release + daily_data. */
export function computeMonitoringSummary(
  release: ReleaseRecord,
  _inputs: ReleaseForecastInputs,
  dailyData: DailyDataPoint[],
  locked: MonitoringLockedForecast,
): MonitoringSummary {
  const actuals = dailyDataToActuals(dailyData);
  const tier = artistTierFromMonthlyListeners(release.monthly_listeners);

  const health = computeHealthSummary(
    { streamsByDay: actuals.streamsByDay },
    locked.streams,
  );

  const saveVelocity = computeSaveVelocitySummary(
    actuals,
    tier,
    health.cumExpectedPct,
    health.cumActual,
  );

  const lockedStreamCurve = buildStreamCurve(locked.streams);
  const projectedStreamCurve =
    health.streamDaysEntered > 0
      ? buildStreamCurve(health.projectedWk1)
      : null;

  const liveAlgoPositioning =
    saveVelocity.projectedWeek1Saves != null
      ? algoPositioningBand(saveVelocity.projectedWeek1Saves, tier)
      : null;

  return {
    health,
    saveVelocity,
    lockedStreamCurve,
    projectedStreamCurve,
    liveAlgoPositioning,
  };
}

/** Pre-release placeholder before daily stream data exists. */
export function emptyMonitoringSummary(
  locked: MonitoringLockedForecast,
): MonitoringSummary {
  const health = computeHealthSummary({ streamsByDay: {} }, locked.streams);
  const tier = "developing" as ArtistTier;

  return {
    health,
    saveVelocity: computeSaveVelocitySummary(
      { streamsByDay: {}, savesByDay: {}, otherPctByDay: {} },
      tier,
      0,
      0,
    ),
    lockedStreamCurve: buildStreamCurve(locked.streams),
    projectedStreamCurve: null,
    liveAlgoPositioning: null,
  };
}
