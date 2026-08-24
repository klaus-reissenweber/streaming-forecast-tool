import type { Metadata } from "next";
import Link from "next/link";
import {
  emptyAdResultsSummary,
  formatAdResultsSummaryCompact,
  hasAdResults,
  type AdResultsSummary,
} from "@/lib/ad-results-summary";
import { releaseKeyFromTrackName } from "@/lib/ad-upload/canonical";
import { formatReleaseDate } from "@/lib/format";
import { loadAdResultsSummariesByReleaseKey } from "@/lib/load-ad-results-summaries";
import {
  loadReleaseList,
  type ReleaseListItem,
} from "@/lib/load-release-list";

export const metadata: Metadata = {
  title: "Ad results",
  description: "Pick a release to enter or upload partner ad results.",
};

export default async function AdsPage() {
  const releases = await loadReleaseList();
  const summaries = await loadAdResultsSummariesByReleaseKey(
    releases.map((row) => releaseKeyFromTrackName(row.trackName)),
  );
  const rows = releases.map((row) => ({
    ...row,
    adSummary:
      summaries.get(releaseKeyFromTrackName(row.trackName)) ??
      emptyAdResultsSummary(),
  }));
  const active = rows.filter((row) => row.status === "active");
  const closed = rows.filter((row) => row.status === "closed");

  return (
    <main className="mx-auto max-w-6xl px-5 py-8">
      <header className="border-b border-border pb-4">
        <h1 className="text-release-title font-semibold text-foreground">
          Ad results
        </h1>
      </header>

      <ReleaseGroup title="Active" rows={active} />
      <ReleaseGroup title="Archive" rows={closed} />
    </main>
  );
}

type AdsReleaseRow = ReleaseListItem & { adSummary: AdResultsSummary };

function ReleaseGroup({
  title,
  rows,
}: {
  title: string;
  rows: AdsReleaseRow[];
}) {
  return (
    <section className="mt-8" aria-label={title}>
      <h2 className="text-section font-semibold text-foreground">{title}</h2>
      {rows.length === 0 ? (
        <p className="mt-3 text-body-sm text-secondary">No releases.</p>
      ) : (
        <ul className="mt-3 divide-y divide-border-subtle overflow-hidden rounded-instrument border border-border bg-surface">
          {rows.map((row) => {
            const entered = hasAdResults(row.adSummary);
            return (
              <li key={row.id}>
                <Link
                  href={`/release/${row.id}/ad-upload`}
                  className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-canvas"
                >
                  <span className="min-w-0">
                    <span className="font-medium text-foreground">
                      {row.trackName}
                    </span>
                    <span className="text-secondary"> · {row.artistName}</span>
                    <span className="mt-0.5 block text-caption text-secondary">
                      {row.releaseDate
                        ? formatReleaseDate(row.releaseDate)
                        : "—"}
                    </span>
                  </span>
                  <span
                    className={
                      "shrink-0 text-right text-caption " +
                      (entered ? "text-secondary" : "text-secondary")
                    }
                  >
                    {entered
                      ? formatAdResultsSummaryCompact(row.adSummary)
                      : "No results yet"}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
