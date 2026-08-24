"use client";

import { useLayoutEffect, useRef, useState } from "react";
import {
  formatCompactNumber,
  formatCompactRailLabels,
  formatPercent,
  formatPercentRailLabels,
} from "@/lib/format";
import {
  estimateRailLabelWidth,
  markerCentersTooClose,
  planVarianceRailLabels,
  type VarianceRailLabelPlan,
} from "@/lib/rail-label-layout";

export interface VarianceRailProps {
  label: string;
  forecast: number;
  lo: number;
  hi: number;
  actual: number | null;
  /** Percent metrics (save rate) use % formatting and a secondary delta. */
  isRate?: boolean;
  derived?: boolean;
}

const BAND_FILL =
  "color-mix(in srgb, var(--color-projected) 34%, transparent)";
export const FORECAST_DOT_PX = 9;
export const ACTUAL_DOT_PX = 11;
const DOT_RING = "0 0 0 2.5px var(--color-surface)";
const METRIC_LABEL_CLASS =
  "text-[10.5px] font-medium uppercase tracking-[0.1em] text-foreground";
const METRIC_LABEL_STYLE = { color: "var(--color-foreground)" } as const;
const LABEL_TEXT_CLASS =
  "absolute whitespace-nowrap text-[11.5px] leading-none tabular-nums";

function hasValue(n: number | null | undefined): n is number {
  return n != null && Number.isFinite(n);
}

function domainMax(hi: number, actual: number | null): number {
  const peak = hasValue(actual) ? Math.max(hi, actual) : hi;
  return peak > 0 && Number.isFinite(peak) ? peak * 1.1 : 0;
}

function toPct(value: number, max: number): number {
  if (!(max > 0) || !Number.isFinite(value)) {
    return 0;
  }
  return Math.min(100, Math.max(0, (value / max) * 100));
}

function formatDelta(forecast: number, actual: number): string | null {
  if (!(forecast > 0) || !Number.isFinite(actual)) {
    return null;
  }
  const pct = ((actual - forecast) / forecast) * 100;
  if (!Number.isFinite(pct)) {
    return null;
  }
  const rounded = Number(pct.toFixed(0));
  if (rounded === 0) {
    return formatPercent(0, 0);
  }
  if (rounded > 0) {
    return `+${formatPercent(rounded, 0)}`;
  }
  return `−${formatPercent(Math.abs(rounded), 0)}`;
}

function deltaClass(
  forecast: number,
  actual: number,
  isRate: boolean,
): string {
  if (isRate) {
    return "text-secondary";
  }
  if (actual > forecast) {
    return "text-semantic-positive";
  }
  if (actual < forecast) {
    return "text-semantic-negative";
  }
  return "text-secondary";
}

function Stem({
  pct,
  placement,
  tone,
}: {
  pct: number;
  placement: "above" | "below";
  tone: "projected" | "foreground";
}) {
  return (
    <span
      className={
        "absolute w-px " +
        (tone === "foreground" ? "bg-foreground" : "bg-projected")
      }
      style={{
        left: `${pct}%`,
        height: 3,
        top: placement === "above" ? undefined : 0,
        bottom: placement === "above" ? 0 : undefined,
        transform: "translateX(-50%)",
      }}
      aria-hidden="true"
    />
  );
}

export function MarkLabel({
  pct,
  text,
  placement,
  containerWidth,
  tone = "projected",
  left: leftProp,
}: {
  pct: number;
  text: string;
  placement: "above" | "below";
  containerWidth: number;
  tone?: "projected" | "foreground";
  left?: number;
}) {
  const labelRef = useRef<HTMLSpanElement>(null);
  const [measuredLeft, setMeasuredLeft] = useState<number | null>(null);
  const isForeground = tone === "foreground";
  const left = leftProp ?? measuredLeft;

  useLayoutEffect(() => {
    if (leftProp != null) {
      return;
    }
    const el = labelRef.current;
    if (!el || !(containerWidth > 0)) {
      return;
    }
    const width = el.offsetWidth;
    const center = (pct / 100) * containerWidth;
    const unclamped = center - width / 2;
    const maxLeft = Math.max(0, containerWidth - width);
    setMeasuredLeft(Math.min(Math.max(0, unclamped), maxLeft));
  }, [pct, text, containerWidth, leftProp]);

  return (
    <>
      <Stem pct={pct} placement={placement} tone={tone} />
      <span
        ref={labelRef}
        className={
          LABEL_TEXT_CLASS +
          " " +
          (isForeground ? "text-foreground" : "text-projected") +
          " " +
          (placement === "above" ? "top-0" : "bottom-0")
        }
        style={
          left == null
            ? { left: `${pct}%`, transform: "translateX(-50%)" }
            : { left }
        }
      >
        {text}
      </span>
    </>
  );
}

