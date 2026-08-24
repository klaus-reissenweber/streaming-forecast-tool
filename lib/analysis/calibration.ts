import type { ClosedRelease } from "./types";
import { wilson, mean, sd, median, tCrit, signTestP } from "./stats";

export interface Calibration {
  /** Releases scored. Excludes those dropped for a non-positive actual. */
  n: number;
  /** Releases with actual <= 0, which have no defined log ratio. */
  excluded: number;
  /** Share landing inside the model's interval, with a Wilson interval. */
  coverage: number;
  coverageCI: [number, number];
  inside: number;
  /** Geometric mean of actual / forecast, with a t interval on the log scale. */
  ratioMean: number;
  ratioCI: [number, number];
  /** Median of actual / forecast. Robust to a single wild release. */
  ratioMedian: number;
  /** How many finished under forecast, and whether that lean is one-sided. */
  below: number;
  belowCI: [number, number];
  signP: number;
  /** Per-release log ratios, in input order minus exclusions. */
  logRatios: number[];
}

/**
 * Judges the model, not any single release.
 *
 * Percent error is bounded at -100% below and unbounded above, so its
 * arithmetic mean understates a downward bias. Everything here works on
 * log(actual / forecast), where a half and a double are the same distance
 * from zero, and reports back on the ratio scale.
 */
export function calibrate(
  releases: ClosedRelease[],
  nominalCoverage = 0.8
): Calibration & { nominalCoverage: number; intervalsMiscalibrated: boolean } {
  const usable = releases.filter((r) => r.actual > 0 && r.forecast > 0);
  const excluded = releases.length - usable.length;
  const n = usable.length;

  const logRatios = usable.map((r) => Math.log(r.actual / r.forecast));
  const m = mean(logRatios);
  const s = sd(logRatios);
  const se = n > 1 ? s / Math.sqrt(n) : NaN;
  const t = tCrit(n - 1);

  const inside = usable.filter((r) => r.actual >= r.lo && r.actual <= r.hi).length;
  const below = usable.filter((r) => r.actual < r.forecast).length;
  const coverageCI = wilson(inside, n);

  return {
    n,
    excluded,
    inside,
    coverage: n ? inside / n : NaN,
    coverageCI,
    ratioMean: Math.exp(m),
    ratioCI: Number.isFinite(se)
      ? [Math.exp(m - t * se), Math.exp(m + t * se)]
      : [NaN, NaN],
    ratioMedian: Math.exp(median(logRatios)),
    below,
    belowCI: wilson(below, n),
    signP: signTestP(below, n),
    logRatios,
    nominalCoverage,
    intervalsMiscalibrated:
      n > 0 && (nominalCoverage < coverageCI[0] || nominalCoverage > coverageCI[1]),
  };
}

/** Where a release sits among scored closes, 0 to 100. */
export function percentileAmong(releases: ClosedRelease[], ratio: number): number {
  const usable = releases.filter((r) => r.actual > 0 && r.forecast > 0);
  if (!usable.length) return NaN;
  const worse = usable.filter((r) => r.actual / r.forecast < ratio).length;
  return Math.round((worse / usable.length) * 100);
}
