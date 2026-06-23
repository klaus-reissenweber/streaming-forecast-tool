import { SAVE_COUNT_BANDS, SAVE_RATE_BANDS } from "@/lib/constants";
import { formatCompactNumber, formatPercent } from "@/lib/format";
import type { ArtistTier, ForecastDay, ReleaseForecastInputs } from "@/lib/forecast";
import { artistTierFromMonthlyListeners, expectedStreamsOnDay } from "@/lib/forecast";
import type { DailyDataPoint, ReleaseRecord } from "@/lib/map-release-row";
import {
  dailyDataToActuals,
  type MonitoringLockedForecast,
  type MonitoringSummary,
} from "@/lib/monitoring";

export type FlagType = "positive" | "warning" | "info";

export interface ReleaseFlag {
  id: string;
  type: FlagType;
  title: string;
  detail: string;
}

export interface FlagDetectionContext {
  release: ReleaseRecord;
  inputs: ReleaseForecastInputs;
  dailyData: DailyDataPoint[];
  locked: MonitoringLockedForecast;
  monitoring: MonitoringSummary;
  tier: ArtistTier;
}

/** Fractional drop in save rate (last 2 vs prior 2 days) that triggers a warning. */
// Threshold should be calibrated against observed campaigns and may need adjustment.
const SAVE_VELOCITY_DROP_THRESHOLD = 0.25;

const FLAG_SORT_ORDER: Record<FlagType, number> = {
  warning: 0,
  info: 1,
  positive: 2,
};

function isValidStreamDay(value: number | null | undefined): value is number {
  return value != null && value > 0;
}

function daysWithStreamAndSave(
  streamsByDay: Partial<Record<ForecastDay, number>>,
  savesByDay: Partial<Record<ForecastDay, number>>,
): ForecastDay[] {
  const days: ForecastDay[] = [];
  for (let day = 1 as ForecastDay; day <= 7; day++) {
    if (isValidStreamDay(streamsByDay[day]) && savesByDay[day] != null) {
      days.push(day);
    }
  }
  return days;
}

function saveRateForDays(
  days: ForecastDay[],
  streamsByDay: Partial<Record<ForecastDay, number>>,
  savesByDay: Partial<Record<ForecastDay, number>>,
): number | null {
  let streams = 0;
  let saves = 0;
  for (const day of days) {
    streams += streamsByDay[day] ?? 0;
    saves += savesByDay[day] ?? 0;
  }
  if (streams <= 0) {
    return null;
  }
  return (saves / streams) * 100;
}

function otherPctSeries(
  otherPctByDay: Partial<Record<number, number | null>>,
): { day: number; value: number }[] {
  const series: { day: number; value: number }[] = [];
  for (let day = 1; day <= 28; day++) {
    const value = otherPctByDay[day];
    if (value != null) {
      series.push({ day, value });
    }
  }
  return series;
}