function CombinedAboveLabel({
  item,
}: {
  item: VarianceRailLabelPlan["above"][number];
}) {
  const middot = " · ";
  const split = item.text.split(middot);
  const forecastPart = split[0] ?? item.text;
  const actualPart = split.slice(1).join(middot);

  return (
    <>
      {item.stems.map((stem) => (
        <Stem
          key={`${stem.tone}-${stem.pct}`}
          pct={stem.pct}
          placement="above"
          tone={stem.tone}
        />
      ))}
      <span
        className={LABEL_TEXT_CLASS + " top-0"}
        style={{ left: item.left }}
      >
        <span className="text-projected">{forecastPart}</span>
        {actualPart ? (
          <>
            <span className="text-secondary">{middot}</span>
            <span className="text-foreground">{actualPart}</span>
          </>
        ) : null}
      </span>
    </>
  );
}

export function RailDot({
  pct,
  size,
  fill,
  className = "",
}: {
  pct: number;
  size: number;
  fill: string;
  className?: string;
}) {
  return (
    <div
      className={`absolute top-1/2 rounded-full ${className}`}
      style={{
        width: size,
        height: size,
        left: `${pct}%`,
        transform: "translate(-50%, -50%)",
        boxShadow: DOT_RING,
        backgroundColor: fill,
      }}
      aria-hidden="true"
    />
  );
}

