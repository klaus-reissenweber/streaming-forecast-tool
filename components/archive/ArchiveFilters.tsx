"use client";

import { useRouter } from "next/navigation";
import { GENRES } from "@/lib/constants";
import type { ArchiveSortOption } from "@/lib/build-archive-view-model";
import type { Genre } from "@/lib/forecast";

export interface ArchiveFiltersProps {
  currentGenre?: Genre;
  currentSort: ArchiveSortOption;
}

const SORT_OPTIONS: { value: ArchiveSortOption; label: string }[] = [
  { value: "closed_at_desc", label: "Closed (newest)" },
  { value: "closed_at_asc", label: "Closed (oldest)" },
  { value: "release_date_desc", label: "Release date (newest)" },
  { value: "release_date_asc", label: "Release date (oldest)" },
  { value: "streams_delta_pct_desc", label: "Δ streams (best first)" },
  { value: "streams_delta_pct_asc", label: "Δ streams (worst first)" },
];

function buildQuery(
  genre: Genre | undefined,
  sort: ArchiveSortOption,
): string {
  const params = new URLSearchParams();
  if (genre) {
    params.set("genre", genre);
  }
  if (sort !== "closed_at_desc") {
    params.set("sort", sort);
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}

function formatGenreLabel(genre: Genre): string {
  return genre
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

const selectClass =
  "w-full cursor-pointer rounded-instrument border border-border bg-surface px-2.5 py-1.5 text-sm text-foreground md:w-auto md:min-w-[11rem]";

export function ArchiveFilters({
  currentGenre,
  currentSort,
}: ArchiveFiltersProps) {
  const router = useRouter();

  function navigate(genre: Genre | undefined, sort: ArchiveSortOption) {
    router.push(`/archive${buildQuery(genre, sort)}`);
  }

  return (
    <div
      className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center md:gap-x-4 md:gap-y-2"
      aria-label="Archive filters"
    >
      <label className="flex w-full flex-col gap-1.5 md:w-auto md:flex-row md:items-center md:gap-2">
        <span className="text-label text-foreground">Genre</span>
        <select
          className={selectClass}
          value={currentGenre ?? ""}
          onChange={(event) => {
            const value = event.target.value;
            navigate(value ? (value as Genre) : undefined, currentSort);
          }}
        >
          <option value="">All</option>
          {GENRES.map((genre) => (
            <option key={genre} value={genre}>
              {formatGenreLabel(genre)}
            </option>
          ))}
        </select>
      </label>

      <label className="flex w-full flex-col gap-1.5 md:w-auto md:flex-row md:items-center md:gap-2">
        <span className="text-label text-foreground">Sort</span>
        <select
          className={selectClass}
          value={currentSort}
          onChange={(event) => {
            navigate(currentGenre, event.target.value as ArchiveSortOption);
          }}
        >
          {SORT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
