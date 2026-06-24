import type { DailyDataPoint } from "@/lib/map-release-row";

export interface Week1Actuals {
  streams: number | null;
  saves: number | null;
  daysWithStreams: number;
  daysWithSaves: number;
  /** All seven days have stream data entered. */
  isComplete: boolean;
}

function sumDays(
  dailyData: DailyDataPoint[],
  field: "streams" | "saves",
): { total: number; daysEntered: number } {
  let total = 0;
  let daysEntered = 0;

  for (const row of dailyData) {
    if (row.day_number < 1 || row.day_number > 7) {
      continue;
    }
    const value = row[field];
    if (value != null && value >= 0) {
      total += value;
      daysEntered += 1;
    }
  }

  return { total, daysEntered };
}

/**
 * Sums daily_data for days 1–7 (wk1 window).
 * Matches parseRelease.ts / retrain script aggregation.
 */
export function computeWeek1Actuals(
  dailyData: DailyDataPoint[],
): Week1Actuals {
  const streams = sumDays(dailyData, "streams");
  const saves = sumDays(dailyData, "saves");

  return {
    streams: streams.daysEntered > 0 ? streams.total : null,
    saves: saves.daysEntered > 0 ? saves.total : null,
    daysWithStreams: streams.daysEntered,
    daysWithSaves: saves.daysEntered,
    isComplete: streams.daysEntered === 7,
  };
}
