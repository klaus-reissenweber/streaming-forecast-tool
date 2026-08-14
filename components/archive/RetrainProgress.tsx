"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { enqueueRetrainJob } from "@/app/archive/actions";
import { SectionHeader } from "@/components/layout/SectionHeader";
import { StatusPill, type PillTone } from "@/components/ui/StatusPill";
import { RETRAIN_THRESHOLD } from "@/lib/constants";
import { useCountUp } from "@/lib/hooks/use-count-up";
import type { RetrainJobSummary } from "@/lib/load-retrain-job";

export interface RetrainProgressProps {
  /** Eligible releases closed after last retrain (numerator). */
  progressCount: number;
  /** Configurable denominator (defaults to RETRAIN_THRESHOLD). */
  threshold?: number;
  /** ISO last-retrain cutoff shown for operator context. */
  lastRetrainAt?: string | null;
  /** Latest job for chip + polling (Phase 2a). */
  initialJob?: RetrainJobSummary | null;
  /** Whether the signed-in user may enqueue. */
  canEnqueue?: boolean;
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

function formatCutoff(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function statusTone(status: RetrainJobSummary["status"]): PillTone {
  switch (status) {
    case "queued":
      return "neutral";
    case "running":
      return "accent";
    case "completed":
      return "positive";
    case "failed":
      return "warning";
  }
}

export function RetrainProgress({
  progressCount,
  threshold = RETRAIN_THRESHOLD,
  lastRetrainAt = null,
  initialJob = null,
  canEnqueue = false,
}: RetrainProgressProps) {
  const progress = Math.min(progressCount / threshold, 1);
  const remaining = Math.max(0, threshold - progressCount);
  const isEligible = progressCount >= threshold;

  const animatedCount = useCountUp(progressCount);
  const [barProgress, setBarProgress] = useState(0);
  const [job, setJob] = useState<RetrainJobSummary | null>(initialJob);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

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

  // Poll while job is in flight.
  useEffect(() => {
    if (!job || (job.status !== "queued" && job.status !== "running")) {
      return;
    }

    let cancelled = false;
    const tick = async () => {
      try {
        const res = await fetch(`/api/retrain-jobs/${job.id}`, {
          cache: "no-store",
        });
        if (!res.ok) {
          return;
        }
        const next = (await res.json()) as RetrainJobSummary | null;
        if (!cancelled && next) {
          setJob(next);
        }
      } catch {
        // ignore transient poll errors
      }
    };

    const id = window.setInterval(tick, 3000);
    void tick();
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [job]);

  const onEnqueue = () => {
    setActionError(null);
    startTransition(async () => {
      const result = await enqueueRetrainJob();
      if (!result.success) {
        setActionError(result.error);
        return;
      }
      setJob({
        id: result.jobId,
        status: "queued",
        createdAt: new Date().toISOString(),
        startedAt: null,
        completedAt: null,
        draftModelId: null,
        error: null,
        triggeredEmail: null,
      });
    });
  };

  const inflight =
    job?.status === "queued" || job?.status === "running" ? job : null;

  return (
    <section
      className="motion-fade-up rounded-instrument border border-border bg-surface p-5"
      aria-label="Retrain progress"
    >
      <SectionHeader>Retrain</SectionHeader>

      <div className="mt-4 flex items-center gap-4">
        <div
          className="h-2 min-w-0 flex-1 overflow-hidden rounded-tag bg-canvas"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={threshold}
          aria-valuenow={progressCount}
          aria-label="Eligible releases closed since last retrain"
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
        <p className="mt-2 flex flex-wrap items-baseline gap-1.5 text-body-sm text-secondary">
          <StatusPill tone="positive">Eligible</StatusPill>
          <span className="align-middle">
            Enough new closes — retrain a draft model when ready.
          </span>
        </p>
      ) : (
        <p className="mt-2 text-body-sm text-secondary">
          {remaining} more eligible release{remaining === 1 ? "" : "s"} closed
          since last retrain
          {lastRetrainAt ? ` (${formatCutoff(lastRetrainAt)})` : ""}
        </p>
      )}

      {inflight ? (
        <div
          className="mt-4 rounded-instrument border border-accent-border bg-accent-tint px-4 py-3"
          data-testid="retrain-pending"
        >
          <p className="text-body-sm font-medium text-foreground">
            Retrain in progress
          </p>
          <p className="mt-1 text-body-sm text-secondary">
            Job is {job?.status}. This can take up to 30 minutes — the worker
            claims queued jobs about every 30 minutes. Leave this page open or
            come back later; you&apos;ll get a draft to review when it finishes.
          </p>
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {canEnqueue ? (
          <button
            type="button"
            onClick={onEnqueue}
            disabled={isPending || inflight != null}
            className="rounded-tag border border-border bg-canvas px-3 py-1.5 text-sm font-medium text-foreground hover:border-accent disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? "Retrain started…" : "Retrain"}
          </button>
        ) : null}

        {job ? (
          <p className="text-body-sm text-secondary" data-testid="retrain-job-chip">
            <StatusPill tone={statusTone(job.status)}>
              {job.status}
            </StatusPill>
            <span className="align-middle font-mono text-xs">
              {job.id.slice(0, 8)}
            </span>
            {job.status === "completed" && job.draftModelId ? (
              <>
                {" · "}
                <Link
                  href={`/admin/retrain/approve/${job.draftModelId}`}
                  className="text-accent-readable hover:underline"
                >
                  Review draft
                </Link>
              </>
            ) : null}
            {job.status === "failed" && job.error ? (
              <span className="ml-2 text-semantic-negative">{job.error}</span>
            ) : null}
          </p>
        ) : null}
      </div>

      {actionError ? (
        <p className="mt-2 text-body-sm text-semantic-negative">{actionError}</p>
      ) : null}
    </section>
  );
}
