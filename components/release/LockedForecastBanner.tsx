"use client";

import { SectionHeader } from "@/components/layout/SectionHeader";
import type { ReactNode } from "react";
import { formatCompactNumber, formatPercent } from "@/lib/format";
import { useCountUp } from "@/lib/hooks/use-count-up";
import type { ReleaseStatus } from "@/lib/map-release-row";
import {
  saveRateBandCaption,
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
  lockedAtDisplay: string;
  status: ReleaseStatus;
  releaseDate: string;
  /** Organic locked + ad attributed streams in D1–D7. */
  week1WithAds?: number;
  week1AdMarquee?: number;
  week1AdShowcase?: number;
  week1AdMeta?: number;
  /** Awareness spend is reach-only (not in attributed stream totals). */
  metaAwarenessSpend?: number;
}

const COUNT_UP_STAGGER_MS = 50;

function forecastStatusLabel(
  status: ReleaseStatus,
  releaseDate: string,
): string {
  if (status === "closed") {
    return "Final forecast";
  }
  const todayUtc = new Date().toISOString().slice(0, 10);
  if (todayUtc < releaseDate) {
    return "Pre-release forecast";
  }
  return "Live monitoring";
}

function AnimatedCompactMetric({
  value,
  delay,
}: {
  value: number;
  delay: number;
}) {
  const animated = useCountUp(value, { delay });

  return (
    <span>{formatCompactNumber(Math.round(animated))}</span>
  );
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

function MetricColumn({
  label,
  children,
  caption,
  valueClassName,
}: {
  label: string;
  children: ReactNode;
  caption?: string;
  valueClassName?: string;
}) {
  return (
    <div className="min-w-0 flex-1 border-t-2 border-accent/40 py-1 sm:px-4 sm:py-0 sm:pt-3 sm:first:pl-0 sm:last:pr-0">
      <dt className="text-[10px] font-medium uppercase tracking-[0.06em] text-muted">
        {label}
      </dt>
      <dd
        className={
          "mt-1 font-mono text-[3rem] font-semibold tabular-nums leading-none tracking-[-0.02em] " +
          (valueClassName ?? "text-foreground")
        }
      >
        {children}
      </dd>
      {caption ? (
        <p
          className={
            "mt-2 text-caption " + (valueClassName ?? "text-muted")
          }
        >
          {caption}
        </p>
      ) : null}
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
  lockedAtDisplay,
  status,
  releaseDate,
  week1WithAds,
  week1AdMarquee = 0,
  week1AdShowcase = 0,
  week1AdMeta = 0,
  metaAwarenessSpend = 0,
}: LockedForecastBannerProps) {
  const adTotal = week1AdMarquee + week1AdShowcase + week1AdMeta;
  const showAds = adTotal > 0 && week1WithAds != null;
  const showAwarenessOnly = !showAds && metaAwarenessSpend > 0;

  return (
    <section
      className="motion-fade-up relative overflow-hidden rounded-instrument border border-border bg-accent-tint p-5"
      aria-label="Forecast"
    >
      <span
        className="pointer-events-none absolute inset-y-0 left-0 w-1 origin-top bg-accent animate-instrument-rule-grow"
        aria-hidden="true"
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <SectionHeader description={`Organic · ${lockedAtDisplay}`}>
            Forecast
          </SectionHeader>
        </div>
        <p className="text-sm text-muted sm:text-right">
          {forecastStatusLabel(status, releaseDate)}
        </p>
      </div>

      <dl className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-stretch sm:gap-0 sm:divide-x sm:divide-border-subtle">
        <MetricColumn label="Week-1 streams (organic)">
          <AnimatedCompactMetric value={streams} delay={0} />
        </MetricColumn>

        <MetricColumn label="Week-1 saves">
          <AnimatedCompactMetric
            value={saves}
            delay={COUNT_UP_STAGGER_MS}
          />
        </MetricColumn>

        <MetricColumn label="Forecast save rate">
          <AnimatedPercentMetric
            value={forecastSaveRate}
            delay={COUNT_UP_STAGGER_MS * 2}
          />
        </MetricColumn>

        {actualSaveRate != null && actualSaveRateVsBand != null ? (
          <MetricColumn
            label="Actual save rate"
            valueClassName={saveRateToneClass(actualSaveRateVsBand)}
            caption={saveRateBandCaption(actualSaveRateVsBand, saveRateBand)}
          >
            <AnimatedPercentMetric
              value={actualSaveRate}
              delay={COUNT_UP_STAGGER_MS * 3}
            />
          </MetricColumn>
        ) : null}
      </dl>

      {showAds ? (
        <div className="mt-5 border-t border-accent-border pt-4">
          <p className="font-mono text-[11px] uppercase tracking-[0.06em] text-muted">
            Wk1 with ads (organic + attributed)
          </p>
          <p className="mt-1 font-mono text-[1.75rem] font-semibold tabular-nums tracking-[-0.02em] text-foreground">
            <AnimatedCompactMetric
              value={week1WithAds}
              delay={COUNT_UP_STAGGER_MS * 3}
            />
          </p>
          <p className="mt-2 text-caption text-secondary">
            +{adTotal.toLocaleString("en-US")} attributed
            {" · "}
            <span className="text-[color:var(--color-chart-spotify-marquee)]">
              Marquee {week1AdMarquee.toLocaleString("en-US")}
            </span>
            {" · "}
            <span className="text-[color:var(--color-chart-spotify-showcase)]">
              Showcase {week1AdShowcase.toLocaleString("en-US")}
            </span>
            {" · "}
            <span className="text-[color:var(--color-chart-meta-ads)]">
              Meta traffic {week1AdMeta.toLocaleString("en-US")}
            </span>
            {metaAwarenessSpend > 0 ? (
              <>
                {" · "}
                <span className="text-muted">
                  Awareness ${metaAwarenessSpend.toLocaleString("en-US")}{" "}
                  reach-only
                </span>
              </>
            ) : null}
          </p>
        </div>
      ) : null}

      {showAwarenessOnly ? (
        <div className="mt-5 border-t border-accent-border pt-4">
          <p className="font-mono text-[11px] uppercase tracking-[0.06em] text-muted">
            Meta awareness (reach-only)
          </p>
          <p className="mt-2 text-caption text-secondary">
            ${metaAwarenessSpend.toLocaleString("en-US")} planned — not included
            in attributed stream totals.
          </p>
        </div>
      ) : null}
    </section>
  );
}