/** Pure deviation detection from daily actuals vs forecast benchmarks. */
export function computeFlags(ctx: FlagDetectionContext): ReleaseFlag[] {
  if (ctx.monitoring.health.streamDaysEntered === 0) {
    return [];
  }

  const flags: ReleaseFlag[] = [];
  const actuals = dailyDataToActuals(ctx.dailyData);
  const { health, saveVelocity } = ctx.monitoring;
  const { streamsByDay, savesByDay, otherPctByDay } = actuals;
  const tierBands = SAVE_COUNT_BANDS[ctx.tier];
  const genreBand = SAVE_RATE_BANDS[ctx.release.genre];

  if (health.streamDaysEntered === 1 && isValidStreamDay(streamsByDay[1])) {
    flags.push({
      id: "d1-only",
      type: "info",
      title: "Day 1 only entered",
      detail:
        "D2 is critical for refining the week-1 projection. Enter D2 streams as soon as they are available.",
    });
  }

  const d1Streams = streamsByDay[1];
  if (isValidStreamDay(d1Streams)) {
    const expectedD1 = expectedStreamsOnDay(ctx.locked.streams, 1);
    if (d1Streams > expectedD1 * 5) {
      const multiplier = (d1Streams / expectedD1).toFixed(1);
      if (ctx.release.editorial_tier >= 2) {
        flags.push({
          id: "d1-editorial-spike",
          type: "positive",
          title: "Strong D1 with editorial support",
          detail: `D1 streams (${formatCompactNumber(d1Streams)}) are ${multiplier}× the locked-curve expectation (${formatCompactNumber(expectedD1)}). Tier ${ctx.release.editorial_tier} editorial coverage likely contributed.`,
        });
      } else {
        flags.push({
          id: "d1-spike",
          type: "positive",
          title: "Strong D1 stream spike",
          detail: `D1 streams (${formatCompactNumber(d1Streams)}) are ${multiplier}× the locked-curve expectation (${formatCompactNumber(expectedD1)}).`,
        });
      }
    }
  }

  const projectedSaves = saveVelocity.projectedWeek1Saves;
  if (projectedSaves != null) {
    const velocityFloor = tierBands.p25 * 0.8;
    if (projectedSaves < velocityFloor) {
      flags.push({
        id: "save-velocity-low",
        type: "warning",
        title: "Save velocity below typical floor",
        detail: `Projected wk1 saves (${formatCompactNumber(projectedSaves)}) are below 80% of the ${ctx.tier} tier p25 floor (${formatCompactNumber(Math.round(velocityFloor))}).`,
      });
    }

    if (projectedSaves > tierBands.p90) {
      flags.push({
        id: "save-velocity-high",
        type: "positive",
        title: "Save velocity above p90",
        detail: `Projected wk1 saves (${formatCompactNumber(projectedSaves)}) exceed the ${ctx.tier} tier p90 benchmark (${formatCompactNumber(tierBands.p90)}).`,
      });
    }
  }

  const paceDays = daysWithStreamAndSave(streamsByDay, savesByDay);
  if (paceDays.length >= 4) {
    const recentDays = paceDays.slice(-2);
    const priorDays = paceDays.slice(-4, -2);
    const recentRate = saveRateForDays(recentDays, streamsByDay, savesByDay);
    const priorRate = saveRateForDays(priorDays, streamsByDay, savesByDay);

    if (
      recentRate != null &&
      priorRate != null &&
      priorRate > 0 &&
      (priorRate - recentRate) / priorRate >= SAVE_VELOCITY_DROP_THRESHOLD
    ) {
      flags.push({
        id: "save-velocity-drop",
        type: "warning",
        title: "Save velocity dropping",
        detail: `Save rate fell from ${formatPercent(priorRate, 1)} (D${priorDays.join("–D")}) to ${formatPercent(recentRate, 1)} (D${recentDays.join("–D")}), a ${Math.round(((priorRate - recentRate) / priorRate) * 100)}% decline.`,
      });
    }
  }

  const actualSaveRate = saveVelocity.actualSaveRate;
  if (actualSaveRate != null) {
    if (actualSaveRate < genreBand.lo) {
      flags.push({
        id: "save-rate-low",
        type: "warning",
        title: "Save rate below genre band",
        detail: `Actual save rate (${formatPercent(actualSaveRate, 1)}) is below the ${ctx.release.genre} floor (${genreBand.lo}–${genreBand.hi}%).`,
      });
    } else if (actualSaveRate > genreBand.hi) {
      flags.push({
        id: "save-rate-high",
        type: "info",
        title: "Save rate above genre band",
        detail: `Actual save rate (${formatPercent(actualSaveRate, 1)}) exceeds the ${ctx.release.genre} ceiling (${genreBand.lo}–${genreBand.hi}%). Strong engagement signal.`,
      });
    }
  }

  const otherSeries = otherPctSeries(otherPctByDay);
  if (otherSeries.length >= 2) {
    const window = otherSeries.slice(-3);
    const delta = window[window.length - 1]!.value - window[0]!.value;
    const maxInWindow = Math.max(...window.map((point) => point.value));

    if (delta > 10) {
      flags.push({
        id: "other-rising",
        type: "info",
        title: '"Other" share trending up',
        detail: `"Other" source-of-streams share rose ${delta.toFixed(1)} pts over the last ${window.length} entered days. Paid or algorithmic conversion may be kicking in.`,
      });
    }

    if (maxInWindow > 10 && delta < -3) {
      flags.push({
        id: "other-falling",
        type: "warning",
        title: '"Other" share trending down',
        detail: `"Other" source-of-streams share fell ${Math.abs(delta).toFixed(1)} pts over the last ${window.length} entered days after starting above 10%. Paid traffic may be stalling.`,
      });
    }
  }

  return flags.sort(
    (a, b) =>
      FLAG_SORT_ORDER[a.type] - FLAG_SORT_ORDER[b.type] ||
      a.id.localeCompare(b.id),
  );
}

/** Convenience wrapper when tier has not been computed yet. */
export function computeFlagsForRelease(
  release: ReleaseRecord,
  inputs: ReleaseForecastInputs,
  dailyData: DailyDataPoint[],
  locked: MonitoringLockedForecast,
  monitoring: MonitoringSummary,
): ReleaseFlag[] {
  return computeFlags({
    release,
    inputs,
    dailyData,
    locked,
    monitoring,
    tier: artistTierFromMonthlyListeners(release.monthly_listeners),
  });
}
