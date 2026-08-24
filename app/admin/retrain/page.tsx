import type { Metadata } from "next";
import { RetrainProgress } from "@/components/archive/RetrainProgress";
import { canRetrain } from "@/lib/auth/retrain-allowed";
import { requireAllowedUser } from "@/lib/auth/require-allowed-user";
import { buildArchiveViewModel } from "@/lib/build-archive-view-model";
import { loadActiveModel } from "@/lib/load-active-model";
import { loadClosedReleasesWithDailyData } from "@/lib/load-closed-releases";
import { loadLastRetrainAt } from "@/lib/load-last-retrain-at";
import { loadLatestRetrainJob } from "@/lib/load-retrain-job";
import { formatActiveModelSource, logActiveModelSource } from "@/lib/model/forecast-model";

export const metadata: Metadata = {
  title: "Retrain",
  description: "Enqueue a draft model retrain from closed week-1 releases.",
};

export default async function RetrainPage() {
  const [
    { releases, dailyDataByReleaseId },
    lastRetrainAt,
    model,
    latestJob,
    auth,
  ] = await Promise.all([
    loadClosedReleasesWithDailyData(),
    loadLastRetrainAt(),
    loadActiveModel(),
    loadLatestRetrainJob(),
    requireAllowedUser(),
  ]);
  logActiveModelSource(model, "retrain");

  const viewModel = buildArchiveViewModel(
    releases,
    dailyDataByReleaseId,
    model,
    { lastRetrainAt },
  );

  const canEnqueue = auth.ok && canRetrain(auth.user.email);

  return (
    <main className="mx-auto max-w-6xl px-5 py-8">
      <header className="border-b border-border pb-4">
        <h1 className="text-release-title font-semibold text-foreground">
          Retrain
        </h1>
      </header>

      <div className="mt-6">
        {!auth.ok ? (
          <p className="text-body-sm text-secondary">{auth.error}</p>
        ) : (
          <RetrainProgress
            progressCount={viewModel.summary.retrainProgressCount}
            lastRetrainAt={viewModel.summary.lastRetrainAt}
            initialJob={latestJob}
            canEnqueue={canEnqueue}
          />
        )}
      </div>

      {auth.ok ? (
        <details className="mt-8 rounded-instrument border border-border bg-surface p-5">
          <summary className="cursor-pointer text-section font-semibold text-foreground">
            Details
          </summary>
          <p className="mt-3 text-sm text-secondary">
            Active model{" "}
            <span className="text-foreground">
              {formatActiveModelSource(model)}
            </span>
          </p>
        </details>
      ) : null}
    </main>
  );
}
