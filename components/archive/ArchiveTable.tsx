"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { SectionHeader } from "@/components/layout/SectionHeader";
import type {
  ArchiveRow,
  ArchiveViewModel,
  DeltaTone,
} from "@/lib/build-archive-view-model";
import { NotAvailable } from "@/components/ui/NotAvailable";
import {
  formatCompactNumber,
  formatLockTimestamp,
  formatPercent,
} from "@/lib/format";
import {
  SAVE_RATE_BAND_LABEL,
  saveRateBandCaption,
  saveRateToneClass,
  streamBandCaption,
  type SaveRateVsBand,
} from "@/lib/save-rate-band-label";

function deltaToneClass(tone: DeltaTone | null): string {
  switch (tone) {
    case "outperform":
      return "text-semantic-positive";
    case "lagging":
      return "text-semantic-negative";
    case "on_track":
      return "text-secondary";
    default:
      return "text-secondary";
  }
}

function formatSignedPercent(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${formatPercent(value, 1)}`;
}

function forecastActualTitle(
  forecast: number,
  actual: number | null,
): string {
  const actualLabel =
    actual == null ? "Not available" : formatCompactNumber(actual);
  return `${formatCompactNumber(forecast)} forecast → ${actualLabel} actual`;
}

function streamsDeltaCell(row: ArchiveRow): ReactNode {
  if (row.streamsDeltaPct == null) {
    return <NotAvailable />;
  }

  const vsBand = row.streamsVsBand;
  return (
    <span
      className={`tabular-nums ${saveRateToneClass(vsBand)}`}
    >
      {formatSignedPercent(row.streamsDeltaPct)}
      {vsBand != null ? (
        <span className="font-sans">
          {` · ${SAVE_RATE_BAND_LABEL[vsBand]}`}
        </span>
      ) : null}
    </span>
  );
}

function streamsDeltaTitle(row: ArchiveRow): string {
  const forecastActual = forecastActualTitle(
    row.lockedStreams,
    row.actualStreams,
  );
  if (row.streamsVsBand == null) {
    return forecastActual;
  }
  return `${forecastActual} · ${streamBandCaption(row.streamsVsBand, row.expectedStreamRange)}`;
}

function formatDeltaPctCell(
  deltaPct: number | null,
  tone: DeltaTone | null,
): ReactNode {
  if (deltaPct == null) {
    return <NotAvailable />;
  }

  return (
    <span className={`tabular-nums ${deltaToneClass(tone)}`}>
      {formatSignedPercent(deltaPct)}
    </span>
  );
}

function saveRateCell(
  actualSaveRate: number | null,
  vsBand: SaveRateVsBand | null,
): ReactNode {
  if (actualSaveRate == null || vsBand == null) {
    return <NotAvailable />;
  }

  return (
    <span
      className={`tabular-nums ${saveRateToneClass(vsBand)}`}
    >
      {formatPercent(actualSaveRate, 1)}
    </span>
  );
}

function saveRateTitle(
  vsBand: SaveRateVsBand | null,
  band: { lo: number; hi: number },
): string {
  if (vsBand == null) {
    return `Expected ${band.lo}–${band.hi}%`;
  }
  return saveRateBandCaption(vsBand, band);
}

const NUM =
  "py-2 text-right text-[13px] tabular-nums whitespace-nowrap";

function ArchiveReleaseCard({ row }: { row: ArchiveRow }) {
  return (
    <Link
      href={row.detailHref}
      aria-label={`${row.trackName} by ${row.artistName}`}
      className="block px-4 py-3.5 hover:bg-canvas"
    >
      <p className="line-clamp-2 font-semibold text-foreground">
        {row.trackName}
      </p>
      <p className="truncate text-secondary">{row.artistName}</p>

      <p className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
        <span>
          <span className="text-secondary">Streams </span>
          {streamsDeltaCell(row)}
        </span>
        <span>
          <span className="text-secondary">Saves </span>
          {formatDeltaPctCell(row.savesDeltaPct, row.savesDeltaTone)}
        </span>
      </p>

      <p className="mt-1.5 text-caption">
        <span className="text-secondary">Save rate </span>
        {saveRateCell(row.actualSaveRate, row.saveRateVsBand)}
        <span className="text-secondary">
          {" · expected "}
          {row.saveRateBand.lo}–{row.saveRateBand.hi}%
        </span>
      </p>
      <p className="mt-0.5 text-caption text-secondary">
        Released {row.releaseDateDisplay}
        {" · Closed "}
        {row.closedAtDisplay ?? <NotAvailable />}
      </p>
    </Link>
  );
}

export interface ArchiveTableProps {
  viewModel: ArchiveViewModel;
}

export function ArchiveTable({ viewModel }: ArchiveTableProps) {
  const { rows } = viewModel;
  const router = useRouter();

  return (
    <section
      className="motion-fade-up min-w-0 overflow-hidden rounded-instrument border border-border bg-surface"
      aria-label="Closed Releases"
    >
      <div className="p-5">
        <SectionHeader>Releases</SectionHeader>
      </div>

      {rows.length === 0 ? (
        <p className="mx-5 mb-5 border border-dashed border-border bg-canvas px-4 py-12 text-center text-sm text-secondary">
          No closed releases yet. Releases appear here once marked closed in the
          database (auto-close on Day 28 arrives in step 8).
        </p>
      ) : (
        <>
          <ul className="divide-y divide-border-subtle border-t border-border-subtle md:hidden">
            {rows.map((row) => (
              <li key={row.id}>
                <ArchiveReleaseCard row={row} />
              </li>
            ))}
          </ul>
          <div className="hidden min-w-0 overflow-hidden border-t border-border-subtle md:block">
          <table className="w-full table-fixed text-left text-body-sm">
            <thead className="border-b border-border-subtle bg-canvas text-foreground">
              <tr>
                <th className="w-[28%] px-3 py-2 text-[10px] font-medium uppercase tracking-[0.04em]">
                  Release
                </th>
                <th className="w-[13%] px-2 py-2 text-right text-[10px] font-medium uppercase leading-tight tracking-[0.04em]">
                  <span className="block">Release</span>
                  <span className="block">date</span>
                </th>
                <th className="w-[13%] px-2 py-2 text-right text-[10px] font-medium uppercase leading-tight tracking-[0.04em]">
                  <span className="block">Actual</span>
                  <span className="block">streams</span>
                </th>
                <th className="w-[11%] px-2 py-2 text-right text-[10px] font-medium uppercase leading-tight tracking-[0.04em]">
                  <span className="block">Δ</span>
                  <span className="block">streams</span>
                </th>
                <th className="w-[11%] px-2 py-2 text-right text-[10px] font-medium uppercase leading-tight tracking-[0.04em]">
                  <span className="block">Δ</span>
                  <span className="block">saves</span>
                </th>
                <th className="w-[11%] px-2 py-2 text-right text-[10px] font-medium uppercase leading-tight tracking-[0.04em]">
                  <span className="block">Save</span>
                  <span className="block">rate</span>
                </th>
                <th className="w-[13%] px-3 py-2 text-right text-[10px] font-medium uppercase tracking-[0.04em]">
                  Closed
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle bg-surface">
              {rows.map((row) => (
                <tr
                  key={row.id}
                  className="cursor-pointer hover:bg-canvas"
                  onClick={() => router.push(row.detailHref)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      router.push(row.detailHref);
                    }
                  }}
                  tabIndex={0}
                  role="link"
                  aria-label={`${row.trackName} by ${row.artistName}`}
                >
                  <td className="min-w-0 px-3 py-2">
                    <p className="truncate font-semibold text-foreground">
                      {row.trackName}
                    </p>
                    <p className="truncate text-secondary">{row.artistName}</p>
                  </td>
                  <td className={`${NUM} px-2 text-secondary`}>
                    {row.releaseDateDisplay}
                  </td>
                  <td className={`${NUM} px-2 text-secondary`}>
                      {row.actualStreams != null ? (
                      formatCompactNumber(row.actualStreams)
                    ) : (
                      <NotAvailable />
                    )}
                  </td>
                  <td
                    className="px-2 py-2 text-right"
                    title={streamsDeltaTitle(row)}
                  >
                    {streamsDeltaCell(row)}
                  </td>
                  <td
                    className="px-2 py-2 text-right"
                    title={forecastActualTitle(
                      row.lockedSaves,
                      row.actualSaves,
                    )}
                  >
                    {formatDeltaPctCell(
                      row.savesDeltaPct,
                      row.savesDeltaTone,
                    )}
                  </td>
                  <td
                    className="px-2 py-2 text-right"
                    title={saveRateTitle(row.saveRateVsBand, row.saveRateBand)}
                  >
                    {saveRateCell(row.actualSaveRate, row.saveRateVsBand)}
                  </td>
                  <td
                    className={`${NUM} px-3 text-secondary`}
                    title={
                      row.closedAt
                        ? formatLockTimestamp(row.closedAt)
                        : undefined
                    }
                  >
                    {row.closedAtDisplay ?? <NotAvailable />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </>
      )}
    </section>
  );
}
