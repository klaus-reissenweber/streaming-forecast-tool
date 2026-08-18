"use client";

import { SectionHeader } from "@/components/layout/SectionHeader";
import type { ReactNode } from "react";
import { formatCompactNumber, formatPercent } from "@/lib/format";
import { useCountUp } from "@/lib/hooks/use-count-up";
import {
  SAVE_RATE_BAND_LABEL,
  saveRateToneClass,
  type SaveRateVsBand,
} from "@/lib/save-rate-band-label";

export interface LockedForecastBannerProps {
  streams: number;
  saves: number;
  forecastSaveRate: number;
  actualSaveRate?: number | null;
  actualSaveRateVsBand?: SaveRateVsBand | null;
  saveRateBand: { lo: number; hi: number };
  actualStreams?: number | null;
  actualStreamsVsBand?: SaveRateVsBand | null;
  actualSaves?: number | null;
  expectedStreamRange: { lo: number; hi: number };
  lockedAtDisplay: string;
  /** Organic locked + ad attributed streams in D1–D7. */
  week1WithAds?: number;
}

const COUNT_UP_STAGGER_MS = 50;
const VARIANCE_NEUTRAL_ABS_PCT = 5;

/** Two caption lines — ads note and band copy share this reserved slot. */
const CAPTION_SLOT_CLASS = "mt-1 min-h-[2.1rem] w-full";

const FIGURE_CLASS =
  "font-mono text-[2.5rem] font-semibold tabular-nums leading-none tracking-[-0.02em]";
const COL_HEADER_CLASS = "pb-2 text-center text-label uppercase text-muted";
const ROW_LABEL_CLASS =
  "whitespace-nowrap pr-3 pt-2 text-left text-caption text-muted";
const METRIC_PAD = "px-3";
const ACTUAL_ROW_TONE = "bg-surface/50";

function metricColClass(index: 0 | 1 | 2, extra = ""): string {
  return (
    `${METRIC_PAD} text-center ` +
    (index === 0 ? "" : "border-l border-border/40 ") +
    extra
  ).trim();
}

/** (actual − forecast) / forecast × 100. Same formula as the report variance. */
function variancePct(
  forecast: number,
  actual: number | null | undefined,
): number | null {
  if (actual == null || !(forecast > 0) || !Number.isFinite(actual)) {
    return null;
  }
  return ((actual - forecast) / forecast) * 100;
}

function formatSignedPct(value: number, decimals = 0): string {
  const rounded = Number(value.toFixed(decimals));
  if (rounded === 0) {
    return formatPercent(0, decimals);
  }
  if (rounded > 0) {
    return `+${formatPercent(rounded, decimals)}`;
  }
  return `−${formatPercent(Math.abs(rounded), decimals)}`;
}

function AnimatedCompactMetric({
  value,
  delay,
}: {
  value: number;
  delay: number;
}) {
  const animated = useCountUp(value, { delay });

  return <span>{formatCompactNumber(Math.round(animated))}</span>;
}

function AnimatedPercentMetric({
  value,
  delay,
}: {
  value: number;
  delay: number;
}) {
  const animated = useCountUp(value, { delay });

  return <span>{formatPercent(animated)}</span>;
}

function varianceToneClass(
  variance: number,
  vsBand?: SaveRateVsBand | null,
): string {
  if (vsBand === "within") {
    return "text-secondary";
  }
  if (vsBand === "above") {
    return "text-semantic-positive";
  }
  if (vsBand === "below") {
    return "text-semantic-warning";
  }
  if (Math.abs(variance) <= VARIANCE_NEUTRAL_ABS_PCT) {
    return "text-secondary";
  }
  return variance > 0
    ? "text-semantic-positive"
    : "text-semantic-warning";
}

function RowLabel({
  children,
  tone,
}: {
  children: ReactNode;
  tone?: string;
}) {
  return <div className={`${ROW_LABEL_CLASS} ${tone ?? ""}`}>{children}</div>;
}

