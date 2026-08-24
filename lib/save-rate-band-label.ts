import { formatCompactNumber } from "@/lib/format";

export type SaveRateVsBand = "below" | "within" | "above";

export const SAVE_RATE_BAND_LABEL: Record<SaveRateVsBand, string> = {
  within: "As expected",
  above: "Above expected",
  below: "Below expected",
};

export function classifySaveRateVsBand(
  rate: number,
  band: { lo: number; hi: number },
): SaveRateVsBand {
  if (rate < band.lo) {
    return "below";
  }
  if (rate > band.hi) {
    return "above";
  }
  return "within";
}

export function expectedStreamRange(
  forecast: number,
  band: { lo: number; hi: number },
): { lo: number; hi: number } {
  return { lo: forecast * band.lo, hi: forecast * band.hi };
}

export function classifyStreamsVsBand(
  actual: number,
  forecast: number,
  band: { lo: number; hi: number },
): SaveRateVsBand | null {
  if (!(forecast > 0)) {
    return null;
  }
  return classifySaveRateVsBand(actual / forecast, band);
}

export function saveRateBandCaption(
  vsBand: SaveRateVsBand,
  band: { lo: number; hi: number },
): string {
  return `Expected ${band.lo}–${band.hi}% · ${SAVE_RATE_BAND_LABEL[vsBand]}`;
}

export function streamBandCaption(
  vsBand: SaveRateVsBand,
  expected: { lo: number; hi: number },
): string {
  return (
    `Expected ${formatCompactNumber(expected.lo)}–${formatCompactNumber(expected.hi)} · ${SAVE_RATE_BAND_LABEL[vsBand]}`
  );
}

export function saveRateToneClass(vsBand: SaveRateVsBand | null): string {
  switch (vsBand) {
    case "above":
      return "text-semantic-positive";
    case "below":
      return "text-semantic-warning";
    case "within":
      return "text-secondary";
    default:
      return "text-secondary";
  }
}
