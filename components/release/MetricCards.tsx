"use client";

import type { ReactNode } from "react";
import { SectionHeader } from "@/components/layout/SectionHeader";
import { useCountUp } from "@/lib/hooks/use-count-up";

export interface MetricCardsProps {
  saveVelocity: string | null;
  algoBandLabel: string | null;
  algoBandSublabel: string;
}

function AnimatedSaveVelocityMetric({
  display,
  delay,
}: {
  display: string;
  delay: number;
}) {
  const percentMatch = display.match(/^(\d+)%/);
  const percent = percentMatch ? Number(percentMatch[1]) : 0;
  const animated = useCountUp(percent, {
    delay,
    enabled: percentMatch != null,
  });

  if (percentMatch == null) {
    return <span>{display}</span>;
  }

  const suffix = display.slice(percentMatch[0].length);

  return (
    <span>
      {Math.round(animated)}%{suffix}
    </span>
  );
}

function MetricCell({
  label,
  value,
  sublabel,
}: {
  label: string;
  value: ReactNode;
  sublabel?: string;
}) {
  return (
    <div className="min-w-0 flex-1 border-t border-accent/40 px-4 py-3 sm:px-5 sm:py-4">
      <dt className="text-[10px] font-medium uppercase tracking-[0.06em] text-muted">
        {label}
      </dt>
      <dd className="mt-2 font-mono text-[2.25rem] font-semibold tabular-nums leading-none tracking-[-0.02em] text-foreground">
        {value}
      </dd>
      {sublabel ? (
        <p className="mt-1 text-caption text-muted">{sublabel}</p>
      ) : null}
    </div>
  );
}

export function MetricCards({
  saveVelocity,
  algoBandLabel,
  algoBandSublabel,
}: MetricCardsProps) {
  const showSaveVelocity = saveVelocity != null;
  const showAlgo = algoBandLabel != null;

  if (!showSaveVelocity && !showAlgo) {
    return null;
  }

  return (
    <section
      className="motion-fade-up"
      aria-label="Key metrics"
    >
      <SectionHeader>Metrics</SectionHeader>

      <div className="mt-4 overflow-hidden rounded-instrument border border-border bg-surface">
        <dl className="flex flex-col sm:flex-row sm:items-stretch sm:divide-x sm:divide-border-subtle">
          {showSaveVelocity ? (
            <MetricCell
              label="Save velocity"
              sublabel="Vs median week-1 saves for this artist size"
              value={
                <AnimatedSaveVelocityMetric
                  display={saveVelocity}
                  delay={0}
                />
              }
            />
          ) : null}

          {showAlgo ? (
            <MetricCell
              label="Algo positioning"
              sublabel={algoBandSublabel}
              value={algoBandLabel}
            />
          ) : null}
        </dl>
      </div>
    </section>
  );
}
