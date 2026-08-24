import type { Metadata } from "next";
import Link from "next/link";
import {
  loadAdReportsList,
  reportInternalPath,
} from "@/lib/ad-report/load";
import { formatLockTimestamp } from "@/lib/format";

export const metadata: Metadata = {
  title: "Reports",
  description: "Generated performance snapshots for internal review.",
};

export default async function ReportsPage() {
  const reports = await loadAdReportsList().catch(() => []);

  return (
    <main className="mx-auto max-w-6xl px-5 py-8">
      <header className="border-b border-border pb-4">
        <h1 className="text-release-title font-semibold text-foreground">
          Reports
        </h1>
        <p className="mt-1 text-body-sm text-secondary">
          Shareable snapshots. Public report links stay single-column — no
          sidebar.
        </p>
      </header>

      {reports.length === 0 ? (
        <p className="mt-6 text-body-sm text-secondary">
          No reports yet. Generate one from a release page.
        </p>
      ) : (
        <ul className="mt-6 divide-y divide-border-subtle overflow-hidden rounded-instrument border border-border bg-surface">
          {reports.map((report) => {
            const track =
              report.metricsSnapshot.release?.trackName ?? report.title;
            const artist = report.metricsSnapshot.release?.artistName;
            return (
              <li key={report.id}>
                <Link
                  href={reportInternalPath(report.slug)}
                  className="flex items-baseline justify-between gap-3 px-4 py-3 hover:bg-canvas"
                >
                  <span>
                    <span className="font-medium text-foreground">{track}</span>
                    {artist ? (
                      <span className="text-secondary"> · {artist}</span>
                    ) : null}
                  </span>
                  <span className="shrink-0 text-caption text-secondary">
                    {formatLockTimestamp(report.updatedAt)}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
