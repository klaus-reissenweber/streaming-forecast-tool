"use client";

import type { ReactNode } from "react";
import { useMemo } from "react";
import {
  computeAdAwarenessDisplay,
  computeAdAttributedTotals,
  computeAdMetaFunnelDisplay,
} from "@/lib/ad-forecast";
import { formatCount } from "@/lib/format";
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

function InstrumentMetricFoot() {
  return (
    <div className="instrument-metric-foot mt-0" aria-hidden="true">
      {Array.from({ length: 8 }, (_, index) => (
        <span key={index} />
      ))}
    </div>
  );
}

function AnimatedCount({ value, delay }: { value: number; delay: number }) {
  const animated = useCountUp(value, { delay, enabled: value > 0 });
  return <span>{formatCount(animated)}</span>;
}

function MetricCell({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="grid min-w-0 flex-1 basis-0 grid-rows-[1.25rem_1.75rem_0.625rem] gap-y-1 border-t border-border px-4 py-3 sm:px-5 sm:py-4">
      <p className="flex min-h-[1.25rem] items-end text-[10px] font-medium uppercase tracking-[0.06em] text-muted">
        {label}
      </p>
      <p className="flex min-h-[1.75rem] items-end font-mono text-[1.5rem] font-semibold tabular-nums leading-none tracking-[-0.02em] text-foreground">
        {value}
      </p>
      <InstrumentMetricFoot />
    </div>
  );
}

function ForecastCard({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: ReactNode;
}) {
  return (
    <section className="min-w-0" aria-label={title}>
      <h3 className="text-body-sm font-medium text-secondary">{title}</h3>
      {note ? (
        <p className="mt-1 text-caption leading-snug text-muted">{note}</p>
      ) : null}
      <div className="mt-2 min-w-0 overflow-hidden rounded-instrument border border-border bg-surface">
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
  const hasAnyChannel = hasSpotify || hasMetaTraffic || hasAwareness;

  if (!hasAnyChannel) {
    return null;
  }

  const totalImpressions =
    (hasMetaTraffic ? metaFunnel.projectedImpressions : 0) +
    (hasAwareness ? awareness.projectedImpressions : 0);
  const totalReach =
    (hasMetaTraffic ? metaFunnel.projectedReach : 0) +
    (hasAwareness ? awareness.projectedReach : 0);
  const totalClicks = hasMetaTraffic ? metaFunnel.projectedClicks : 0;
  const totalStreams = totals.grandTotal;

  return (
    <div className="mt-5 space-y-4 border-t border-border/80 pt-5">
      {hasSpotify ? (
        <ForecastCard title="Spotify ads">
          {marqueeSpend > 0 ? (
            <MetricCell
              label="Marquee streams"
              value={<AnimatedCount value={totals.spotifyMarquee} delay={0} />}
            />
          ) : null}
          {marqueeSpend > 0 && showcaseSpend > 0 ? <Divider /> : null}
          {showcaseSpend > 0 ? (
            <MetricCell
              label="Showcase streams"
              value={
                <AnimatedCount
                  value={totals.spotifyShowcase}
                  delay={COUNT_UP_STAGGER_MS}
                />
              }
            />
          ) : null}
          {marqueeSpend > 0 && showcaseSpend > 0 ? (
            <>
              <Divider />
              <MetricCell
                label="Streams"
                value={
                  <AnimatedCount
                    value={totals.spotifyTotal}
                    delay={COUNT_UP_STAGGER_MS * 2}
                  />
                }
              />
            </>
          ) : null}
        </ForecastCard>
      ) : null}

      {hasMetaTraffic ? (
        <ForecastCard
          title="Meta traffic"
          note="Also builds reach and a retargetable audience — cost-per-stream understates its value."
        >
          <MetricCell
            label="Streams"
            value={
              <AnimatedCount
                value={metaFunnel.projectedStreams}
                delay={0}
              />
            }
          />
          <Divider />
          <MetricCell
            label="Clicks"
            value={
              <AnimatedCount
                value={metaFunnel.projectedClicks}
                delay={COUNT_UP_STAGGER_MS}
              />
            }
          />
          <Divider />
          <MetricCell
            label="Impressions"
            value={
              <AnimatedCount
                value={metaFunnel.projectedImpressions}
                delay={COUNT_UP_STAGGER_MS * 2}
              />
            }
          />
        </ForecastCard>
      ) : null}

      {hasAwareness ? (
        <ForecastCard title="Meta awareness">
          <MetricCell
            label="Impressions"
            value={
              <AnimatedCount
                value={awareness.projectedImpressions}
                delay={0}
              />
            }
          />
          <Divider />
          <MetricCell
            label="Reach"
            value={
              <AnimatedCount
                value={awareness.projectedReach}
                delay={COUNT_UP_STAGGER_MS}
              />
            }
          />
        </ForecastCard>
      ) : null}

      <ForecastCard title="Paid totals">
        <MetricCell
          label="Streams"
          value={<AnimatedCount value={totalStreams} delay={0} />}
        />
        <Divider />
        <MetricCell
          label="Impressions"
          value={
            <AnimatedCount
              value={totalImpressions}
              delay={COUNT_UP_STAGGER_MS}
            />
          }
        />
        <Divider />
        <MetricCell
          label="Reach"
          value={
            <AnimatedCount value={totalReach} delay={COUNT_UP_STAGGER_MS * 2} />
          }
        />
        <Divider />
        <MetricCell
          label="Clicks"
          value={
            <AnimatedCount
              value={totalClicks}
              delay={COUNT_UP_STAGGER_MS * 3}
            />
          }
        />
      </ForecastCard>
    </div>
  );
}
