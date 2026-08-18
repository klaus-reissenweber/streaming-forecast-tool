import { formatCompactNumber } from "@/lib/format";
import type { AlgoBand, AlgoPositioningResult } from "@/lib/forecast";

/** UI labels and copy for algo positioning bands (prototype v3.2). */
export const ALGO_BAND_DISPLAY: Record<
  AlgoBand,
  { label: string; description: string }
> = {
  weak: {
    label: "Quiet",
    description:
      "Save count is below typical for this artist size. Algorithm unlikely to expand much beyond existing fans.",
  },
  typical: {
    label: "Normal",
    description:
      "Within the typical range for this artist size. On pace for usual algorithmic treatment.",
  },
  strong: {
    label: "Hot",
    description:
      "Above typical. Strong save signal; expect expanded algorithmic reach if streams follow.",
  },
  elite: {
    label: "Breakout",
    description:
      "Top 10% of releases this size. Breakout potential if stream velocity confirms.",
  },
};

export const ALGO_BAND_ORDER: AlgoBand[] = [
  "weak",
  "typical",
  "strong",
  "elite",
];

/** Plain threshold copy: what the number means, not how it was computed. */
export function algoBandThresholdPlain(
  positioning: Pick<AlgoPositioningResult, "band" | "thresholds">,
): string {
  const { band, thresholds } = positioning;
  if (band === "weak") {
    return `Below ${formatCompactNumber(thresholds.p25)} saves`;
  }
  if (band === "typical") {
    return `${formatCompactNumber(thresholds.p25)}–${formatCompactNumber(thresholds.p75)} saves, typical for this artist size`;
  }
  if (band === "strong") {
    return `Above ${formatCompactNumber(thresholds.p75)} saves`;
  }
  return `Above ${formatCompactNumber(thresholds.p90)} saves`;
}

export function algoBandCutoffCaption(
  positioning: Pick<AlgoPositioningResult, "band" | "tier" | "thresholds">,
): string {
  return algoBandThresholdPlain(positioning);
}
