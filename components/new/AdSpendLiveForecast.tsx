"use client";

import type { ReactNode } from "react";
import { useMemo } from "react";
import {
  computeAdAwarenessDisplay,
  computeAdAttributedTotals,
  computeAdMetaFunnelDisplay,
} from "@/lib/ad-forecast";
import { formatCompactNumber, formatPercent, formatUsd } from "@/lib/format";
import type { Genre } from "@/lib/forecast";
import { useCountUp } from "@/lib/hooks/use-count-up";
import type { AdModel } from "@/lib/model/ad-model";

export interface AdSpendLiveForecastProps {
  artistName: string;
  genre: Genre;
  marqueeSpend: number;
  showcaseSpend: number;
  metaTrafficSpend: number;
  metaAwarenessSpend: number;
  /** Active model — CPL/SPL/CPC/CPM all from here. */
  adModel: AdModel;
}

const COUNT_UP_STAGGER_MS = 40;
const PLACEHOLDER = "—";

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

function ForecastPanel({
  tag,
  subtitle,
  children,
}: {
  tag: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <section className="motion-fade-up min-w-0" aria-label={tag}>
      <h3 className="font-serif text-section font-semibold text-foreground">
        <span className="bracket-tag bracket-tag--accent bracket-tag--section instrument-section-title">
          [{tag}]
        </span>
      </h3>
      <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.06em] text-muted">
        {subtitle}
      </p>
      <div className="mt-3 min-w-0 overflow-hidden rounded-instrument border border-border bg-surface">
        <div className="flex min-w-0 w-full flex-col sm:flex-row sm:items-stretch">
          {children}
        </div>
      </div>
    </section>
  );
}

function Divider() {
  return (
    <div className="dot-matrix-divider hidden sm:flex" aria-hidden="true" />
  );
}

