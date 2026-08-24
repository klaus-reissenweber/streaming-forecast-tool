/** Horizontal collision layout for variance-rail labels. */

export const RAIL_LABEL_GAP_PX = 6;
export const MARKER_OVERLAP_PX = 12;
const CHAR_PX = 7.5;
const ITERATIONS = 16;
const EPS = 0.5;

export type RailLabelSpec = {
  id: string;
  pct: number;
  width: number;
};

export function estimateRailLabelWidth(text: string): number {
  return Math.ceil(text.length * CHAR_PX);
}

export function naturalLabelLeft(
  pct: number,
  width: number,
  containerWidth: number,
): number {
  if (!(containerWidth > 0) || !(width > 0)) {
    return 0;
  }
  const center = (pct / 100) * containerWidth;
  const unclamped = center - width / 2;
  const maxLeft = Math.max(0, containerWidth - width);
  return Math.min(Math.max(0, unclamped), maxLeft);
}

function clampLeft(left: number, width: number, containerWidth: number): number {
  const maxLeft = Math.max(0, containerWidth - width);
  return Math.min(Math.max(0, left), maxLeft);
}

/**
 * Place labels on one horizontal line. Stems stay at `pct`; returned `left`
 * is the label box. Overlapping boxes are pushed apart symmetrically, then
 * clamped. `resolved` is false when the boxes still overlap after that.
 */
export function layoutLabelRow(
  labels: readonly RailLabelSpec[],
  containerWidth: number,
  gap: number = RAIL_LABEL_GAP_PX,
): { lefts: Record<string, number>; resolved: boolean } {
  if (!(containerWidth > 0) || labels.length === 0) {
    return { lefts: {}, resolved: true };
  }

  const items = labels.map((label) => ({
    ...label,
    left: naturalLabelLeft(label.pct, label.width, containerWidth),
  }));
  items.sort((a, b) => a.pct - b.pct || a.id.localeCompare(b.id));

  for (let iter = 0; iter < ITERATIONS; iter += 1) {
    let changed = false;
    for (let i = 0; i < items.length - 1; i += 1) {
      const a = items[i];
      const b = items[i + 1];
      const overflow = a.left + a.width + gap - b.left;
      if (overflow <= EPS) {
        continue;
      }
      const half = overflow / 2;
      const aNext = clampLeft(a.left - half, a.width, containerWidth);
      const bNext = clampLeft(b.left + half, b.width, containerWidth);
      if (aNext !== a.left || bNext !== b.left) {
        a.left = aNext;
        b.left = bNext;
        changed = true;
      }
      const still = a.left + a.width + gap - b.left;
      if (still > EPS) {
        const aRoom = a.left;
        const bRoom = Math.max(0, containerWidth - b.width) - b.left;
        if (aRoom + bRoom >= still - EPS) {
          const takeA = Math.min(aRoom, still);
          a.left -= takeA;
          b.left += still - takeA;
          changed = true;
        }
      }
    }
    if (!changed) {
      break;
    }
  }

  let resolved = true;
  for (let i = 0; i < items.length - 1; i += 1) {
    const a = items[i];
    const b = items[i + 1];
    if (a.left + a.width + gap - b.left > EPS) {
      resolved = false;
    }
  }

  const lefts: Record<string, number> = {};
  for (const item of items) {
    lefts[item.id] = item.left;
  }
  return { lefts, resolved };
}

export function markerCentersTooClose(
  forecastPct: number,
  actualPct: number,
  containerWidth: number,
  minPx: number = MARKER_OVERLAP_PX,
): boolean {
  if (!(containerWidth > 0)) {
    return false;
  }
  const dx =
    Math.abs(forecastPct - actualPct) * (containerWidth / 100);
  return dx < minPx;
}

export type VarianceRailLabelPlan = {
  above: {
    id: string;
    text: string;
    left: number;
    stems: { pct: number; tone: "projected" | "foreground" }[];
    combined: boolean;
  }[];
  below: {
    id: string;
    text: string;
    left: number;
    pct: number;
    tone: "projected" | "foreground";
  }[];
  combined: boolean;
};

export function planVarianceRailLabels(input: {
  containerWidth: number;
  forecast: { pct: number; text: string; width: number };
  lo: { pct: number; text: string; width: number };
  hi: { pct: number; text: string; width: number };
  actual: {
    pct: number;
    text: string;
    width: number;
    combinedText: string;
    combinedWidth: number;
  } | null;
}): VarianceRailLabelPlan {
  const { containerWidth, forecast, lo, hi, actual } = input;

  const belowSpecs: RailLabelSpec[] = [
    { id: "lo", pct: lo.pct, width: lo.width },
    { id: "hi", pct: hi.pct, width: hi.width },
  ];
  if (actual) {
    belowSpecs.push({
      id: "actual",
      pct: actual.pct,
      width: actual.width,
    });
  }

  const belowAttempt = layoutLabelRow(belowSpecs, containerWidth);
  const promote = Boolean(actual) && !belowAttempt.resolved;

  const belowFinal = promote
    ? layoutLabelRow(
        [
          { id: "lo", pct: lo.pct, width: lo.width },
          { id: "hi", pct: hi.pct, width: hi.width },
        ],
        containerWidth,
      )
    : belowAttempt;

  const below: VarianceRailLabelPlan["below"] = [
    {
      id: "lo",
      text: lo.text,
      left: belowFinal.lefts.lo ?? 0,
      pct: lo.pct,
      tone: "projected",
    },
    {
      id: "hi",
      text: hi.text,
      left: belowFinal.lefts.hi ?? 0,
      pct: hi.pct,
      tone: "projected",
    },
  ];
  if (actual && !promote) {
    below.push({
      id: "actual",
      text: actual.text,
      left: belowFinal.lefts.actual ?? 0,
      pct: actual.pct,
      tone: "foreground",
    });
  }

  if (promote && actual) {
    const midPct = (forecast.pct + actual.pct) / 2;
    const combinedLayout = layoutLabelRow(
      [{ id: "combined", pct: midPct, width: actual.combinedWidth }],
      containerWidth,
    );
    return {
      combined: true,
      below,
      above: [
        {
          id: "combined",
          text: actual.combinedText,
          left: combinedLayout.lefts.combined ?? 0,
          combined: true,
          stems: [
            { pct: forecast.pct, tone: "projected" },
            { pct: actual.pct, tone: "foreground" },
          ],
        },
      ],
    };
  }

  const aboveLayout = layoutLabelRow(
    [{ id: "forecast", pct: forecast.pct, width: forecast.width }],
    containerWidth,
  );
  return {
    combined: false,
    below,
    above: [
      {
        id: "forecast",
        text: forecast.text,
        left: aboveLayout.lefts.forecast ?? 0,
        combined: false,
        stems: [{ pct: forecast.pct, tone: "projected" }],
      },
    ],
  };
}
