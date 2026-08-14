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
      "Save count below p25 for your tier. Algorithm unlikely to expand much beyond existing fans.",
  },
  typical: {
    label: "Normal",
    description:
      "Within the expected band for your tier. On pace for typical algorithmic treatment.",
  },
  strong: {
    label: "Hot",
    description:
      "Above p75. Strong save signal; expect expanded algorithmic reach if streams follow.",
  },
  elite: {
    label: "Breakout",
    description:
      "Top-decile saves for your tier. Breakout potential if stream velocity confirms.",
  },
};

export const ALGO_BAND_ORDER: AlgoBand[] = [
  "weak",
  "typical",
  "strong",
  "elite",
];

/** Percentile cutoff from the tier band that produced this classification. */
export function algoBandCutoffCaption(
  positioning: Pick<AlgoPositioningResult, "band" | "tier" | "thresholds">,
): string {
  const { band, tier, thresholds } = positioning;
  if (band === "weak") {
    return `< ${formatCompactNumber(thresholds.p25)} saves (p25, ${tier})`;
  }
  if (band === "typical") {
    return `${formatCompactNumber(thresholds.p25)}–${formatCompactNumber(thresholds.p75)} saves (p25–p75, ${tier})`;
  }
  if (band === "strong") {
    return `${formatCompactNumber(thresholds.p75)}–${formatCompactNumber(thresholds.p90)} saves (p75–p90, ${tier})`;
  }
  return `≥ ${formatCompactNumber(thresholds.p90)} saves (p90, ${tier})`;
}
