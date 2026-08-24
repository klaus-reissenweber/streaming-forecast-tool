import { describe, expect, it } from "vitest";
import {
  estimateRailLabelWidth,
  layoutLabelRow,
  markerCentersTooClose,
  naturalLabelLeft,
  planVarianceRailLabels,
  RAIL_LABEL_GAP_PX,
} from "./rail-label-layout";

describe("layoutLabelRow", () => {
  it("keeps natural centers when labels do not overlap", () => {
    const { lefts, resolved } = layoutLabelRow(
      [
        { id: "lo", pct: 20, width: 30 },
        { id: "hi", pct: 80, width: 30 },
      ],
      400,
    );
    expect(resolved).toBe(true);
    expect(lefts.lo).toBeCloseTo(naturalLabelLeft(20, 30, 400));
    expect(lefts.hi).toBeCloseTo(naturalLabelLeft(80, 30, 400));
  });

  it("pushes overlapping labels apart symmetrically", () => {
    const { lefts, resolved } = layoutLabelRow(
      [
        { id: "a", pct: 50, width: 80 },
        { id: "b", pct: 52, width: 80 },
      ],
      400,
    );
    expect(resolved).toBe(true);
    const gap = lefts.b - (lefts.a + 80);
    expect(gap).toBeGreaterThanOrEqual(RAIL_LABEL_GAP_PX - 0.5);
    const aCenter = lefts.a + 40;
    const bCenter = lefts.b + 40;
    const mid = ((50 + 52) / 2 / 100) * 400;
    expect((aCenter + bCenter) / 2).toBeCloseTo(mid, 0);
  });

  it("nudges Actual off a right-edge band label on a Boogie T-like rail", () => {
    const forecast = 54_000;
    const hi = forecast * 1.05;
    const actual = 56_000;
    const max = hi * 1.1;
    const hiPct = (hi / max) * 100;
    const actualPct = (actual / max) * 100;
    const actualW = estimateRailLabelWidth("Actual");
    const hiW = estimateRailLabelWidth("56K");
    const width = 400;

    const naturalActual = naturalLabelLeft(actualPct, actualW, width);
    const naturalHi = naturalLabelLeft(hiPct, hiW, width);
    expect(naturalActual + actualW).toBeGreaterThan(naturalHi);

    const { lefts, resolved } = layoutLabelRow(
      [
        { id: "lo", pct: ((forecast * 0.45) / max) * 100, width: 30 },
        { id: "hi", pct: hiPct, width: hiW },
        { id: "actual", pct: actualPct, width: actualW },
      ],
      width,
    );

    expect(resolved).toBe(true);
    expect(lefts.actual + actualW + RAIL_LABEL_GAP_PX).toBeLessThanOrEqual(
      lefts.hi + 0.5,
    );
    expect(lefts.hi).toBeGreaterThan(lefts.actual);
  });

  it("reports unresolved when labels cannot fit the container", () => {
    const { resolved } = layoutLabelRow(
      [
        { id: "a", pct: 90, width: 80 },
        { id: "b", pct: 92, width: 80 },
      ],
      100,
    );
    expect(resolved).toBe(false);
  });
});

describe("planVarianceRailLabels", () => {
  it("promotes Actual onto the forecast line when the below row cannot clear", () => {
    const plan = planVarianceRailLabels({
      containerWidth: 100,
      forecast: { pct: 90, text: "Forecast 54K", width: 90 },
      lo: { pct: 10, text: "24K", width: 30 },
      hi: { pct: 91, text: "56K", width: 30 },
      actual: {
        pct: 90,
        text: "Actual",
        width: 50,
        combinedText: "Forecast 54K · Actual 56K",
        combinedWidth: 160,
      },
    });
    expect(plan.combined).toBe(true);
    expect(plan.above).toHaveLength(1);
    expect(plan.above[0]?.stems).toHaveLength(2);
    expect(plan.below.map((l) => l.id).sort()).toEqual(["hi", "lo"]);
  });

  it("keeps Actual below when Light Down labels sit far apart", () => {
    const forecast = 163_000;
    const lo = forecast * 0.45;
    const hi = forecast * 1.05;
    const actual = 3_415;
    const max = hi * 1.1;
    const plan = planVarianceRailLabels({
      containerWidth: 400,
      forecast: {
        pct: (forecast / max) * 100,
        text: "Forecast 163K",
        width: estimateRailLabelWidth("Forecast 163K"),
      },
      lo: {
        pct: (lo / max) * 100,
        text: "73K",
        width: estimateRailLabelWidth("73K"),
      },
      hi: {
        pct: (hi / max) * 100,
        text: "171K",
        width: estimateRailLabelWidth("171K"),
      },
      actual: {
        pct: (actual / max) * 100,
        text: "Actual",
        width: estimateRailLabelWidth("Actual"),
        combinedText: "Forecast 163K · Actual 3.4K",
        combinedWidth: estimateRailLabelWidth("Forecast 163K · Actual 3.4K"),
      },
    });
    expect(plan.combined).toBe(false);
    expect(plan.below.some((l) => l.id === "actual")).toBe(true);
    expect(plan.above[0]?.text).toContain("Forecast");
  });
});

describe("markerCentersTooClose", () => {
  it("flags centers closer than 12px", () => {
    expect(markerCentersTooClose(50, 52, 400)).toBe(true);
  });

  it("does not flag Light Down markers", () => {
    const forecast = 163_000;
    const hi = forecast * 1.05;
    const actual = 3_415;
    const max = hi * 1.1;
    expect(
      markerCentersTooClose(
        (forecast / max) * 100,
        (actual / max) * 100,
        400,
      ),
    ).toBe(false);
  });
});
