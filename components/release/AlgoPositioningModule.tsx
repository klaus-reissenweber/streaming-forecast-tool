"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { AnalysisBlock } from "@/components/release/AnalysisBlock";
import { SectionHeader } from "@/components/layout/SectionHeader";
import {
  ACTUAL_DOT_PX,
  FORECAST_DOT_PX,
  MarkLabel,
  RailDot,
} from "@/components/release/VarianceRail";
import {
  ALGO_BAND_DISPLAY,
  ALGO_BAND_ORDER,
  algoBandForSaves,
} from "@/lib/algo-positioning-display";
import { positioningFindings } from "@/lib/analysis/findings";
import { formatCompactNumber } from "@/lib/format";
import type { AlgoBand, AlgoPositioningResult } from "@/lib/forecast";

export interface AlgoPositioningModuleProps {
  positioning: AlgoPositioningResult;
  actualSaves?: number | null;
}

const REACHED_FILL =
  "color-mix(in srgb, var(--color-projected) 34%, transparent)";

function hasValue(n: number | null | undefined): n is number {
  return n != null && Number.isFinite(n);
}

function domainMax(
  p90: number,
  forecast: number,
  actual: number | null,
): number {
  const peak = hasValue(actual)
    ? Math.max(p90, forecast, actual)
    : Math.max(p90, forecast);
  return peak > 0 && Number.isFinite(peak) ? peak * 1.1 : 0;
}

function toPct(value: number, max: number): number {
  if (!(max > 0) || !Number.isFinite(value)) {
    return 0;
  }
  return Math.min(100, Math.max(0, (value / max) * 100));
}

export function AlgoPositioningModule({
  positioning,
  actualSaves = null,
}: AlgoPositioningModuleProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [trackWidth, setTrackWidth] = useState(0);
  const { saves, thresholds } = positioning;
  const showActual = hasValue(actualSaves);
  const actualBand: AlgoBand | null = showActual
    ? algoBandForSaves(actualSaves, thresholds)
    : null;
  const reachedBand = actualBand ?? positioning.band;
  const max = domainMax(thresholds.p90, saves, actualSaves);

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

  if (!(max > 0)) {
    return null;
  }

  const cuts = [0, thresholds.p25, thresholds.p75, thresholds.p90, max];
  const forecastPct = toPct(saves, max);
  const actualPct = showActual ? toPct(actualSaves, max) : null;
  const findings = positioningFindings({
    forecastSaves: saves,
    actualSaves: showActual ? actualSaves : null,
    thresholds,
  });

  const summary = showActual
    ? `Algorithmic Positioning. Forecast ${formatCompactNumber(saves)} saves, actual ${formatCompactNumber(actualSaves)} saves. Reached ${ALGO_BAND_DISPLAY[reachedBand].label}.`
    : `Algorithmic Positioning. Forecast ${formatCompactNumber(saves)} saves. ${ALGO_BAND_DISPLAY[reachedBand].label} band.`;

  return (
    <section
      className="motion-fade-up rounded-instrument border border-border bg-surface p-5"
      aria-label={summary}
    >
      <SectionHeader>Algorithmic Positioning</SectionHeader>

      <div className="mt-5">
        <div className="flex">
          {ALGO_BAND_ORDER.map((bandKey, index) => {
            const widthPct = toPct(cuts[index + 1] - cuts[index], max);
            const isReached = bandKey === reachedBand;
            return (
              <p
                key={bandKey}
                className={
                  "truncate text-center text-[10.5px] font-medium uppercase tracking-[0.1em] " +
                  (isReached ? "text-foreground" : "text-secondary")
                }
                style={{ width: `${widthPct}%` }}
              >
                {ALGO_BAND_DISPLAY[bandKey].label}
              </p>
            );
          })}
        </div>

        <div className="relative mt-1 h-[15px]">
          {trackWidth > 0 ? (
            <MarkLabel
              pct={forecastPct}
              text="Forecast"
              placement="above"
              containerWidth={trackWidth}
            />
          ) : null}
        </div>

        <div
          ref={trackRef}
          className="relative h-2 w-full overflow-visible"
        >
          <div className="flex h-full w-full">
            {ALGO_BAND_ORDER.map((bandKey, index) => {
              const widthPct = toPct(cuts[index + 1] - cuts[index], max);
              const isReached = bandKey === reachedBand;
              return (
                <div
                  key={bandKey}
                  className={
                    "h-full bg-canvas-subtle " +
                    (index > 0 ? "border-l border-border" : "")
                  }
                  style={{
                    width: `${widthPct}%`,
                    backgroundColor: isReached ? REACHED_FILL : undefined,
                  }}
                  aria-hidden="true"
                />
              );
            })}
          </div>
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
              className="z-[1]"
            />
          ) : null}
        </div>

        <div className="relative h-[15px]">
          {trackWidth > 0
            ? cuts.slice(0, 4).map((value, index) => {
                const pct = toPct(value, max);
                return (
                  <span
                    key={index}
                    className="absolute bottom-0 whitespace-nowrap text-[11.5px] tabular-nums leading-none text-secondary"
                    style={
                      index === 0
                        ? { left: 0 }
                        : {
                            left: `${pct}%`,
                            transform: "translateX(-50%)",
                          }
                    }
                  >
                    {formatCompactNumber(value)}
                  </span>
                );
              })
            : null}
          {trackWidth > 0 && actualPct != null ? (
            <MarkLabel
              pct={actualPct}
              text="Actual"
              placement="below"
              containerWidth={trackWidth}
              tone="foreground"
            />
          ) : null}
        </div>
      </div>

      <AnalysisBlock findings={findings} />
    </section>
  );
}
