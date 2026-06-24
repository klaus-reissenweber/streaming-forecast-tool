import type { Metadata } from "next";
import Link from "next/link";
import { ArchiveFilters, ArchiveTable } from "@/components/archive/ArchiveTable";
import { ArchiveSummaryBar } from "@/components/archive/ArchiveSummaryBar";
import {
  buildArchiveViewModel,
  type ArchiveSortOption,
} from "@/lib/build-archive-view-model";
import { GENRES } from "@/lib/constants";
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

  return (
    <main className="mx-auto max-w-6xl px-5 py-8">
      <header className="border-b border-stone-200 pb-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-stone-900">
              Release archive
            </h1>
            <p className="mt-1 text-sm text-stone-500">
              Closed releases · locked forecast vs actual week-1 performance
            </p>
          </div>
          <Link
            href="/new"
            className="text-sm font-medium text-orange-700 hover:text-orange-800 hover:underline"
          >
            Create release
          </Link>
        </div>
      </header>

      <div className="mt-6 space-y-6">
        <ArchiveSummaryBar summary={viewModel.summary} />
        <ArchiveFilters currentGenre={genre} currentSort={sort} />
        <ArchiveTable viewModel={viewModel} />
      </div>
    </main>
  );
}