function MetricFigure({
  children,
  note,
  tone,
  col,
}: {
  children: ReactNode;
  note?: ReactNode | null;
  tone?: string;
  col: 0 | 1 | 2;
}) {
  return (
    <div className={metricColClass(col, `py-2 ${tone ?? ""}`)}>
      <div className={`${FIGURE_CLASS} text-foreground`}>{children}</div>
      <div className={CAPTION_SLOT_CLASS}>
        {note ? (
          <p className="font-mono text-[0.95rem] font-medium leading-none tracking-normal text-muted">
            {note}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function VarianceCell({
  variance,
  vsBand,
  expected,
  col,
}: {
  variance: number | null;
  vsBand?: SaveRateVsBand | null;
  expected?: string | null;
  col: 0 | 1 | 2;
}) {
  const hasBand = vsBand != null && expected != null;

  return (
    <div className={metricColClass(col, "py-2")}>
      <div
        className={
          `${FIGURE_CLASS} ` +
          (variance != null
            ? varianceToneClass(variance, vsBand)
            : "text-muted")
        }
      >
        {variance != null ? formatSignedPct(variance) : null}
      </div>
      <div className={`${CAPTION_SLOT_CLASS} text-caption leading-snug`}>
        {hasBand ? (
          <>
            <span className={`block ${saveRateToneClass(vsBand)}`}>
              {SAVE_RATE_BAND_LABEL[vsBand]}
            </span>
            <span className="block text-muted">{expected}</span>
          </>
        ) : null}
      </div>
    </div>
  );
}

export function LockedForecastBanner({
  streams,
  saves,
  forecastSaveRate,
  actualSaveRate = null,
  actualSaveRateVsBand = null,
  saveRateBand,
  actualStreams = null,
  actualStreamsVsBand = null,
  actualSaves = null,
  expectedStreamRange,
  lockedAtDisplay,
  week1WithAds,
}: LockedForecastBannerProps) {
  const adsLift =
    week1WithAds != null ? Math.round(week1WithAds - streams) : 0;
  const adsLiftLabel =
    adsLift > 0 ? `+${formatCompactNumber(adsLift)} ads` : null;

  const streamActual =
    actualStreams != null && actualStreamsVsBand != null
      ? { value: actualStreams, vsBand: actualStreamsVsBand }
      : null;
  const saveActual = actualSaves != null ? { value: actualSaves } : null;
  const saveRateActual =
    actualSaveRate != null && actualSaveRateVsBand != null
      ? { value: actualSaveRate, vsBand: actualSaveRateVsBand }
      : null;

  const streamsVariance = streamActual
    ? variancePct(streams, streamActual.value)
    : null;
  const savesVariance = saveActual
    ? variancePct(saves, saveActual.value)
    : null;
  const saveRateVariance = saveRateActual
    ? variancePct(forecastSaveRate, saveRateActual.value)
    : null;
  const showActuals =
    streamActual != null || saveActual != null || saveRateActual != null;

  const streamsForecast = (
    <AnimatedCompactMetric value={streams} delay={0} />
  );
  const savesForecast = (
    <AnimatedCompactMetric value={saves} delay={COUNT_UP_STAGGER_MS} />
  );
  const saveRateForecast = (
    <AnimatedPercentMetric
      value={forecastSaveRate}
      delay={COUNT_UP_STAGGER_MS * 2}
    />
  );

  return (
    <section
      className="motion-fade-up relative overflow-hidden rounded-instrument border border-border bg-accent-tint px-5 py-3.5"
      aria-label="Week-1 forecast"
    >
      <span
        className="pointer-events-none absolute inset-y-0 left-0 w-1 origin-top bg-accent animate-instrument-rule-grow"
        aria-hidden="true"
      />

      <SectionHeader description={lockedAtDisplay}>
        Week-1 forecast
      </SectionHeader>

      <div
        className={
          "mt-3 grid w-full " +
          (showActuals
            ? "grid-cols-[max-content_repeat(3,minmax(0,1fr))]"
            : "grid-cols-3")
        }
        role="table"
        aria-label={
          showActuals ? "Week-1 forecast vs actual" : "Week-1 forecast"
        }
      >
        {showActuals ? (
          <div role="columnheader">
            <span className="sr-only">Comparison</span>
          </div>
        ) : null}
        <div className={metricColClass(0, COL_HEADER_CLASS)} role="columnheader">
          Streams
        </div>
        <div className={metricColClass(1, COL_HEADER_CLASS)} role="columnheader">
          Saves
        </div>
        <div className={metricColClass(2, COL_HEADER_CLASS)} role="columnheader">
          Save rate
        </div>

        {showActuals ? <RowLabel>Forecast</RowLabel> : null}
        <MetricFigure col={0} note={adsLiftLabel}>
          {streamsForecast}
        </MetricFigure>
        <MetricFigure col={1}>{savesForecast}</MetricFigure>
        <MetricFigure col={2}>{saveRateForecast}</MetricFigure>

        {showActuals ? (
          <>
            <RowLabel tone={ACTUAL_ROW_TONE}>Actual</RowLabel>
            <MetricFigure col={0} tone={ACTUAL_ROW_TONE}>
              {streamActual ? (
                <AnimatedCompactMetric
                  value={streamActual.value}
                  delay={COUNT_UP_STAGGER_MS}
                />
              ) : null}
            </MetricFigure>
            <MetricFigure col={1} tone={ACTUAL_ROW_TONE}>
              {saveActual ? (
                <AnimatedCompactMetric
                  value={saveActual.value}
                  delay={COUNT_UP_STAGGER_MS * 2}
                />
              ) : null}
            </MetricFigure>
            <MetricFigure col={2} tone={ACTUAL_ROW_TONE}>
              {saveRateActual ? (
                <AnimatedPercentMetric
                  value={saveRateActual.value}
                  delay={COUNT_UP_STAGGER_MS * 3}
                />
              ) : null}
            </MetricFigure>

            <RowLabel>Difference</RowLabel>
            <VarianceCell
              col={0}
              variance={streamsVariance}
              vsBand={streamActual?.vsBand}
              expected={
                streamActual
                  ? `${formatCompactNumber(expectedStreamRange.lo)}–${formatCompactNumber(expectedStreamRange.hi)}`
                  : null
              }
            />
            <VarianceCell col={1} variance={savesVariance} />
            <VarianceCell
              col={2}
              variance={saveRateVariance}
              vsBand={saveRateActual?.vsBand}
              expected={
                saveRateActual
                  ? `${saveRateBand.lo}–${saveRateBand.hi}%`
                  : null
              }
            />
          </>
        ) : null}
      </div>
    </section>
  );
}
