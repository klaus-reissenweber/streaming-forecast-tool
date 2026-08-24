import { formatCompactNumber } from "../format";
import type { MetricOutcome, DayPoint, ClosedRelease, Finding } from "./types";
import { verdictFor, marginOutside, independentChecks, falseFlagRate } from "./variance";
import { curveStats } from "./curve";
import { calibrate, percentileAmong } from "./calibration";

/* Formatting. Every sentence is a template over computed values — no prose
   is written by hand anywhere in this module. */
/** Magnitude only. Use where the direction is already stated in words. */
const pc = (x: number) => `${Math.round(Math.abs(x) * 100)} percent`;
/** Direction preserved. Use for any change that can go either way. */
const move = (x: number) =>
  `${x >= 0 ? "rose" : "fell"} ${Math.round(Math.abs(x) * 100)} percent`;
const compact = (n: number) =>
  Math.abs(n) >= 1e6 ? `${(n / 1e6).toFixed(2)}M`
  : Math.abs(n) >= 1e4 ? `${Math.round(n / 1e3)}K`
  : Math.abs(n) >= 1e3 ? `${(n / 1e3).toFixed(1).replace(/\.0$/, "")}K`
  : `${Math.round(n)}`;
const val = (m: MetricOutcome, v: number) => (m.isRate ? `${v.toFixed(1)} percent` : compact(v));

export function week1Findings(metrics: MetricOutcome[]): Finding[] {
  const out: Finding[] = [];

  for (const m of metrics) {
    if (m.derived) continue;
    const v = verdictFor(m);
    if (v === "inside") {
      out.push({ id: m.key, text: `${m.key} landed inside the expected range.` });
    } else {
      out.push({
        id: m.key,
        text: `${m.key} closed ${pc(marginOutside(m))} ${
          v === "above" ? "above the top" : "below the bottom"
        } of the expected range.`,
      });
    }
  }

  const volume = metrics.find((m) => !m.derived && !m.isRate);
  const rate = metrics.find((m) => m.isRate);
  if (volume && rate && verdictFor(volume) === "above" && verdictFor(rate) === "inside") {
    out.push({
      id: "divergence",
      text: `${rate.key} stayed inside its band while ${volume.key.toLowerCase()} beat forecast. That points to more listeners, not worse ones.`,
    });
  }

  const k = independentChecks(metrics);
  if (k >= 2 && metrics.some((m) => m.derived)) {
    out.push({
      id: "checks",
      text: `${k} independent checks here, not ${metrics.length}. Save rate is derived, so it adds no new information.`,
    });
  }
  return out;
}

export function curveFindings(days: DayPoint[]): Finding[] {
  const s = curveStats(days);
  const out: Finding[] = [];

  if (s.daysAbove === s.n) {
    out.push({
      id: "all-above",
      text: `Actuals beat the expected range on all ${s.n} days. The forecast runs low for this release, not just at the open.`,
    });
  } else if (s.daysAbove > 0) {
    out.push({
      id: "above",
      day: s.lastAboveDay ?? undefined,
      text: `Actuals beat the expected range on ${s.daysAbove} of ${s.n} days. Day ${s.lastAboveDay} was the last one above it.`,
    });
  } else if (s.daysBelow === s.n) {
    out.push({
      id: "all-below",
      text: `Actuals fell short of the expected range on all ${s.n} days.`,
    });
  }

  out.push({
    id: "peak",
    day: s.peakDay,
    text: `Day ${s.peakDay} was the peak at ${compact(s.peakValue)}, ${pc(s.peakGap)} above the forecast for that day.`,
  });

  const a = s.tailChangeActual, f = s.tailChangeForecast;
  if (Number.isFinite(a) && Number.isFinite(f)) {
    const sameDirection = a === 0 || f === 0 ? a === f : Math.sign(a) === Math.sign(f);
    // "similar" means within a third of each other in magnitude, not merely
    // both non-zero. Two declines of 30% and 250% are not a shared shape.
    const similar =
      sameDirection &&
      Math.max(Math.abs(a), Math.abs(f)) <= 1.35 * Math.min(Math.abs(a), Math.abs(f));

    if (similar) {
      out.push({
        id: "tail-similar",
        day: s.tailStartDay,
        text: `From day ${s.tailStartDay} both curves ${a < 0 ? "fall" : "rise"} at a similar rate: ${pc(a)} for actuals against ${pc(f)} for the forecast.`,
      });
    } else if (!sameDirection) {
      out.push({
        id: "tail-diverge",
        day: s.tailStartDay,
        text: `From day ${s.tailStartDay} the shapes diverge: actuals ${move(a)} while the forecast ${move(f)}.`,
      });
    } else {
      out.push({
        id: "tail-gap",
        day: s.tailStartDay,
        text: `From day ${s.tailStartDay} actuals ${move(a)} against ${pc(f)} for the forecast. The decay shape is not the one the model assumed.`,
      });
    }
  }
  return out;
}

