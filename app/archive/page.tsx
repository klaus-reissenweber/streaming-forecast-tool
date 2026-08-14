import type { Metadata } from "next";
import { ArchiveFilters } from "@/components/archive/ArchiveFilters";
import { ArchiveTable } from "@/components/archive/ArchiveTable";
import { ArchiveSummaryBar } from "@/components/archive/ArchiveSummaryBar";
import {
  buildArchiveViewModel,
  type ArchiveRow,
  type ArchiveSortOption,
} from "@/lib/build-archive-view-model";
import { GENRES } from "@/lib/constants";
import { formatReleaseDate } from "@/lib/format";
import type { Genre } from "@/lib/forecast";
import { loadActiveModel } from "@/lib/load-active-model";
import { loadClosedReleasesWithDailyData } from "@/lib/load-closed-releases";
import { loadLastRetrainAt } from "@/lib/load-last-retrain-at";
import { logActiveModelSource } from "@/lib/model/forecast-model";

export const metadata: Metadata = {
  title: "Release archive",
  description: "Closed releases with forecast vs actual week-1 performance.",
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

  const [
    { releases, dailyDataByReleaseId },
    lastRetrainAt,
    model,
  ] = await Promise.all([
    loadClosedReleasesWithDailyData({ genre }),
    loadLastRetrainAt(),
    loadActiveModel(),
  ]);
  logActiveModelSource(model, "archive");

  const viewModel = buildArchiveViewModel(
    releases,
    dailyDataByReleaseId,
    model,
    {
      sort,
      lastRetrainAt,
    },
  );

  const dateRange = formatArchiveDateRange(viewModel.rows);

  return (
    <main className="mx-auto max-w-6xl px-5 py-8">
      <header className="border-b border-border pb-4">
        <h1 className="font-serif text-release-title font-semibold text-foreground">
          Release archive
        </h1>
        {dateRange ? (
          <p className="mt-1 text-sm text-muted">{dateRange}</p>
        ) : null}
      </header>

      <div className="mt-6">
        <ArchiveSummaryBar summary={viewModel.summary} />
        <div className="mt-4">
          <ArchiveFilters currentGenre={genre} currentSort={sort} />
        </div>
      </div>

      <div className="mt-6">
        <ArchiveTable viewModel={viewModel} />
      </div>
    </main>
  );
}
