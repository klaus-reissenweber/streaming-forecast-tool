import { describe, it, expect } from "vitest";
import { wilson, signTestP, median } from "./stats";
import { verdictFor, marginOutside, falseFlagRate, independentChecks } from "./variance";
import { curveStats } from "./curve";
import { calibrate } from "./calibration";
import { week1Findings, curveFindings, calibrationFindings } from "./findings";
import type { MetricOutcome, DayPoint, ClosedRelease } from "./types";

const streams: MetricOutcome = { key: "Streams", actual: 436000, forecast: 304000, lo: 137000, hi: 320000 };
const saves:   MetricOutcome = { key: "Saves",   actual: 51000,  forecast: 40000,  lo: 18000,  hi: 46000 };
const rate:    MetricOutcome = { key: "Save rate", actual: 11.7, forecast: 13.1, lo: 7.9, hi: 15.9, derived: true, isRate: true };

describe("stats", () => {
  it("wilson stays inside 0 and 1 at the extremes", () => {
    const [lo, hi] = wilson(0, 10);
    expect(lo).toBe(0);
    expect(hi).toBeCloseTo(0.2775, 3);
  });
  it("wilson matches a known midpoint", () => {
    const [lo] = wilson(50, 100);
    expect(lo).toBeCloseTo(0.4038, 3);
  });
  it("sign test is symmetric", () => {
    expect(signTestP(8, 10)).toBeCloseTo(signTestP(2, 10), 10);
    expect(signTestP(8, 10)).toBeCloseTo(0.1094, 4);
  });
  it("median handles even counts", () => expect(median([1, 2, 3, 4])).toBe(2.5));
});

describe("variance", () => {
  it("reads verdicts off the interval, not the point estimate", () => {
    expect(verdictFor(streams)).toBe("above");
    expect(verdictFor(rate)).toBe("inside");
  });
  it("margin is zero inside the band", () => expect(marginOutside(rate)).toBe(0));
  it("margin is measured against the bound cleared", () =>
    expect(marginOutside(streams)).toBeCloseTo((436000 - 320000) / 320000, 10));
  it("derived metrics do not count as checks", () =>
    expect(independentChecks([streams, saves, rate])).toBe(2));
  it("two checks at 80 percent trip a flag 36 percent of the time", () =>
    expect(falseFlagRate(2)).toBeCloseTo(0.36, 10));
});

const days: DayPoint[] = Array.from({ length: 28 }, (_, i) => {
  const forecast = 75000 * Math.exp(-i / 12);
  return { day: i + 1, actual: forecast * 1.6, forecast, lo: forecast * 0.45, hi: forecast * 1.05 };
});

describe("curve", () => {
  const s = curveStats(days);
  it("counts every day above the band", () => expect(s.daysAbove).toBe(28));
  it("finds the peak", () => expect(s.peakDay).toBe(1));
  it("compares change over the same window", () =>
    expect(s.tailChangeActual).toBeCloseTo(s.tailChangeForecast, 10));
  it("keeps the sign, so growth is not reported as decline", () => {
    const rising: DayPoint[] = [
      { day: 9,  actual: 300,  forecast: 1000, lo: 450, hi: 1050 },
      { day: 28, actual: 1041, forecast: 690,  lo: 310, hi: 725 },
    ];
    const r = curveStats(rising, 9);
    expect(r.tailChangeActual).toBeGreaterThan(0);
    expect(r.tailChangeForecast).toBeLessThan(0);
  });
});

describe("tail wording", () => {
  const mk = (a9: number, a28: number, f9: number, f28: number): DayPoint[] => [
    { day: 9,  actual: a9,  forecast: f9,  lo: f9 * 0.45,  hi: f9 * 1.05 },
    { day: 28, actual: a28, forecast: f28, lo: f28 * 0.45, hi: f28 * 1.05 },
  ];
  it("never claims a fall when the actuals grew", () => {
    const f = curveFindings(mk(300, 1041, 1000, 690));
    const tail = f.find((x) => x.id.startsWith("tail"))!;
    expect(tail.text).toContain("diverge");
    expect(tail.text).toContain("rose");
    expect(tail.text).not.toContain("fall");
  });
  it("only says similar when the magnitudes are close", () => {
    const f = curveFindings(mk(1000, 660, 1000, 690));
    expect(f.find((x) => x.id.startsWith("tail"))!.id).toBe("tail-similar");
  });
  it("flags a shared direction with very different magnitudes", () => {
    const f = curveFindings(mk(1000, 100, 1000, 900));
    expect(f.find((x) => x.id.startsWith("tail"))!.id).toBe("tail-gap");
  });
});

const closes: ClosedRelease[] = [
  { id: "1", name: "a", actual: 50,  forecast: 100, lo: 80,  hi: 120 },
  { id: "2", name: "b", actual: 40,  forecast: 100, lo: 80,  hi: 120 },
  { id: "3", name: "c", actual: 100, forecast: 100, lo: 80,  hi: 120 },
  { id: "4", name: "d", actual: 25,  forecast: 100, lo: 80,  hi: 120 },
  { id: "5", name: "e", actual: 0,   forecast: 100, lo: 80,  hi: 120 },
];

describe("calibration", () => {
  const c = calibrate(closes);
  it("drops releases with no usable actual rather than taking log of zero", () => {
    expect(c.excluded).toBe(1);
    expect(c.n).toBe(4);
    expect(c.logRatios.every(Number.isFinite)).toBe(true);
  });
  it("uses the geometric mean, not the mean of percent errors", () => {
    expect(c.ratioMean).toBeCloseTo(Math.exp((Math.log(0.5) + Math.log(0.4) + Math.log(1) + Math.log(0.25)) / 4), 10);
  });
  it("flags intervals whose nominal coverage sits outside the observed interval", () => {
    expect(c.coverage).toBe(0.25);
    expect(c.intervalsMiscalibrated).toBe(true);
  });
  it("counts the direction of the misses", () => expect(c.below).toBe(3));
});

describe("findings", () => {
  it("names the bound that was cleared", () => {
    const f = week1Findings([streams, saves, rate]);
    expect(f[0].text).toBe("Streams closed 36 percent above the top of the expected range.");
  });
  it("emits the divergence reading only when volume beats and rate holds", () => {
    const f = week1Findings([streams, saves, rate]);
    expect(f.some((x) => x.id === "divergence")).toBe(true);
    const inside = { ...streams, actual: 300000 };
    expect(week1Findings([inside, rate]).some((x) => x.id === "divergence")).toBe(false);
  });
  it("says all days when every day clears the band", () => {
    expect(curveFindings(days)[0].text).toContain("all 28 days");
  });
  it("attaches a day to findings that reference one", () => {
    const peak = curveFindings(days).find((f) => f.id === "peak");
    expect(peak?.day).toBe(1);
  });
  it("does not claim a one-way lean the sample cannot support", () => {
    const f = calibrationFindings(closes);
    expect(f.some((x) => x.id === "direction-weak")).toBe(true);
    expect(f.some((x) => x.id === "direction")).toBe(false);
  });
  it("reports releases it had to leave out", () => {
    expect(calibrationFindings(closes).some((x) => x.id === "excluded")).toBe(true);
  });
});
