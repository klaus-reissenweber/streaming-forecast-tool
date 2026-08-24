/** A metric with a locked forecast and, once closed, an actual. */
export interface MetricOutcome {
  key: string;
  actual: number;
  forecast: number;
  /** Lower and upper bound of the model's interval. */
  lo: number;
  hi: number;
  /** True when this metric is computed from others (e.g. save rate). */
  derived?: boolean;
  /** Formats as a percentage rather than a count. */
  isRate?: boolean;
}

export interface DayPoint {
  /** 1-based day index. */
  day: number;
  actual: number;
  forecast: number;
  lo: number;
  hi: number;
}

/** One closed release, used to judge the model rather than the release. */
export interface ClosedRelease {
  id: string;
  name: string;
  actual: number;
  forecast: number;
  lo: number;
  hi: number;
}

export type Verdict = "above" | "inside" | "below";

export interface Finding {
  id: string;
  text: string;
  /** 1-based day this finding refers to, for chart focus. */
  day?: number;
}
