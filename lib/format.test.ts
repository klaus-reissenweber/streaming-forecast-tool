import { describe, expect, it } from "vitest";
import {
  formatCompactNumber,
  formatCompactRailLabels,
  formatPercentRailLabels,
} from "./format";

describe("formatCompactRailLabels", () => {
  it("keeps default rounding when labels already differ", () => {
    expect(formatCompactRailLabels(304_000, 137_000, 320_000)).toEqual({
      forecast: "304K",
      lo: "137K",
      hi: "320K",
    });
  });

  it("raises precision when forecast and hi both round to 9K", () => {
    expect(formatCompactRailLabels(8_700, 4_000, 9_200)).toEqual({
      forecast: "8.7K",
      lo: "4K",
      hi: "9.2K",
    });
  });

  it("raises precision when forecast sits on the rounded band edge", () => {
    expect(formatCompactRailLabels(9_000, 4_000, 9_400)).toEqual({
      forecast: "9.0K",
      lo: "4K",
      hi: "9.4K",
    });
  });
});

describe("formatPercentRailLabels", () => {
  it("keeps one decimal when labels already differ", () => {
    expect(formatPercentRailLabels(13.1, 7.9, 15.9)).toEqual({
      forecast: "13.1%",
      lo: "7.9%",
      hi: "15.9%",
    });
  });
});

describe("formatCompactNumber", () => {
  it("rounds thousands to a whole K by default", () => {
    expect(formatCompactNumber(8_700)).toBe("9K");
    expect(formatCompactNumber(9_200)).toBe("9K");
  });
});
