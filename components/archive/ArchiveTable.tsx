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

function filterPillClass(active: boolean): string {
  return (
    "rounded-full border px-3 py-1 text-xs font-medium transition " +
    (active
      ? "border-accent-border bg-accent-tint text-accent-readable"
      : "border-transparent bg-canvas text-secondary hover:border-border")
  );
}

export function ArchiveFilters({
  currentGenre,
  currentSort,
}: ArchiveFiltersProps) {
  return (
    <section
      className="motion-fade-up rounded-instrument border border-border bg-surface p-5"
      aria-label="Archive filters"
    >
      <h2 className="font-serif text-section font-semibold text-foreground">
        <span className="bracket-tag bracket-tag--accent bracket-tag--section instrument-section-title">
          [FILTERS]
        </span>
      </h2>

      <div className="mt-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-label text-muted">Genre</span>
          <Link
            href={`/archive${buildQuery(undefined, currentSort)}`}
            className={filterPillClass(currentGenre == null)}
          >
            All
          </Link>
          {GENRES.map((genre) => (
            <Link
              key={genre}
              href={`/archive${buildQuery(genre, currentSort)}`}
              className={filterPillClass(currentGenre === genre)}
            >
              {genre}
            </Link>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-label text-muted">Sort</span>
          {SORT_OPTIONS.map((option) => (
            <Link
              key={option.value}
              href={`/archive${buildQuery(currentGenre, option.value)}`}
              className={filterPillClass(currentSort === option.value)}
            >
              {option.label}
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

function deltaToneClass(tone: DeltaTone | null): string {
  switch (tone) {
    case "outperform":
      return "text-semantic-positive";
    case "lagging":
      return "text-semantic-negative";
    case "on_track":
      return "text-secondary";
    default:
      return "text-muted";
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
    return <span className="text-muted">n/a</span>;
  }

  return (
    <span className={`font-mono tabular-nums ${deltaToneClass(tone)}`}>
      {formatSignedCompact(delta)}
      <span className="text-muted"> · </span>
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
    return <span className="text-muted">n/a</span>;
  }

  let pillClass = "bg-canvas text-secondary";
  let label = "In band";

  if (vsBand === "below") {
    pillClass = "bg-semantic-warning-bg text-semantic-warning";
    label = "Below band";
  } else if (vsBand === "above") {
    pillClass = "bg-semantic-positive-bg text-semantic-positive";
    label = "Above band";
  }

  return (
    <span className="inline-flex flex-col items-start gap-0.5">
      <span
        className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${pillClass}`}
      >
        {label}
      </span>
      <span className="font-mono tabular-nums text-secondary">
        {formatPercent(actualSaveRate, 1)}
        <span className="text-muted">
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

  return (
    <section
      className="motion-fade-up overflow-hidden rounded-instrument border border-border bg-surface"
      aria-label="Closed releases"
    >
      <div className="p-5">
        <h2 className="font-serif text-section font-semibold text-foreground">
          <span className="bracket-tag bracket-tag--accent bracket-tag--section instrument-section-title">
            [RELEASES]
          </span>
        </h2>
      </div>

      {rows.length === 0 ? (
        <p className="mx-5 mb-5 border border-dashed border-border bg-canvas px-4 py-12 text-center text-body-sm text-muted">
          No closed releases yet. Releases appear here once marked closed in the
          database (auto-close on D28 arrives in step 8).
        </p>
      ) : (
        <div className="overflow-x-auto border-t border-border-subtle">
          <table className="min-w-[960px] w-full text-left text-body-sm">
            <thead className="border-b border-border-subtle bg-canvas text-label text-muted">
              <tr>
                <th className="px-4 py-3 font-medium uppercase tracking-[0.06em]">
                  Release
                </th>
                <th className="px-4 py-3 font-medium uppercase tracking-[0.06em]">
                  Genre
                </th>
                <th className="px-4 py-3 font-medium uppercase tracking-[0.06em]">
                  Released
                </th>
                <th className="px-4 py-3 font-medium uppercase tracking-[0.06em]">
                  Locked wk1
                </th>
                <th className="px-4 py-3 font-medium uppercase tracking-[0.06em]">
                  Actual wk1
                </th>
                <th className="px-4 py-3 font-medium uppercase tracking-[0.06em]">
                  Δ Streams
                </th>
                <th className="px-4 py-3 font-medium uppercase tracking-[0.06em]">
                  Δ Saves
                </th>
                <th className="px-4 py-3 font-medium uppercase tracking-[0.06em]">
                  Save rate
                </th>
                <th className="px-4 py-3 font-medium uppercase tracking-[0.06em]">
                  Closed
                </th>
                <th className="px-4 py-3 font-medium uppercase tracking-[0.06em]">
                  <span className="sr-only">View</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle bg-surface">
              {rows.map((row) => (
                <tr key={row.id} className="hover:bg-canvas">
                  <td className="px-4 py-3">
                    <Link
                      href={row.detailHref}
                      className="font-semibold text-foreground hover:text-accent-readable hover:underline"
                    >
                      {row.trackName}
                    </Link>
                    <p className="text-secondary">{row.artistName}</p>
                  </td>
                  <td className="px-4 py-3 text-secondary">{row.genre}</td>
                  <td className="px-4 py-3 font-mono tabular-nums text-secondary">
                    {row.releaseDateDisplay}
                  </td>
                  <td className="px-4 py-3 font-mono tabular-nums text-secondary">
                    {formatForecastCell(row.lockedStreams, row.lockedSaves)}
                  </td>
                  <td className="px-4 py-3 font-mono tabular-nums text-secondary">
                    {row.actualStreams != null && row.actualSaves != null ? (
                      <>
                        {formatForecastCell(row.actualStreams, row.actualSaves)}
                        {!row.wk1Complete ? (
                          <span className="mt-1 block font-sans text-[10px] font-semibold uppercase tracking-wide text-semantic-warning">
                            Incomplete wk1
                          </span>
                        ) : null}
                      </>
                    ) : (
                      <span className="text-muted">n/a</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {formatDeltaCell(
                      row.streamsDelta,
                      row.streamsDeltaPct,
                      row.streamsDeltaTone,
                    )}
                  </td>
                  <td className="px-4 py-3">
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
                  <td className="px-4 py-3 font-mono tabular-nums text-muted">
                    {row.closedAtDisplay ?? "n/a"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={row.detailHref}
                      className="text-sm font-medium text-accent-readable hover:text-accent-hover hover:underline"
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
