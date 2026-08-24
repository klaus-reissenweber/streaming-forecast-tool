import type { DayPoint } from "./types";

export interface CurveStats {
  n: number;
  daysAbove: number;
  daysInside: number;
  daysBelow: number;
  /** 1-based day of the last point above the interval, or null. */
  lastAboveDay: number | null;
  /** 1-based day of the highest actual. */
  peakDay: number;
  peakValue: number;
  peakGap: number;
  /** Signed proportional change from tailStartDay to the final day.
   *  Negative is a decline, positive is growth. Do not take the absolute
   *  value of these when rendering — the direction is the finding. */
  tailStartDay: number;
  tailChangeActual: number;
  tailChangeForecast: number;
}

export function curveStats(days: DayPoint[], tailStartDay = 9): CurveStats {
  if (!days.length) throw new Error("curveStats needs at least one day");

  let daysAbove = 0, daysBelow = 0, lastAbove: number | null = null, peakIdx = 0;
  days.forEach((d, i) => {
    if (d.actual > d.hi) { daysAbove++; lastAbove = d.day; }
    else if (d.actual < d.lo) daysBelow++;
    if (d.actual > days[peakIdx].actual) peakIdx = i;
  });

  const tailIdx = Math.min(
    Math.max(0, days.findIndex((d) => d.day === tailStartDay)),
    days.length - 2
  );
  const tail = days.slice(Math.max(0, tailIdx));
  const first = tail[0], last = tail[tail.length - 1];

  const peak = days[peakIdx];
  return {
    n: days.length,
    daysAbove,
    daysBelow,
    daysInside: days.length - daysAbove - daysBelow,
    lastAboveDay: lastAbove,
    peakDay: peak.day,
    peakValue: peak.actual,
    peakGap: peak.forecast > 0 ? (peak.actual - peak.forecast) / peak.forecast : NaN,
    tailStartDay: first?.day ?? days[0].day,
    tailChangeActual: first?.actual ? last.actual / first.actual - 1 : NaN,
    tailChangeForecast: first?.forecast ? last.forecast / first.forecast - 1 : NaN,
  };
}