export function VarianceRail({
  label,
  forecast,
  lo,
  hi,
  actual,
  isRate = false,
  derived = false,
}: VarianceRailProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const [trackWidth, setTrackWidth] = useState(0);
  const [measured, setMeasured] = useState<Record<string, number>>({});
  const max = domainMax(hi, actual);
  const showActual = hasValue(actual);
  const delta =
    showActual && hasValue(forecast) ? formatDelta(forecast, actual) : null;
  const railLabels = isRate
    ? formatPercentRailLabels(forecast, lo, hi)
    : formatCompactRailLabels(forecast, lo, hi);
  const actualValueLabel = showActual
    ? isRate
      ? formatPercent(actual)
      : formatCompactNumber(actual)
    : null;
  const forecastText = `Forecast ${railLabels.forecast}`;
  const combinedText =
    actualValueLabel != null
      ? `${forecastText} · Actual ${actualValueLabel}`
      : forecastText;

  useLayoutEffect(() => {
    const el = trackRef.current;
    if (!el) {
      return;
    }
    const measure = () => setTrackWidth(el.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    const el = measureRef.current;
    if (!el) {
      return;
    }
    const texts: Record<string, string> = {
      forecast: forecastText,
      lo: railLabels.lo,
      hi: railLabels.hi,
      actual: "Actual",
      combined: combinedText,
    };
    const next: Record<string, number> = {};
    for (const [key, text] of Object.entries(texts)) {
      el.textContent = text;
      next[key] = el.offsetWidth || estimateRailLabelWidth(text);
    }
    setMeasured(next);
  }, [forecastText, railLabels.lo, railLabels.hi, combinedText]);

  if (!(max > 0) || !hasValue(forecast) || !hasValue(lo) || !hasValue(hi)) {
    return null;
  }

  const loPct = toPct(lo, max);
  const hiPct = toPct(hi, max);
  const forecastPct = toPct(forecast, max);
  const actualPct = showActual ? toPct(actual, max) : null;
  const bandLeft = Math.min(loPct, hiPct);
  const bandWidth = Math.abs(hiPct - loPct);
  const widthReady = trackWidth > 0 && measured.forecast != null;
  const plan = widthReady
    ? planVarianceRailLabels({
        containerWidth: trackWidth,
        forecast: {
          pct: forecastPct,
          text: forecastText,
          width: measured.forecast,
        },
        lo: {
          pct: loPct,
          text: railLabels.lo,
          width: measured.lo ?? estimateRailLabelWidth(railLabels.lo),
        },
        hi: {
          pct: hiPct,
          text: railLabels.hi,
          width: measured.hi ?? estimateRailLabelWidth(railLabels.hi),
        },
        actual:
          actualPct != null && actualValueLabel != null
            ? {
                pct: actualPct,
                text: "Actual",
                width: measured.actual ?? estimateRailLabelWidth("Actual"),
                combinedText,
                combinedWidth:
                  measured.combined ?? estimateRailLabelWidth(combinedText),
              }
            : null,
      })
    : null;
  const markersClose =
    actualPct != null &&
    markerCentersTooClose(forecastPct, actualPct, trackWidth);

  const summary = showActual
    ? `${label}. Actual ${actualValueLabel}${
        delta ? `, ${delta} versus forecast` : ""
      } ${railLabels.forecast}. Expected ${railLabels.lo} to ${railLabels.hi}.`
    : `${label}. Forecast ${railLabels.forecast}. Expected ${railLabels.lo} to ${railLabels.hi}.`;

  return (
    <div className="relative min-w-0" role="group" aria-label={summary}>
      <span
        ref={measureRef}
        className={
          LABEL_TEXT_CLASS +
          " pointer-events-none invisible absolute left-0 top-0"
        }
        aria-hidden="true"
      />

      <div className="flex items-baseline gap-2">
        <p className={METRIC_LABEL_CLASS} style={METRIC_LABEL_STYLE}>
          {label}
        </p>
        {derived ? (
          <p className="text-[10.5px] font-medium uppercase tracking-[0.1em] text-secondary">
            Derived
          </p>
        ) : null}
      </div>

      <div className="mt-1 flex items-baseline gap-2">
        <p className="text-[22px] font-semibold tabular-nums leading-none tracking-[-0.02em] text-foreground">
          {showActual ? actualValueLabel : railLabels.forecast}
        </p>
        {showActual && delta ? (
          <p
            className={
              "text-body-sm tabular-nums " +
              deltaClass(forecast, actual, isRate)
            }
          >
            {delta}
          </p>
        ) : null}
        {!showActual ? (
          <p className="text-[10.5px] font-medium uppercase tracking-[0.1em] text-secondary">
            Forecast
          </p>
        ) : null}
      </div>

      <div className="mt-2">
        <div className="relative h-[15px]">
          {plan
            ? plan.above.map((item) =>
                item.combined ? (
                  <CombinedAboveLabel key={item.id} item={item} />
                ) : (
                  <MarkLabel
                    key={item.id}
                    pct={item.stems[0]?.pct ?? forecastPct}
                    text={item.text}
                    placement="above"
                    containerWidth={trackWidth}
                    left={item.left}
                  />
                ),
              )
            : null}
        </div>

        <div
          ref={trackRef}
          className="relative h-2 w-full min-w-0 overflow-visible bg-canvas-subtle"
        >
          <div
            className="absolute inset-y-0"
            style={{
              left: `${bandLeft}%`,
              width: `${bandWidth}%`,
              backgroundColor: BAND_FILL,
            }}
            aria-hidden="true"
          />
          <RailDot
            pct={forecastPct}
            size={FORECAST_DOT_PX}
            fill="var(--color-chart-projected)"
          />
          {actualPct != null ? (
            <RailDot
              pct={actualPct}
              size={ACTUAL_DOT_PX}
              fill="var(--color-foreground)"
              className={markersClose ? "z-[2]" : "z-[1]"}
            />
          ) : null}
        </div>

        <div className="relative h-[15px]">
          {plan
            ? plan.below.map((item) => (
                <MarkLabel
                  key={item.id}
                  pct={item.pct}
                  text={item.text}
                  placement="below"
                  containerWidth={trackWidth}
                  tone={item.tone}
                  left={item.left}
                />
              ))
            : null}
        </div>
      </div>
    </div>
  );
}
