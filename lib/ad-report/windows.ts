import type { AdReportDailyPoint } from "@/lib/ad-report/types";

/** (actual − predicted) / predicted × 100. */
export function variancePct(
  predicted: number,
  actual: number | null,
): number | null {
  if (actual == null || !(predicted > 0) || !Number.isFinite(actual)) {
    return null;
  }
  return ((actual - predicted) / predicted) * 100;
}

export function week1FromDaily(points: AdReportDailyPoint[]): {
  forecastStreams: number;
  actualStreams: number | null;
  actualDaysEntered: number;
} {
  let forecast = 0;
  let actual = 0;
  let days = 0;
  for (const point of points) {
    if (point.day < 1 || point.day > 7) {
      continue;
    }
    forecast += point.forecastStreams;
    if (point.actualStreams != null && Number.isFinite(point.actualStreams)) {
      actual += point.actualStreams;
      days += 1;
    }
  }
  return {
    forecastStreams: forecast,
    actualStreams: days > 0 ? actual : null,
    actualDaysEntered: days,
  };
}

export function d28ActualFromDaily(points: AdReportDailyPoint[]): {
  actualStreams: number | null;
  daysEntered: number;
} {
  let actual = 0;
  let days = 0;
  for (const point of points) {
    if (point.day < 1 || point.day > 28) {
      continue;
    }
    if (point.actualStreams != null && Number.isFinite(point.actualStreams)) {
      actual += point.actualStreams;
      days += 1;
    }
  }
  return {
    actualStreams: days > 0 ? actual : null,
    daysEntered: days,
  };
}
