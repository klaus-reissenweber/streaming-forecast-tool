import type { AlgoBand } from "@/lib/forecast";

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
