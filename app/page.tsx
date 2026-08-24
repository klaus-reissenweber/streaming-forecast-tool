import type { Metadata } from "next";
import { DashboardSummaryBar } from "@/components/dashboard/DashboardSummaryBar";
import { DashboardTable } from "@/components/dashboard/DashboardTable";
import { buildDashboardViewModel } from "@/lib/build-dashboard-view-model";
import { loadActiveModel } from "@/lib/load-active-model";
import { loadActiveReleasesWithDailyData } from "@/lib/load-active-releases";
import { logActiveModelSource } from "@/lib/model/forecast-model";

export const metadata: Metadata = {
  title: "Active releases",
  description:
    "At-a-glance health monitoring across all active release campaigns.",
};

export default async function HomePage() {
  const [{ releases, dailyDataByReleaseId }, model] = await Promise.all([
    loadActiveReleasesWithDailyData(),
    loadActiveModel(),
  ]);
  logActiveModelSource(model, "dashboard");

  const viewModel = buildDashboardViewModel(
    releases,
    dailyDataByReleaseId,
    model,
  );

  return (
    <main className="mx-auto max-w-6xl px-5 py-8">
      <header className="border-b border-border pb-4">
        <h1 className="text-release-title font-semibold text-foreground">
          Active releases
        </h1>
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
