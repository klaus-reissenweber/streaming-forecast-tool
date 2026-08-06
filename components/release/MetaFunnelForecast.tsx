"use client";

import type { ReactNode } from "react";
import { useMemo } from "react";
import { computeAdMetaFunnelDisplay } from "@/lib/ad-forecast";
import { formatCompactNumber, formatPercent, formatUsd } from "@/lib/format";
import type { Genre } from "@/lib/forecast";
import { useCountUp } from "@/lib/hooks/use-count-up";
import type { AdModel } from "@/lib/model/ad-model";

export interface MetaFunnelForecastProps {
  /** Meta traffic spend — the only Meta spend that attributes streams. */
  spend: number;
  artistName: string;
  genre: Genre;
  /** Active model ad_model — CPC/share/streams come from here, not seed constants. */
  adModel: AdModel;
  /** Awareness spend is reach-only (shown, not funneled). */
  awarenessSpend?: number;
}

const COUNT_UP_STAGGER_MS = 40;
const PLACEHOLDER_VALUE = "—";

function InstrumentMetricFoot() {
  return (
    <div className="instrument-metric-foot mt-0" aria-hidden="true">
      {Array.from({ length: 8 }, (_, index) => (
        <span key={index} />
      ))}
    </div>
  );
}

function AnimatedCompactMetric({
  value,
  delay,
}: {
  value: number;
  delay: number;
}) {
  const animated = useCountUp(value, { delay, enabled: value > 0 });

  return <span>{formatCompactNumber(Math.round(animated))}</span>;
}

function MetricCell({
  label,
  value,
  sublabel,
}: {
  label: string;
  value: ReactNode;
  sublabel: string;
}) {
  return (
    <div className="grid min-w-0 flex-1 basis-0 grid-rows-[1.25rem_1.75rem_2rem_0.625rem] gap-y-1 border-t border-accent/40 px-4 py-3 sm:px-5 sm:py-4">
      <p className="flex min-h-[1.25rem] items-end text-[10px] font-medium uppercase tracking-[0.06em] text-muted">
        {label}
      </p>
      <p className="flex min-h-[1.75rem] items-end font-mono text-[1.75rem] font-semibold tabular-nums leading-none tracking-[-0.02em] text-foreground">
        {value}
      </p>
      <p className="flex min-h-[2rem] items-start text-caption leading-snug text-muted">
        {sublabel}
      </p>
      <InstrumentMetricFoot />
    </div>
  );
}

export function MetaFunnelForecast({
  spend,
  artistName,
  genre,
  adModel,
  awarenessSpend = 0,
}: MetaFunnelForecastProps) {
  const funnel = useMemo(
    () => computeAdMetaFunnelDisplay(spend, artistName, genre, adModel),
    [spend, artistName, genre, adModel],
  );

  const hasSpend = spend > 0;

  return (
    <section className="motion-fade-up min-w-0" aria-label="Meta funnel forecast">
      <h2 className="font-serif text-section font-semibold text-foreground">
        <span className="bracket-tag bracket-tag--accent bracket-tag--section instrument-section-title">
          [META FUNNEL]
        </span>
      </h2>
      <p className="mt-1 text-caption leading-snug text-muted">
        Also builds reach and a retargetable audience — cost-per-stream understates
        its value.
      </p>
      {awarenessSpend > 0 ? (
        <p className="mt-1 text-caption text-secondary">
          Awareness {formatUsd(awarenessSpend, 0)} — impressions and reach.
        </p>
      ) : null}

      <div className="mt-4 min-w-0 overflow-hidden rounded-instrument border border-border bg-surface">
        <div className="flex min-w-0 w-full flex-col sm:flex-row sm:items-stretch">
          <MetricCell
            label="Streams"
            sublabel={`${formatUsd(funnel.cpc, 2)} CPC`}
            value={
              hasSpend ? (
                <AnimatedCompactMetric
                  value={funnel.projectedStreams}
                  delay={0}
                />
              ) : (
                PLACEHOLDER_VALUE
              )
            }
          />

          <div
            className="dot-matrix-divider hidden sm:flex"
            aria-hidden="true"
          />

          <MetricCell
            label="Clicks"
            sublabel={`${formatPercent(funnel.spotifyClickShare * 100, 0)} Spotify share`}
            value={
              hasSpend ? (
                <AnimatedCompactMetric
                  value={funnel.projectedClicks}
                  delay={COUNT_UP_STAGGER_MS}
                />
              ) : (
                PLACEHOLDER_VALUE
              )
            }
          />

          <div
            className="dot-matrix-divider hidden sm:flex"
            aria-hidden="true"
          />

          <MetricCell
            label="Impressions"
            sublabel={`${formatUsd(funnel.cpm, 2)} CPM`}
            value={
              hasSpend ? (
                <AnimatedCompactMetric
                  value={funnel.projectedImpressions}
                  delay={COUNT_UP_STAGGER_MS * 2}
                />
              ) : (
                PLACEHOLDER_VALUE
              )
            }
          />
        </div>
      </div>
    </section>
  );
}
