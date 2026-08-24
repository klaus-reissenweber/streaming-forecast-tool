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
  "text-[2.5rem] font-semibold tabular-nums leading-none tracking-[-0.02em]";
const COL_HEADER_CLASS = "pb-2 text-center text-label uppercase text-foreground";
const ROW_LABEL_CLASS =
  "whitespace-nowrap pr-3 pt-2 text-left text-caption text-foreground";
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
          <p className="text-[0.95rem] font-medium leading-none tracking-normal text-secondary">
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
            : "text-secondary")
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
            <span className="block text-secondary">{expected}</span>
          </>
        ) : null}
      </div>
    </div>
  );
}

const COMPACT_FIGURE_CLASS =
  "text-xl font-semibold tabular-nums leading-none tracking-[-0.02em]";

function MobileMetricBlock({
  header,
  forecast,
  forecastNote,
  actual,
  variance,
  vsBand,
  expected,
  showActuals,
}: {
  header: string;
  forecast: ReactNode;
  forecastNote?: string | null;
  actual: ReactNode;
  variance: number | null;
  vsBand?: SaveRateVsBand | null;
  expected?: string | null;
  showActuals: boolean;
}) {
  const hasBand = vsBand != null && expected != null;

  if (!showActuals) {
    return (
      <div className="border-t border-border/40 py-3 first:border-t-0 first:pt-0">
        <p className="text-center text-label uppercase text-foreground">{header}</p>
        <div className={`${FIGURE_CLASS} mt-2 text-center text-foreground`}>
          {forecast}
        </div>
        {forecastNote ? (
          <p className="mt-1 text-center text-[0.95rem] font-medium leading-none tracking-normal text-secondary">
            {forecastNote}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="border-t border-border/40 py-3 first:border-t-0 first:pt-0">
      <p className="text-center text-label uppercase text-foreground">{header}</p>
      <div className="mt-2 grid grid-cols-3 text-center">
        <div className="min-w-0 px-1">
          <p className="text-caption text-foreground">Forecast</p>
          <div className={`${COMPACT_FIGURE_CLASS} mt-1 text-foreground`}>
            {forecast}
          </div>
          {forecastNote ? (
            <p className="mt-1 text-caption font-medium text-secondary">
              {forecastNote}
            </p>
          ) : null}
        </div>
        <div className={`min-w-0 px-1 ${ACTUAL_ROW_TONE}`}>
          <p className="text-caption text-foreground">Actual</p>
          <div className={`${COMPACT_FIGURE_CLASS} mt-1 text-foreground`}>
            {actual}
          </div>
        </div>
        <div className="min-w-0 px-1">
          <p className="text-caption text-foreground">Difference</p>
          <div
            className={
              `${COMPACT_FIGURE_CLASS} mt-1 ` +
              (variance != null
                ? varianceToneClass(variance, vsBand)
                : "text-secondary")
            }
          >
            {variance != null ? formatSignedPct(variance) : null}
          </div>
          {hasBand ? (
            <p className="mt-1 text-caption leading-snug">
              <span className={`block ${saveRateToneClass(vsBand)}`}>
                {SAVE_RATE_BAND_LABEL[vsBand]}
              </span>
              <span className="block text-secondary">{expected}</span>
            </p>
          ) : null}
        </div>
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

  const streamsExpected = streamActual
    ? `${formatCompactNumber(expectedStreamRange.lo)}–${formatCompactNumber(expectedStreamRange.hi)}`
    : null;
  const saveRateExpected = saveRateActual
    ? `${saveRateBand.lo}–${saveRateBand.hi}%`
    : null;

  return (
    <section
      className="motion-fade-up relative min-w-0 overflow-hidden rounded-instrument border border-border bg-accent-tint px-4 py-3.5 md:px-5"
      aria-label="Week-1 forecast"
    >
      <span
        className="pointer-events-none absolute inset-y-0 left-0 w-1 origin-top bg-accent animate-instrument-rule-grow"
        aria-hidden="true"
      />

      <SectionHeader description={lockedAtDisplay}>
        Week-1 forecast
      </SectionHeader>

      <div className="mt-3 md:hidden">
        <MobileMetricBlock
          header="Streams"
          forecast={<AnimatedCompactMetric value={streams} delay={0} />}
          forecastNote={adsLiftLabel}
          actual={
            streamActual ? (
              <AnimatedCompactMetric
                value={streamActual.value}
                delay={COUNT_UP_STAGGER_MS}
              />
            ) : null
          }
          variance={streamsVariance}
          vsBand={streamActual?.vsBand}
          expected={streamsExpected}
          showActuals={showActuals}
        />
        <MobileMetricBlock
          header="Saves"
          forecast={
            <AnimatedCompactMetric value={saves} delay={COUNT_UP_STAGGER_MS} />
          }
          actual={
            saveActual ? (
              <AnimatedCompactMetric
                value={saveActual.value}
                delay={COUNT_UP_STAGGER_MS * 2}
              />
            ) : null
          }
          variance={savesVariance}
          showActuals={showActuals}
        />
        <MobileMetricBlock
          header="Save rate"
          forecast={
            <AnimatedPercentMetric
              value={forecastSaveRate}
              delay={COUNT_UP_STAGGER_MS * 2}
            />
          }
          actual={
            saveRateActual ? (
              <AnimatedPercentMetric
                value={saveRateActual.value}
                delay={COUNT_UP_STAGGER_MS * 3}
              />
            ) : null
          }
          variance={saveRateVariance}
          vsBand={saveRateActual?.vsBand}
          expected={saveRateExpected}
          showActuals={showActuals}
        />
      </div>

      <div
        className={
          "mt-3 hidden w-full md:grid " +
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
          <AnimatedCompactMetric value={streams} delay={0} />
        </MetricFigure>
        <MetricFigure col={1}>
          <AnimatedCompactMetric value={saves} delay={COUNT_UP_STAGGER_MS} />
        </MetricFigure>
        <MetricFigure col={2}>
          <AnimatedPercentMetric
            value={forecastSaveRate}
            delay={COUNT_UP_STAGGER_MS * 2}
          />
        </MetricFigure>

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
              expected={streamsExpected}
            />
            <VarianceCell col={1} variance={savesVariance} />
            <VarianceCell
              col={2}
              variance={saveRateVariance}
              vsBand={saveRateActual?.vsBand}
              expected={saveRateExpected}
            />
          </>
        ) : null}
      </div>
    </section>
  );
}
