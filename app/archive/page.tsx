import type { Metadata } from "next";
import Link from "next/link";
import { ArchiveFilters, ArchiveTable } from "@/components/archive/ArchiveTable";
import { ArchiveSummaryBar } from "@/components/archive/ArchiveSummaryBar";
import { RetrainProgress } from "@/components/archive/RetrainProgress";
import {
  buildArchiveViewModel,
  type ArchiveRow,
  type ArchiveSortOption,
} from "@/lib/build-archive-view-model";
import { GENRES } from "@/lib/constants";
import { formatReleaseDate } from "@/lib/format";
import type { Genre } from "@/lib/forecast";
import { loadClosedReleasesWithDailyData } from "@/lib/load-closed-releases";

export const metadata: Metadata = {
  title: "Release archive",
  description: "Closed releases with locked forecast vs actual week-1 performance.",
};

const SORT_OPTIONS: ArchiveSortOption[] = [
  "closed_at_desc",
  "closed_at_asc",
  "release_date_desc",
  "release_date_asc",
  "streams_delta_pct_desc",
  "streams_delta_pct_asc",
];

function parseGenreFilter(value: string | undefined): Genre | undefined {
  if (!value) {
    return undefined;
  }
  return GENRES.includes(value as Genre) ? (value as Genre) : undefined;
}

function parseSortOption(value: string | undefined): ArchiveSortOption {
  if (value && SORT_OPTIONS.includes(value as ArchiveSortOption)) {
    return value as ArchiveSortOption;
  }
  return "closed_at_desc";
}

function formatArchiveDateRange(rows: ArchiveRow[]): string | null {
  if (rows.length === 0) {
    return null;
  }

  const dates = rows
    .map((row) => row.releaseDate)
    .filter(Boolean)
    .sort();

  if (dates.length === 0) {
    return null;
  }

  const earliest = formatReleaseDate(dates[0]);
  const latest = formatReleaseDate(dates[dates.length - 1]);

  return earliest === latest ? earliest : `${earliest} – ${latest}`;
}

interface ArchivePageProps {
  searchParams: Promise<{ genre?: string; sort?: string }>;
}

export default async function ArchivePage({ searchParams }: ArchivePageProps) {
  const params = await searchParams;
  const genre = parseGenreFilter(params.genre);
  const sort = parseSortOption(params.sort);

  const { releases, dailyDataByReleaseId } =
    await loadClosedReleasesWithDailyData({ genre });

  const viewModel = buildArchiveViewModel(releases, dailyDataByReleaseId, {
    sort,
  });

  const closedReleaseCount = viewModel.summary.totalClosed;
  const dateRange = formatArchiveDateRange(viewModel.rows);
  const closedReleaseLabel = `${closedReleaseCount} closed release${closedReleaseCount === 1 ? "" : "s"}`;
  const archiveMetaLine = dateRange
    ? `${closedReleaseLabel} · ${dateRange}`
    : closedReleaseLabel;

  return (
    <main className="mx-auto max-w-6xl px-5 py-8">
      <header className="border-b border-border pb-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="font-serif text-release-title font-semibold text-foreground">
              Release archive
            </h1>
            <p className="mt-1 text-body-sm text-secondary">{archiveMetaLine}</p>
          </div>
          <nav className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 text-sm font-medium">
            <Link
              href="/"
              className="text-accent-readable hover:text-accent-hover hover:underline"
            >
              Active releases
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
        <RetrainProgress closedReleaseCount={viewModel.summary.totalClosed} />

        <div className="mt-6">
          <ArchiveSummaryBar summary={viewModel.summary} />
          <div className="mt-4">
            <ArchiveFilters currentGenre={genre} currentSort={sort} />
          </div>
        </div>

        <div className="mt-6">
          <ArchiveTable viewModel={viewModel} />
        </div>
      </div>
    </main>
  );
}
