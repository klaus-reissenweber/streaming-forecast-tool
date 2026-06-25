"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import type {
  DashboardSummary,
  HealthDistribution,
  RecentFlag,
} from "@/lib/build-dashboard-view-model";
import type { FlagType } from "@/lib/flags";
import { useCountUp } from "@/lib/hooks/use-count-up";

export interface DashboardSummaryBarProps {
  summary: DashboardSummary;
}

const COUNT_UP_STAGGER_MS = 40;

const FLAG_TYPE_TAG: Record<FlagType, { tag: string; tagClass: string }> = {
  positive: { tag: "[+]", tagClass: "bracket-tag--positive" },
  warning: { tag: "[WARN]", tagClass: "bracket-tag--warning" },
  info: { tag: "[INFO]", tagClass: "bracket-tag--info" },
};

function InstrumentMetricFoot() {
  return (
    <div className="instrument-metric-foot" aria-hidden="true">
      {Array.from({ length: 8 }, (_, index) => (
        <span key={index} />
      ))}
    </div>
  );
}

function AnimatedCountMetric({
  value,
  delay,
}: {
  value: number;
  delay: number;
}) {
  const animated = useCountUp(value, { delay });

  return <span>{Math.round(animated)}</span>;
}

function MetricCell({
  tag,
  tagClass,
  label,
  value,
  valueClass,
  sublabel,
}: {
  tag: string;
  tagClass: string;
  label: string;
  value: ReactNode;
  valueClass?: string;
  sublabel?: string;
}) {
  return (
    <div className="min-w-0 flex-1 border-t border-accent/40 px-4 py-3 sm:px-5 sm:py-4">
      <dt className="flex flex-wrap items-center gap-1.5">
        <span className={`bracket-tag bracket-tag--axis ${tagClass}`}>
          {tag}
        </span>
        <span className="text-[10px] font-medium uppercase tracking-[0.06em] text-muted">
          {label}
        </span>
      </dt>
      <dd
        className={`mt-2 font-mono text-[2.25rem] font-semibold tabular-nums leading-none tracking-[-0.02em] ${valueClass ?? "text-foreground"}`}
      >
        {value}
      </dd>
      {sublabel ? (
        <p className="mt-1 text-caption text-muted">{sublabel}</p>
      ) : null}
      <InstrumentMetricFoot />
    </div>
  );
}

function formatHealthDistribution(distribution: HealthDistribution): ReactNode {
  const segments: ReactNode[] = [];

  if (distribution.onTrack > 0) {
    segments.push(
      <span key="on-track" className="text-secondary">
        {distribution.onTrack} on track
      </span>,
    );
  }
  if (distribution.lagging > 0) {
    segments.push(
      <span key="lagging" className="text-semantic-negative">
        {distribution.lagging} lagging
      </span>,
    );
  }
  if (distribution.outperforming > 0) {
    segments.push(
      <span key="outperforming" className="text-semantic-positive">
        {distribution.outperforming} outperforming
      </span>,
    );
  }
  if (distribution.awaiting > 0) {
    segments.push(
      <span key="awaiting" className="text-muted">
        {distribution.awaiting} awaiting
      </span>,
    );
  }

  if (segments.length === 0) {
    return <span className="text-muted">No releases</span>;
  }

  return (
    <span className="inline-flex flex-wrap items-baseline gap-x-1 gap-y-1 text-body-sm font-medium leading-snug">
      {segments.map((segment, index) => (
        <span key={index} className="inline-flex items-baseline">
          {index > 0 ? (
            <span className="mr-1 text-muted" aria-hidden="true">
              ·
            </span>
          ) : null}
          {segment}
        </span>
      ))}
    </span>
  );
}

function RecentFlagItem({ item }: { item: RecentFlag }) {
  const config = FLAG_TYPE_TAG[item.flag.type];

  return (
    <li className="flex flex-wrap items-baseline gap-x-1.5 text-body-sm leading-snug">
      <span className={`bracket-tag ${config.tagClass}`}>{config.tag}</span>
      <span className="font-medium text-foreground">{item.flag.title}</span>
      <span className="text-muted" aria-hidden="true">
        ·
      </span>
      <Link
        href={`/release/${item.releaseId}`}
        className="text-secondary hover:text-accent-readable hover:underline"
      >
        {item.trackName}
        <span className="text-muted"> · </span>
        {item.artistName}
      </Link>
      <span className="font-mono text-[10px] tabular-nums text-muted">
        {item.firedAtDisplay}
      </span>
    </li>
  );
}

export function DashboardSummaryBar({ summary }: DashboardSummaryBarProps) {
  const flagsValueClass =
    summary.totalFlags > 0
      ? "text-semantic-warning"
      : "text-foreground";

  return (
    <section
      className="motion-fade-up overflow-hidden rounded-instrument border border-border bg-surface"
      aria-label="Dashboard summary"
    >
      <div className="p-5 pb-0">
        <h2 className="font-serif text-section font-semibold text-foreground">
          <span className="bracket-tag bracket-tag--accent bracket-tag--section instrument-section-title">
            [SUMMARY]
          </span>
        </h2>
      </div>

      <dl className="mt-4 flex flex-col sm:flex-row sm:items-stretch">
        <MetricCell
          tag="[ACTIVE]"
          tagClass="bracket-tag--accent"
          label="Releases"
          value={
            <AnimatedCountMetric
              value={summary.totalActive}
              delay={0}
            />
          }
        />

        <div className="dot-matrix-divider hidden sm:flex" aria-hidden="true" />

        <MetricCell
          tag="[HEALTH]"
          tagClass="bracket-tag--neutral"
          label="Distribution"
          value={formatHealthDistribution(summary.healthDistribution)}
          valueClass="text-base font-sans font-medium leading-snug tracking-normal"
        />

        <div className="dot-matrix-divider hidden sm:flex" aria-hidden="true" />

        <MetricCell
          tag="[FLAGS]"
          tagClass={
            summary.totalFlags > 0
              ? "bracket-tag--warning"
              : "bracket-tag--neutral"
          }
          label="Firing"
          value={
            <AnimatedCountMetric
              value={summary.totalFlags}
              delay={COUNT_UP_STAGGER_MS}
            />
          }
          valueClass={flagsValueClass}
          sublabel="Across active releases"
        />

        <div className="dot-matrix-divider hidden sm:flex" aria-hidden="true" />

        <MetricCell
          tag="[RECENT]"
          tagClass="bracket-tag--accent"
          label="Last 24h"
          value={
            <AnimatedCountMetric
              value={summary.recentFlags.length}
              delay={COUNT_UP_STAGGER_MS * 2}
            />
          }
          sublabel="Newly surfaced flags"
        />
      </dl>

      <div className="border-t border-border-subtle px-5 py-4">
        <h3 className="text-label text-muted">Recent flags</h3>
        {summary.recentFlags.length === 0 ? (
          <p className="mt-2 text-body-sm text-muted">
            No flags surfaced in the last 24 hours.
          </p>
        ) : (
          <ul className="mt-2 space-y-2">
            {summary.recentFlags.map((item) => (
              <RecentFlagItem
                key={`${item.releaseId}-${item.flag.id}`}
                item={item}
              />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
