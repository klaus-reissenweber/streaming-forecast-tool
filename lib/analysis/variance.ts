import type { MetricOutcome, Verdict } from "./types";

export const verdictFor = (m: MetricOutcome): Verdict =>
  m.actual > m.hi ? "above" : m.actual < m.lo ? "below" : "inside";

/** Signed proportion by which actual missed the forecast. */
export const relativeError = (m: MetricOutcome): number =>
  (m.actual - m.forecast) / m.forecast;

/** How far outside the interval, as a proportion of the bound it cleared.
 *  Zero when the actual landed inside. */
export function marginOutside(m: MetricOutcome): number {
  const v = verdictFor(m);
  if (v === "above") return (m.actual - m.hi) / m.hi;
  if (v === "below") return (m.lo - m.actual) / m.lo;
  return 0;
}

/** A metric computed from others carries no information of its own.
 *  Save rate is saves ÷ streams: two independent checks, not three. */
export const independentChecks = (ms: MetricOutcome[]): number =>
  ms.filter((m) => !m.derived).length;

/** Chance a well-behaved release trips at least one interval, given k
 *  independent checks at the stated coverage. Drives the false-flag warning. */
export const falseFlagRate = (k: number, coverage = 0.8): number =>
  1 - coverage ** k;