export function AdSpendLiveForecast({
  artistName,
  genre,
  marqueeSpend,
  showcaseSpend,
  metaTrafficSpend,
  metaAwarenessSpend,
  adModel,
}: AdSpendLiveForecastProps) {
  // Genre + artist + spends all in deps so SPL re-resolution updates live.
  const totals = useMemo(
    () =>
      computeAdAttributedTotals(
        {
          artistName,
          genre,
          marqueeSpend,
          showcaseSpend,
          metaTrafficSpend,
          metaAwarenessSpend,
          campaignStartOffsetDays: 0,
          metaDurationDays: 14,
        },
        adModel,
      ),
    [
      artistName,
      genre,
      marqueeSpend,
      showcaseSpend,
      metaTrafficSpend,
      metaAwarenessSpend,
      adModel,
    ],
  );

  const metaFunnel = useMemo(
    () =>
      computeAdMetaFunnelDisplay(
        metaTrafficSpend,
        artistName,
        genre,
        adModel,
      ),
    [metaTrafficSpend, artistName, genre, adModel],
  );

  const awareness = useMemo(
    () => computeAdAwarenessDisplay(metaAwarenessSpend, adModel),
    [metaAwarenessSpend, adModel],
  );

  const hasSpotify = marqueeSpend > 0 || showcaseSpend > 0;
  const hasMetaTraffic = metaTrafficSpend > 0;
  const hasAwareness = metaAwarenessSpend > 0;
  const hasAnyStreams = totals.grandTotal > 0;

  const costPerStreamLabel =
    metaFunnel.costPerStream != null
      ? `${formatUsd(metaFunnel.costPerStream, 2)} / stream`
      : "estimate";

  return (
    <div className="space-y-6">
      <ForecastPanel
        tag="SPOTIFY ADS"
        subtitle={`SPL ${totals.splUsed.toFixed(2)} (${totals.splSource}) · CPL M ${formatUsd(adModel.spotifyCpl.marquee, 2)} / S ${formatUsd(adModel.spotifyCpl.showcase, 2)}`}
      >
        <MetricCell
          label="Marquee streams"
          sublabel={`${formatUsd(marqueeSpend, 0)} ÷ ${formatUsd(adModel.spotifyCpl.marquee, 2)} × ${totals.splUsed.toFixed(2)}`}
          value={
            marqueeSpend > 0 ? (
              <AnimatedCompactMetric value={totals.spotifyMarquee} delay={0} />
            ) : (
              PLACEHOLDER
            )
          }
        />
        <Divider />
        <MetricCell
          label="Showcase streams"
          sublabel={`${formatUsd(showcaseSpend, 0)} ÷ ${formatUsd(adModel.spotifyCpl.showcase, 2)} × ${totals.splUsed.toFixed(2)}`}
          value={
            showcaseSpend > 0 ? (
              <AnimatedCompactMetric
                value={totals.spotifyShowcase}
                delay={COUNT_UP_STAGGER_MS}
              />
            ) : (
              PLACEHOLDER
            )
          }
        />
        <Divider />
        <MetricCell
          label="Spotify total"
          sublabel={hasSpotify ? "Marquee + Showcase" : "Enter spend above"}
          value={
            hasSpotify ? (
              <AnimatedCompactMetric
                value={totals.spotifyTotal}
                delay={COUNT_UP_STAGGER_MS * 2}
              />
            ) : (
              PLACEHOLDER
            )
          }
        />
      </ForecastPanel>

      <ForecastPanel
        tag="META TRAFFIC"
        subtitle={`CPC ${formatUsd(metaFunnel.cpc, 2)} · confidence ${metaFunnel.confidence}`}
      >
        <MetricCell
          label="Link clicks"
          sublabel={`${formatUsd(metaFunnel.cpc, 2)} CPC`}
          value={
            hasMetaTraffic ? (
              <AnimatedCompactMetric
                value={metaFunnel.projectedClicks}
                delay={0}
              />
            ) : (
              PLACEHOLDER
            )
          }
        />
        <Divider />
        <MetricCell
          label="Spotify clicks"
          sublabel={`${formatPercent(metaFunnel.spotifyClickShare * 100, 0)} share`}
          value={
            hasMetaTraffic ? (
              <AnimatedCompactMetric
                value={metaFunnel.projectedSpotifyClicks}
                delay={COUNT_UP_STAGGER_MS}
              />
            ) : (
              PLACEHOLDER
            )
          }
        />
        <Divider />
        <MetricCell
          label="Streams"
          sublabel={`${metaFunnel.streamsPerSpotifyClickEffective.toFixed(2)} s/click · ${costPerStreamLabel}`}
          value={
            hasMetaTraffic ? (
              <AnimatedCompactMetric
                value={metaFunnel.projectedStreams}
                delay={COUNT_UP_STAGGER_MS * 2}
              />
            ) : (
              PLACEHOLDER
            )
          }
        />
      </ForecastPanel>

      <ForecastPanel
        tag="META AWARENESS"
        subtitle={`CPM ${formatUsd(awareness.cpm, 2)} · $/reach ${awareness.costPerReach.toFixed(4)} · confidence ${awareness.confidence} · 0 streams`}
      >
        <MetricCell
          label="Impressions"
          sublabel={`${formatUsd(awareness.cpm, 2)} CPM`}
          value={
            hasAwareness ? (
              <AnimatedCompactMetric
                value={awareness.projectedImpressions}
                delay={0}
              />
            ) : (
              PLACEHOLDER
            )
          }
        />
        <Divider />
        <MetricCell
          label="Reach"
          sublabel={`${awareness.costPerReach.toFixed(4)} / reach`}
          value={
            hasAwareness ? (
              <AnimatedCompactMetric
                value={awareness.projectedReach}
                delay={COUNT_UP_STAGGER_MS}
              />
            ) : (
              PLACEHOLDER
            )
          }
        />
        <Divider />
        <MetricCell
          label="Attributed streams"
          sublabel="Reach-only · not in stream total"
          value={hasAwareness ? "0" : PLACEHOLDER}
        />
      </ForecastPanel>

      <ForecastPanel
        tag="TOTAL STREAMS"
        subtitle="Spotify + Meta traffic · awareness excluded"
      >
        <MetricCell
          label="Total forecasted streams"
          sublabel={
            hasAnyStreams
              ? `Spotify ${formatCompactNumber(Math.round(totals.spotifyTotal))} + Meta ${formatCompactNumber(Math.round(totals.meta))}`
              : "Enter Spotify or Meta traffic spend"
          }
          value={
            hasAnyStreams ? (
              <AnimatedCompactMetric value={totals.grandTotal} delay={0} />
            ) : (
              PLACEHOLDER
            )
          }
        />
      </ForecastPanel>
    </div>
  );
}
