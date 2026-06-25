"use client";

import type { ReactNode } from "react";
import { formatCompactNumber } from "@/lib/format";
import { useCountUp } from "@/lib/hooks/use-count-up";

export interface MetricCardsProps {
  projectedWk1Streams: number;
  projectedWk1Sublabel: string;
  saveVelocity: string | null;
  algoBandLabel: string;
  algoBandSublabel: string;
  modelConfidenceR2: number;
}

const COUNT_UP_STAGGER_MS = 40;

function formatR2(value: number): string {
  if (!Number.isFinite(value)) {
    return "n/a";
  }
  return value.toFixed(2);
}

function InstrumentMetricFoot() {
  return (
    <div className="instrument-metric-foot" aria-hidden="true">
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
  const animated = useCountUp(value, { delay });

  return (
    <span>{formatCompactNumber(Math.round(animated))}</span>
  );
}

function AnimatedR2Metric({
  value,
  delay,
}: {
  value: number;
  delay: number;
}) {
  const animated = useCountUp(value, { delay });

  return <span>{formatR2(animated)}</span>;
}

function AnimatedSaveVelocityMetric({
  display,
  delay,
}: {
  display: string;
  delay: number;
}) {
  const percentMatch = display.match(/^(\d+)%/);
  const percent = percentMatch ? Number(percentMatch[1]) : null;

  if (percent == null) {
    return <span>{display}</span>;
  }

  const animated = useCountUp(percent, { delay });
  const suffix = display.slice(percentMatch![0].length);

  return (
    <span>
      {Math.round(animated)}%{suffix}
    </span>
  );
}

function MetricCell({
  tag,
  tagClass,
  label,
  value,
  sublabel,
}: {
  tag: string;
  tagClass: string;
  label: string;
  value: ReactNode;
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
      <dd className="mt-2 font-mono text-[2.25rem] font-semibold tabular-nums leading-none tracking-[-0.02em] text-foreground">
        {value}
      </dd>
      {sublabel ? (
        <p className="mt-1 text-caption text-muted">{sublabel}</p>
      ) : null}
      <InstrumentMetricFoot />
    </div>
  );
}

export function MetricCards({
  projectedWk1Streams,
  projectedWk1Sublabel,
  saveVelocity,
  algoBandLabel,
  algoBandSublabel,
  modelConfidenceR2,
}: MetricCardsProps) {
  const algoTag = algoBandSublabel === "Live pace" ? "[LIVE]" : "[LOCKED]";
  const algoTagClass =
    algoBandSublabel === "Live pace"
      ? "bracket-tag--accent"
      : "bracket-tag--neutral";

  return (
    <section
      className="motion-fade-up"
      aria-label="Key metrics"
    >
      <h2 className="font-serif text-section font-semibold text-foreground">
        <span className="bracket-tag bracket-tag--accent bracket-tag--section instrument-section-title">
          [METRICS]
        </span>
      </h2>

      <div className="mt-4 overflow-hidden rounded-instrument border border-border bg-surface">
        <dl className="flex flex-col sm:flex-row sm:items-stretch">
          <MetricCell
            tag="[LIVE]"
            tagClass="bracket-tag--accent"
            label="Projected wk1"
            sublabel={projectedWk1Sublabel}
            value={
              <AnimatedCompactMetric
                value={projectedWk1Streams}
                delay={0}
              />
            }
          />

          <div
            className="dot-matrix-divider hidden sm:flex"
            aria-hidden="true"
          />

          <MetricCell
            tag="[LIVE]"
            tagClass="bracket-tag--accent"
            label="Save velocity"
            sublabel={saveVelocity ? "Vs tier p50" : "Needs daily saves"}
            value={
              saveVelocity ? (
                <AnimatedSaveVelocityMetric
                  display={saveVelocity}
                  delay={COUNT_UP_STAGGER_MS}
                />
              ) : (
                "Awaiting data"
              )
            }
          />

          <div
            className="dot-matrix-divider hidden sm:flex"
            aria-hidden="true"
          />

          <MetricCell
            tag={algoTag}
            tagClass={algoTagClass}
            label="Algo positioning"
            value={algoBandLabel}
          />

          <div
            className="dot-matrix-divider hidden sm:flex"
            aria-hidden="true"
          />

          <MetricCell
            tag="[MODEL]"
            tagClass="bracket-tag--neutral"
            label="Model confidence"
            sublabel="streams_d0 R²"
            value={
              <AnimatedR2Metric
                value={modelConfidenceR2}
                delay={COUNT_UP_STAGGER_MS * 3}
              />
            }
          />
        </dl>
      </div>
    </section>
  );
}
