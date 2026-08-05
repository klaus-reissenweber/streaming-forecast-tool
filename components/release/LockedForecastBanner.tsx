"use client";

import type { ReactNode } from "react";
import { formatCompactNumber, formatPercent } from "@/lib/format";
import { useCountUp } from "@/lib/hooks/use-count-up";

export interface LockedForecastBannerProps {
  streams: number;
  saves: number;
  impliedSaveRate: number;
  lockedAtDisplay: string;
  /** Organic locked + ad attributed streams in D1–D7. */
  week1WithAds?: number;
  week1AdMarquee?: number;
  week1AdShowcase?: number;
  week1AdMeta?: number;
  /** Awareness spend is reach-only (not in attributed stream totals). */
  metaAwarenessSpend?: number;
}

const COUNT_UP_STAGGER_MS = 50;

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

function DotMatrixFoot() {
  return (
    <div
      className="mt-2 flex items-center gap-1"
      aria-hidden="true"
    >
      {Array.from({ length: 8 }, (_, index) => (
        <span
          key={index}
          className="size-0.5 rounded-full bg-dot"
        />
      ))}
    </div>
  );
}

function MetricColumn({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0 flex-1 border-t-2 border-accent/40 py-1 sm:py-0 sm:pt-3">
      <dt className="text-[10px] font-medium uppercase tracking-[0.06em] text-muted">
        {label}
      </dt>
      <dd className="mt-1 font-mono text-[3rem] font-semibold tabular-nums leading-none tracking-[-0.02em] text-foreground">
        {children}
      </dd>
      <DotMatrixFoot />
    </div>
  );
}

export function LockedForecastBanner({
  streams,
  saves,
  impliedSaveRate,
  lockedAtDisplay,
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
      aria-label="Locked forecast"
    >
      <span
        className="pointer-events-none absolute inset-y-0 left-0 w-1 origin-top bg-accent animate-instrument-rule-grow"
        aria-hidden="true"
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="font-serif text-[1.5rem] font-semibold leading-tight text-foreground">
            <span className="bracket-tag bracket-tag--accent mr-2 align-middle">
              [LOCKED]
            </span>
            <span className="instrument-section-title align-middle">
              Locked forecast
            </span>
          </h2>
          <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.06em] text-muted">
            Organic · locked {lockedAtDisplay}
          </p>
        </div>
        <p className="font-mono text-[11px] uppercase tracking-[0.06em] text-muted sm:text-right">
          Pre-release monitoring
        </p>
      </div>

      <dl className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-stretch sm:gap-0">
        <MetricColumn label="Week-1 streams (organic)">
          <AnimatedCompactMetric value={streams} delay={0} />
        </MetricColumn>

        <div
          className="dot-matrix-divider hidden sm:flex"
          aria-hidden="true"
        />

        <MetricColumn label="Week-1 saves">
          <AnimatedCompactMetric
            value={saves}
            delay={COUNT_UP_STAGGER_MS}
          />
        </MetricColumn>

        <div
          className="dot-matrix-divider hidden sm:flex"
          aria-hidden="true"
        />

        <MetricColumn label="Implied save rate">
          <AnimatedPercentMetric
            value={impliedSaveRate}
            delay={COUNT_UP_STAGGER_MS * 2}
          />
        </MetricColumn>
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
