"use client";

import { useEffect, useState } from "react";
import { RETRAIN_MIN_SAMPLE_SIZE } from "@/lib/constants";
import { useCountUp } from "@/lib/hooks/use-count-up";

export interface RetrainProgressProps {
  closedReleaseCount: number;
}

function easeOutExpo(progress: number): number {
  return progress >= 1 ? 1 : 1 - Math.pow(2, -10 * progress);
}

function getMotionDurationChartMs(): number {
  if (typeof window === "undefined") {
    return 600;
  }

  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue("--motion-duration-chart")
    .trim();

  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : 600;
}

export function RetrainProgress({ closedReleaseCount }: RetrainProgressProps) {
  const threshold = RETRAIN_MIN_SAMPLE_SIZE;
  const progress = Math.min(closedReleaseCount / threshold, 1);
  const remaining = Math.max(0, threshold - closedReleaseCount);
  const isEligible = closedReleaseCount >= threshold;

  const animatedCount = useCountUp(closedReleaseCount);
  const [barProgress, setBarProgress] = useState(0);

  useEffect(() => {
    const durationMs = getMotionDurationChartMs();
    if (durationMs === 0) {
      setBarProgress(progress);
      return;
    }

    let rafId = 0;
    let startTime: number | null = null;

    const animate = (timestamp: number) => {
      if (startTime === null) {
        startTime = timestamp;
      }

      const elapsed = timestamp - startTime;
      const t = Math.min(elapsed / durationMs, 1);
      setBarProgress(progress * easeOutExpo(t));

      if (t < 1) {
        rafId = requestAnimationFrame(animate);
      } else {
        setBarProgress(progress);
      }
    };

    rafId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(rafId);
    };
  }, [progress]);

  return (
    <section
      className="motion-fade-up rounded-instrument border border-border bg-surface p-5"
      aria-label="Retrain progress"
    >
      <h2 className="font-serif text-section font-semibold text-foreground">
        <span className="bracket-tag bracket-tag--accent bracket-tag--section instrument-section-title">
          [RETRAIN]
        </span>
      </h2>

      <div className="mt-4 flex items-center gap-4">
        <div
          className="h-2 min-w-0 flex-1 overflow-hidden rounded-tag bg-canvas"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={threshold}
          aria-valuenow={closedReleaseCount}
          aria-label="Closed releases toward retrain threshold"
        >
          <div
            className={
              "h-full rounded-tag " +
              (isEligible ? "bg-semantic-positive" : "bg-accent")
            }
            style={{ width: `${barProgress * 100}%` }}
          />
        </div>
        <p className="shrink-0 font-mono text-sm tabular-nums text-foreground">
          {Math.round(animatedCount)} / {threshold}
        </p>
      </div>

      {isEligible ? (
        <p className="mt-2 text-body-sm text-secondary">
          <span className="bracket-tag bracket-tag--positive mr-1.5 align-middle">
            [ELIGIBLE]
          </span>
          <span className="align-middle">
            Run retrain manually via retrain/retrain.py
          </span>
        </p>
      ) : (
        <p className="mt-2 text-body-sm text-secondary">
          {remaining} more closed release{remaining === 1 ? "" : "s"} needed for
          next retrain
        </p>
      )}
    </section>
  );
}
