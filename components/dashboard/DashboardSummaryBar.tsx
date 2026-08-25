"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { SectionHeader } from "@/components/layout/SectionHeader";
import type {
  DashboardSummary,
  HealthDistribution,
  RecentFlag,
} from "@/lib/build-dashboard-view-model";
import type { FlagType } from "@/lib/flags";
import { useCountUp } from "@/lib/hooks/use-count-up";
import { StatusPill, type PillTone } from "@/components/ui/StatusPill";

export interface DashboardSummaryBarProps {
  summary: DashboardSummary;
}

const COUNT_UP_STAGGER_MS = 40;

const FLAG_TYPE_PILL: Record<FlagType, { label: string; tone: PillTone }> = {
  positive: { label: "Positive", tone: "positive" },
  warning: { label: "Warning", tone: "warning" },
  info: { label: "Info", tone: "info" },
};

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
  label,
  value,
  valueClass,
  context,
}: {
  label: string;
  value: ReactNode;
  valueClass?: string;
  context: string;
}) {
  return (
    <div className="min-w-0 flex-1 border-t border-border-subtle px-4 py-3 sm:border-t-0 sm:border-r sm:border-border-subtle sm:px-5 sm:py-4 sm:last:border-r-0">
      <dt className="text-[10px] font-medium uppercase tracking-[0.06em] text-foreground">
        {label}
      </dt>
      <dd
        className={`mt-2 text-[2.25rem] font-semibold tabular-nums leading-none tracking-[-0.02em] ${valueClass ?? "text-foreground"}`}
      >
        {value}
      </dd>
      <p className="mt-1.5 text-caption text-secondary">{context}</p>
    </div>
  );
}

function healthContextLine(distribution: HealthDistribution): string {
  const parts: string[] = [];
  if (distribution.lagging > 0) {
    parts.push(
      `${distribution.lagging} lagging`,
    );
  }
  if (distribution.outperforming > 0) {
    parts.push(
      `${distribution.outperforming} outperforming`,
    );
  }
  if (parts.length > 0) {
    return parts.join(" · ");
  }
  if (distribution.onTrack === 0 && distribution.awaiting > 0) {
    return "No scored releases yet";
  }
  return "None lagging or outperforming";
}

function RecentFlagItem({ item }: { item: RecentFlag }) {
  const config = FLAG_TYPE_PILL[item.flag.type];

  return (
    <li className="flex flex-wrap items-baseline gap-x-1.5 text-body-sm leading-snug">
      <StatusPill tone={config.tone}>{config.label}</StatusPill>
      <span className="font-medium text-foreground">{item.flag.title}</span>
      <span className="text-secondary" aria-hidden="true">
        ·
      </span>
      <Link
        href={`/release/${item.releaseId}`}
        className="text-secondary hover:text-accent-readable hover:underline"
      >
        {item.trackName}
        <span className="text-secondary"> · </span>
        {item.artistName}
      </Link>
      <span className="text-[10px] tabular-nums text-secondary">
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
  const { healthDistribution } = summary;
  const activeContext =
    healthDistribution.awaiting > 0
      ? `${healthDistribution.awaiting} awaiting Day 1 data`
      : "Monitoring window Days 1–28";

  return (
    <section
      className="motion-fade-up overflow-hidden rounded-instrument border border-border bg-surface"
      aria-label="Dashboard Summary"
    >
      <div className="p-5 pb-0">
        <SectionHeader>Summary</SectionHeader>
      </div>

      <dl className="mt-4 flex flex-col sm:flex-row sm:items-stretch">
        <MetricCell
          label="Active releases"
          value={
            <AnimatedCountMetric
              value={summary.totalActive}
              delay={0}
            />
          }
          context={activeContext}
        />

        <MetricCell
          label="On track"
          value={
            <AnimatedCountMetric
              value={healthDistribution.onTrack}
              delay={COUNT_UP_STAGGER_MS}
            />
          }
          context={healthContextLine(healthDistribution)}
        />

        <MetricCell
          label="Flags"
          value={
            <AnimatedCountMetric
              value={summary.totalFlags}
              delay={COUNT_UP_STAGGER_MS * 2}
            />
          }
          valueClass={flagsValueClass}
          context="Across active releases"
        />

        <MetricCell
          label="Last 24h"
          value={
            <AnimatedCountMetric
              value={summary.recentFlags.length}
              delay={COUNT_UP_STAGGER_MS * 3}
            />
          }
          context="Newly surfaced flags"
        />
      </dl>

      <div className="border-t border-border-subtle px-5 py-4">
        <h3 className="text-label text-foreground">Recent Flags</h3>
        {summary.recentFlags.length === 0 ? (
          <p className="mt-2 text-body-sm text-secondary">
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
