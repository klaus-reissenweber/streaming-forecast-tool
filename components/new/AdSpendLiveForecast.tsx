"use client";

import type { ReactNode } from "react";
import { useMemo } from "react";
import { MetaLogo, SpotifyLogo } from "@/components/brand/PlatformLogos";
import {
  computeAdAwarenessDisplay,
  computeAdAttributedTotals,
  computeAdMetaFunnelDisplay,
} from "@/lib/ad-forecast";
import { formatCount, formatUsd } from "@/lib/format";
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
  /** Omit the top border used under the /new spend form. */
  bare?: boolean;
}

const COUNT_UP_STAGGER_MS = 40;

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
    <div className="min-w-0 flex-1 basis-0 border-t border-border px-4 py-3 sm:px-5 sm:py-4">
      <p className="text-[10px] font-medium uppercase leading-tight tracking-[0.06em] text-foreground">
        {label}
      </p>
      <p className="mt-1 text-[1.5rem] font-semibold tabular-nums leading-none tracking-[-0.02em] text-foreground">
        {value}
      </p>
    </div>
  );
}

function ForecastCard({
  title,
  note,
  spendLabel,
  logo,
  children,
}: {
  title: string;
  note?: string;
  spendLabel?: string;
  logo?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="min-w-0" aria-label={title}>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <div className="flex items-center gap-2">
          {logo}
          <h3 className="text-body-sm font-medium text-secondary">{title}</h3>
        </div>
        {spendLabel ? (
          <p className="text-caption tabular-nums text-secondary">
            {spendLabel}
          </p>
        ) : null}
      </div>
      {note ? (
        <p className="mt-1 text-caption leading-snug text-secondary">{note}</p>
      ) : null}
      <div className="mt-2 min-w-0 overflow-hidden rounded-instrument border border-border bg-surface">
        <div className="flex min-w-0 w-full flex-col sm:flex-row sm:items-stretch sm:divide-x sm:divide-border-subtle">
          {children}
        </div>
      </div>
    </section>
  );
}

function cpsLabel(spend: number, streams: number): string {
  if (!(spend > 0) || !(streams > 0)) return "—";
  return formatUsd(spend / streams, 2);
}

export function AdSpendLiveForecast({
  artistName,
  genre,
  marqueeSpend,
  showcaseSpend,
  metaTrafficSpend,
  metaAwarenessSpend,
  adModel,
  bare = false,
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

  const spotifySpend = marqueeSpend + showcaseSpend;
  const spotifyCps = cpsLabel(spotifySpend, totals.spotifyTotal);
  const metaCps =
    metaFunnel.costPerStream != null
      ? formatUsd(metaFunnel.costPerStream, 2)
      : cpsLabel(metaTrafficSpend, metaFunnel.projectedStreams);

  const totalImpressions =
    (hasMetaTraffic ? metaFunnel.projectedImpressions : 0) +
    (hasAwareness ? awareness.projectedImpressions : 0);
  const totalReach =
    (hasMetaTraffic ? metaFunnel.projectedReach : 0) +
    (hasAwareness ? awareness.projectedReach : 0);
  const totalClicks = hasMetaTraffic ? metaFunnel.projectedClicks : 0;
  const totalStreams = totals.grandTotal;

  const spotifySpendParts = [
    marqueeSpend > 0 ? `Marquee ${formatUsd(marqueeSpend, 0)}` : null,
    showcaseSpend > 0 ? `Showcase ${formatUsd(showcaseSpend, 0)}` : null,
  ].filter(Boolean);

  return (
    <div
      className={
        bare ? "space-y-4" : "mt-5 space-y-4 border-t border-border/80 pt-5"
      }
    >
      {hasSpotify ? (
        <ForecastCard
          title="Spotify Ads"
          logo={<SpotifyLogo className="h-5 w-5" />}
          spendLabel={spotifySpendParts.join(" · ") || undefined}
        >
          {marqueeSpend > 0 ? (
            <MetricCell
              label="Marquee streams"
              value={<AnimatedCount value={totals.spotifyMarquee} delay={0} />}
            />
          ) : null}
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
          <MetricCell label="Cost per stream" value={spotifyCps} />
        </ForecastCard>
      ) : null}

      {hasMetaTraffic ? (
        <ForecastCard
          title="Meta Traffic"
          logo={<MetaLogo className="h-5 w-auto" />}
          spendLabel={formatUsd(metaTrafficSpend, 0)}
          note="Streams are estimated. Also builds reach and a retargetable audience — cost per stream understates its value."
        >
          <MetricCell
            label="Streams (Estimated)"
            value={
              <AnimatedCount
                value={metaFunnel.projectedStreams}
                delay={0}
              />
            }
          />
          <MetricCell
            label="Clicks"
            value={
              <AnimatedCount
                value={metaFunnel.projectedClicks}
                delay={COUNT_UP_STAGGER_MS}
              />
            }
          />
          <MetricCell
            label="Impressions"
            value={
              <AnimatedCount
                value={metaFunnel.projectedImpressions}
                delay={COUNT_UP_STAGGER_MS * 2}
              />
            }
          />
          <MetricCell label="Cost per stream" value={metaCps} />
        </ForecastCard>
      ) : null}

      {hasAwareness ? (
        <ForecastCard
          title="Meta Awareness"
          logo={<MetaLogo className="h-5 w-auto" />}
          spendLabel={formatUsd(metaAwarenessSpend, 0)}
        >
          <MetricCell
            label="Impressions"
            value={
              <AnimatedCount
                value={awareness.projectedImpressions}
                delay={0}
              />
            }
          />
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

      <ForecastCard title="Paid Totals">
        <MetricCell
          label="Streams"
          value={<AnimatedCount value={totalStreams} delay={0} />}
        />
        <MetricCell
          label="Impressions"
          value={
            <AnimatedCount
              value={totalImpressions}
              delay={COUNT_UP_STAGGER_MS}
            />
          }
        />
        <MetricCell
          label="Reach"
          value={
            <AnimatedCount value={totalReach} delay={COUNT_UP_STAGGER_MS * 2} />
          }
        />
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
