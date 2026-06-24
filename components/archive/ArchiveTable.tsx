import Link from "next/link";
import type { ReactNode } from "react";
import { GENRES } from "@/lib/constants";
import type {
  ArchiveSortOption,
  ArchiveViewModel,
  DeltaTone,
  SaveRateVsBand,
} from "@/lib/build-archive-view-model";
import { formatCompactNumber, formatPercent } from "@/lib/format";
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

export function ArchiveFilters({
  currentGenre,
  currentSort,
}: ArchiveFiltersProps) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-stone-500">
          Genre
        </span>
        <Link
          href={`/archive${buildQuery(undefined, currentSort)}`}
          className={
            "rounded-full px-3 py-1 text-xs font-medium " +
            (currentGenre == null
              ? "bg-stone-900 text-white"
              : "bg-stone-100 text-stone-700 hover:bg-stone-200")
          }
        >
          All
        </Link>
        {GENRES.map((genre) => (
          <Link
            key={genre}
            href={`/archive${buildQuery(genre, currentSort)}`}
            className={
              "rounded-full px-3 py-1 text-xs font-medium " +
              (currentGenre === genre
                ? "bg-stone-900 text-white"
                : "bg-stone-100 text-stone-700 hover:bg-stone-200")
            }
          >
            {genre}
          </Link>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-stone-500">
          Sort
        </span>
        {SORT_OPTIONS.map((option) => (
          <Link
            key={option.value}
            href={`/archive${buildQuery(currentGenre, option.value)}`}
            className={
              "rounded-full px-3 py-1 text-xs font-medium " +
              (currentSort === option.value
                ? "bg-orange-100 text-orange-900 ring-1 ring-orange-200"
                : "bg-stone-100 text-stone-700 hover:bg-stone-200")
            }
          >
            {option.label}
          </Link>
        ))}
      </div>
    </div>
  );
}

function deltaToneClass(tone: DeltaTone | null): string {
  switch (tone) {
    case "outperform":
      return "text-emerald-700";
    case "lagging":
      return "text-red-700";
    case "on_track":
      return "text-stone-700";
    default:
      return "text-stone-500";
  }
}

function formatSignedCompact(value: number): string {
  if (value > 0) {
    return `+${formatCompactNumber(value)}`;
  }
  if (value < 0) {
    return `-${formatCompactNumber(Math.abs(value))}`;
  }
  return formatCompactNumber(0);
}

function formatSignedPercent(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${formatPercent(value, 1)}`;
}

function formatForecastCell(streams: number, saves: number): string {
  return `${formatCompactNumber(streams)} / ${formatCompactNumber(saves)}`;
}

function formatDeltaCell(
  delta: number | null,
  deltaPct: number | null,
  tone: DeltaTone | null,
): ReactNode {
  if (delta == null || deltaPct == null) {
    return <span className="text-stone-400">n/a</span>;
  }

  return (
    <span className={deltaToneClass(tone)}>
      {formatSignedCompact(delta)}
      <span className="text-stone-400"> · </span>
      {formatSignedPercent(deltaPct)}
    </span>
  );
}

function saveRatePill(
  actualSaveRate: number | null,
  vsBand: SaveRateVsBand | null,
  band: { lo: number; hi: number },
): ReactNode {
  if (actualSaveRate == null || vsBand == null) {
    return <span className="text-stone-400">n/a</span>;
  }

  let pillClass = "bg-stone-100 text-stone-700";
  let label = "In band";

  if (vsBand === "below") {
    pillClass = "bg-amber-100 text-amber-900";
    label = "Below band";
  } else if (vsBand === "above") {
    pillClass = "bg-emerald-100 text-emerald-900";
    label = "Above band";
  }

  return (
    <span className="inline-flex flex-col items-start gap-0.5">
      <span
        className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${pillClass}`}
      >
        {label}
      </span>
      <span className="tabular-nums text-stone-700">
        {formatPercent(actualSaveRate, 1)}
        <span className="text-stone-400">
          {" "}
          (band {band.lo}–{band.hi}%)
        </span>
      </span>
    </span>
  );
}

export interface ArchiveTableProps {
  viewModel: ArchiveViewModel;
}

export function ArchiveTable({ viewModel }: ArchiveTableProps) {
  const { rows } = viewModel;

  if (rows.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-stone-200 bg-stone-50 px-4 py-12 text-center text-sm text-stone-500">
        No closed releases yet. Releases appear here once marked closed in the
        database (auto-close on D28 arrives in step 8).
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-stone-200">
      <table className="min-w-[960px] w-full text-left text-sm">
        <thead className="border-b border-stone-200 bg-stone-50 text-xs font-medium uppercase tracking-wide text-stone-500">
          <tr>
            <th className="px-4 py-3">Release</th>
            <th className="px-4 py-3">Genre</th>
            <th className="px-4 py-3">Released</th>
            <th className="px-4 py-3">Locked wk1</th>
            <th className="px-4 py-3">Actual wk1</th>
            <th className="px-4 py-3">Δ Streams</th>
            <th className="px-4 py-3">Δ Saves</th>
            <th className="px-4 py-3">Save rate</th>
            <th className="px-4 py-3">Closed</th>
            <th className="px-4 py-3">
              <span className="sr-only">View</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-stone-100 bg-white">
          {rows.map((row) => (
            <tr key={row.id} className="hover:bg-stone-50/80">
              <td className="px-4 py-3">
                <Link
                  href={row.detailHref}
                  className="font-semibold text-stone-900 hover:text-orange-800 hover:underline"
                >
                  {row.trackName}
                </Link>
                <p className="text-stone-500">{row.artistName}</p>
              </td>
              <td className="px-4 py-3 text-stone-700">{row.genre}</td>
              <td className="px-4 py-3 tabular-nums text-stone-700">
                {row.releaseDateDisplay}
              </td>
              <td className="px-4 py-3 tabular-nums text-stone-700">
                {formatForecastCell(row.lockedStreams, row.lockedSaves)}
              </td>
              <td className="px-4 py-3 tabular-nums text-stone-700">
                {row.actualStreams != null && row.actualSaves != null ? (
                  <>
                    {formatForecastCell(row.actualStreams, row.actualSaves)}
                    {!row.wk1Complete ? (
                      <span className="mt-1 block text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                        Incomplete wk1
                      </span>
                    ) : null}
                  </>
                ) : (
                  <span className="text-stone-400">n/a</span>
                )}
              </td>
              <td className="px-4 py-3 tabular-nums">
                {formatDeltaCell(
                  row.streamsDelta,
                  row.streamsDeltaPct,
                  row.streamsDeltaTone,
                )}
              </td>
              <td className="px-4 py-3 tabular-nums">
                {formatDeltaCell(
                  row.savesDelta,
                  row.savesDeltaPct,
                  row.savesDeltaTone,
                )}
              </td>
              <td className="px-4 py-3">
                {saveRatePill(
                  row.actualSaveRate,
                  row.saveRateVsBand,
                  row.saveRateBand,
                )}
              </td>
              <td className="px-4 py-3 tabular-nums text-stone-600">
                {row.closedAtDisplay ?? "n/a"}
              </td>
              <td className="px-4 py-3 text-right">
                <Link
                  href={row.detailHref}
                  className="text-sm font-medium text-orange-700 hover:text-orange-800 hover:underline"
                >
                  View
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