export function calibrationFindings(closes: ClosedRelease[]): Finding[] {
  const c = calibrate(closes);
  const out: Finding[] = [];
  if (!c.n) return [{ id: "none", text: "No closed releases have been scored yet." }];

  if (c.intervalsMiscalibrated) {
    out.push({
      id: "coverage",
      text: `Only ${c.inside} of ${c.n} releases landed inside the ${pc(c.nominalCoverage)} band. About ${Math.round(c.nominalCoverage * c.n)} should have. The intervals are too narrow.`,
    });
  }

  const direction = c.ratioMedian < 1 ? "high" : "low";
  out.push({
    id: "bias",
    text: `The typical release finishes at ${pc(c.ratioMedian)} of its forecast. The model runs ${direction}, so a level correction is due before the next retrain.`,
  });

  if (c.signP < 0.05) {
    out.push({
      id: "direction",
      text: `${c.below} of ${c.n} closes came in under forecast. The misses run one way, which is bias rather than noise.`,
    });
  } else {
    out.push({
      id: "direction-weak",
      text: `${c.below} of ${c.n} closes came in under forecast. That lean is not yet distinguishable from chance at this sample size.`,
    });
  }

  if (c.excluded > 0) {
    out.push({
      id: "excluded",
      text: `${c.excluded} release${c.excluded === 1 ? "" : "s"} had no usable actual and ${c.excluded === 1 ? "was" : "were"} left out of these figures.`,
    });
  }
  return out;
}

export interface PositioningInput {
  forecastSaves: number;
  actualSaves: number | null;
  thresholds: { p25: number; p75: number; p90: number };
}

type PositioningBand = "weak" | "typical" | "strong" | "elite";

const BAND_NAME: Record<PositioningBand, string> = {
  weak: "Quiet",
  typical: "Normal",
  strong: "Hot",
  elite: "Breakout",
};

function bandForSaves(
  saves: number,
  thresholds: PositioningInput["thresholds"],
): PositioningBand {
  if (saves < thresholds.p25) return "weak";
  if (saves < thresholds.p75) return "typical";
  if (saves < thresholds.p90) return "strong";
  return "elite";
}

function bandName(band: PositioningBand): string {
  return BAND_NAME[band];
}

function operationalMeaning(band: PositioningBand): string {
  if (band === "weak") {
    return "Quiet means the algorithm is unlikely to expand much beyond existing fans.";
  }
  if (band === "typical") {
    return "Normal means the release is on pace for usual algorithmic treatment.";
  }
  if (band === "strong") {
    return "Hot means expanded algorithmic reach is in play if streams follow.";
  }
  return "Breakout means breakout treatment is in play if stream velocity confirms.";
}

function nearestEdge(
  saves: number,
  thresholds: PositioningInput["thresholds"],
): { label: string; value: number } {
  const edges = [
    { label: "Normal", value: thresholds.p25 },
    { label: "Hot", value: thresholds.p75 },
    { label: "Breakout", value: thresholds.p90 },
  ];
  let best = edges[0];
  let bestDist = Math.abs(saves - edges[0].value);
  for (const edge of edges.slice(1)) {
    const dist = Math.abs(saves - edge.value);
    if (dist < bestDist) {
      best = edge;
      bestDist = dist;
    }
  }
  return best;
}

function boundaryFinding(saves: number, thresholds: PositioningInput["thresholds"]): Finding {
  const edge = nearestEdge(saves, thresholds);
  const delta = Math.abs(saves - edge.value);
  const cutoff = formatCompactNumber(edge.value);
  if (!(delta >= 1)) {
    return {
      id: "boundary",
      text: `It sits on the ${edge.label} boundary at ${cutoff}.`,
    };
  }
  const side = saves < edge.value ? "below" : "above";
  return {
    id: "boundary",
    text: `It sits ${compact(delta)} ${side} the ${edge.label} boundary at ${cutoff}.`,
  };
}

export function positioningFindings(input: PositioningInput): Finding[] {
  const { forecastSaves, actualSaves, thresholds } = input;
  const forecastBand = bandForSaves(forecastSaves, thresholds);
  const hasActual = actualSaves != null && Number.isFinite(actualSaves);
  const actualBand = hasActual ? bandForSaves(actualSaves, thresholds) : null;
  const out: Finding[] = [];

  if (hasActual && actualBand != null) {
    if (actualBand !== forecastBand) {
      out.push({
        id: "landing",
        text: `The release closed in ${bandName(actualBand)} at ${compact(actualSaves)} saves. The forecast placed it in ${bandName(forecastBand)} at ${compact(forecastSaves)}. The forecast and the outcome disagree.`,
      });
    } else {
      out.push({
        id: "landing",
        text: `The release closed in ${bandName(actualBand)} at ${compact(actualSaves)} saves, matching the forecast of ${compact(forecastSaves)}.`,
      });
    }
    out.push(boundaryFinding(actualSaves, thresholds));
    out.push({ id: "meaning", text: operationalMeaning(actualBand) });
  } else {
    out.push({
      id: "landing",
      text: `The forecast places this release in ${bandName(forecastBand)} at ${compact(forecastSaves)} saves.`,
    });
    out.push(boundaryFinding(forecastSaves, thresholds));
    out.push({ id: "meaning", text: operationalMeaning(forecastBand) });
  }

  return out;
}

export function rosterContext(closes: ClosedRelease[], ratio: number): Finding {
  const p = percentileAmong(closes, ratio);
  const c = calibrate(closes);
  return {
    id: "roster",
    text: `Among scored closes this sits in the top ${100 - p} percent. The typical release finishes at ${pc(c.ratioMedian)} of forecast; this one finished at ${pc(ratio)}.`,
  };
}

export { falseFlagRate };
