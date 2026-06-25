import type { Metadata } from "next";
import Link from "next/link";
import { DashboardSummaryBar } from "@/components/dashboard/DashboardSummaryBar";
import { DashboardTable } from "@/components/dashboard/DashboardTable";
import { buildDashboardViewModel } from "@/lib/build-dashboard-view-model";
import { loadActiveReleasesWithDailyData } from "@/lib/load-active-releases";

export const metadata: Metadata = {
  title: "Active releases",
  description:
    "At-a-glance health monitoring across all active release campaigns.",
};

export default async function HomePage() {
  const { releases, dailyDataByReleaseId } =
    await loadActiveReleasesWithDailyData();

  const viewModel = buildDashboardViewModel(releases, dailyDataByReleaseId);

  const totalActive = viewModel.summary.totalActive;
  const activeReleaseLabel = `${totalActive} active release${totalActive === 1 ? "" : "s"}`;
  const metaLine = `${activeReleaseLabel} · monitoring window D1–D28`;

  return (
    <main className="mx-auto max-w-6xl px-5 py-8">
      <header className="border-b border-border pb-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="font-serif text-release-title font-semibold text-foreground">
              <span className="bracket-tag bracket-tag--positive bracket-tag--page instrument-section-title mr-2 align-middle">
                [ACTIVE]
              </span>
              <span className="align-middle">Active releases</span>
            </h1>
            <p className="mt-1 text-body-sm text-secondary">{metaLine}</p>
          </div>

          <nav className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 text-sm font-medium">
            <Link
              href="/archive"
              className="text-accent-readable hover:text-accent-hover hover:underline"
            >
              Archive
            </Link>
            <Link
              href="/new"
              className="text-accent-readable hover:text-accent-hover hover:underline"
            >
              Create release
            </Link>
          </nav>
        </div>
      </header>

      <div className="mt-6">
        <DashboardSummaryBar summary={viewModel.summary} />
      </div>

      <div className="mt-8">
        <DashboardTable viewModel={viewModel} />
      </div>
    </main>
  );
}
