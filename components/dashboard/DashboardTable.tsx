"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import type {
  DashboardRow,
  DashboardViewModel,
} from "@/lib/build-dashboard-view-model";
import type { DeltaTone } from "@/lib/build-archive-view-model";
import type { FlagType } from "@/lib/flags";
import { formatCompactNumber, formatPercent } from "@/lib/format";
import type { HealthStatus } from "@/lib/monitoring";

const HEALTH_STATUS_CONFIG: Record<
  HealthStatus,
  { tag: string; tagClass: string }
> = {
  "on-track": {
    tag: "[ON TRACK]",
    tagClass: "bracket-tag--neutral",
  },
  outperforming: {
    tag: "[OUTPERFORMING]",
    tagClass: "bracket-tag--positive",
  },
  lagging: {
    tag: "[LAGGING]",
    tagClass: "bracket-tag--negative",
  },
  awaiting: {
    tag: "[AWAITING]",
    tagClass: "bracket-tag--neutral",
  },
};

const FLAG_BADGE_CLASS: Record<FlagType, string> = {
  warning: "bg-semantic-warning-bg text-semantic-warning",
  info: "bg-semantic-info-bg text-semantic-info",
  positive: "bg-semantic-positive-bg text-semantic-positive",
};

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

function formatSignedPercent(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${formatPercent(value, 0)}`;
}

function formatDayIntoCampaign(day: number | null): string {
  if (day == null) {
    return "—";
  }
  return `D${day}`;
}

function formatProjectedWk1Cell(row: DashboardRow): ReactNode {
  const deltaClass = deltaToneClass(row.projectedDeltaTone);

  return (
    <span className="inline-flex flex-col items-start gap-0.5">
      <span className="font-mono tabular-nums text-foreground">
        {formatCompactNumber(row.projectedWk1)}
      </span>
      <span className={`font-mono text-[11px] tabular-nums ${deltaClass}`}>
        vs {formatCompactNumber(row.lockedWk1)} locked
        {row.healthStatus !== "awaiting" ? (
          <>
            <span className="text-muted"> · </span>
            {formatSignedPercent(row.projectedDeltaPct)}
          </>
        ) : null}
      </span>
    </span>
  );
}

function formatFlagCountCell(
  count: number,
  mostSevereType: FlagType | null,
): ReactNode {
  if (count === 0) {
    return <span className="text-muted">—</span>;
  }

  const badgeClass =
    mostSevereType != null
      ? FLAG_BADGE_CLASS[mostSevereType]
      : "bg-canvas text-secondary";

  return (
    <span
      className={`inline-flex min-w-[1.5rem] items-center justify-center rounded-full px-2 py-0.5 font-mono text-[10px] font-semibold tabular-nums ${badgeClass}`}
    >
      {count}
    </span>
  );
}

function DashboardTableRow({ row }: { row: DashboardRow }) {
  const router = useRouter();
  const healthConfig = HEALTH_STATUS_CONFIG[row.healthStatus];

  return (
    <tr
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
      <td className="px-4 py-3">
        <Link
          href={row.detailHref}
          className="block font-serif text-sm font-semibold text-foreground hover:text-accent-readable hover:underline"
          onClick={(event) => event.stopPropagation()}
        >
          {row.trackName}
        </Link>
        <p className="text-secondary">{row.artistName}</p>
      </td>
      <td className="px-4 py-3 font-mono tabular-nums text-secondary">
        {formatDayIntoCampaign(row.dayIntoCampaign)}
      </td>
      <td className="px-4 py-3">
        <span className={`bracket-tag ${healthConfig.tagClass}`}>
          {healthConfig.tag}
        </span>
      </td>
      <td className="px-4 py-3">{formatProjectedWk1Cell(row)}</td>
      <td className="px-4 py-3">
        {formatFlagCountCell(row.flagCount, row.mostSevereFlagType)}
      </td>
      <td className="px-4 py-3">
        <p className="text-[11px] text-secondary">{row.genreDisplay}</p>
        <p className="text-[11px] text-muted">{row.editorialTierDisplay}</p>
      </td>
    </tr>
  );
}

export interface DashboardTableProps {
  viewModel: DashboardViewModel;
}

export function DashboardTable({ viewModel }: DashboardTableProps) {
  const { rows } = viewModel;

  return (
    <section
      className="motion-fade-up overflow-hidden rounded-instrument border border-border bg-surface"
      aria-label="Active releases"
    >
      <div className="p-5">
        <h2 className="font-serif text-section font-semibold text-foreground">
          <span className="bracket-tag bracket-tag--accent bracket-tag--section instrument-section-title">
            [RELEASES]
          </span>
        </h2>
      </div>

      {rows.length === 0 ? (
        <div className="mx-5 mb-5 border border-dashed border-border bg-canvas px-4 py-12 text-center text-body-sm text-muted">
          <p>No active releases. Create one to begin monitoring.</p>
          <Link
            href="/new"
            className="mt-3 inline-block text-sm font-medium text-accent-readable hover:text-accent-hover hover:underline"
          >
            Create release
          </Link>
        </div>
      ) : (
        <div className="overflow-x-auto border-t border-border-subtle">
          <table className="min-w-[880px] w-full text-left text-body-sm">
            <thead className="border-b border-border-subtle bg-canvas text-label text-muted">
              <tr>
                <th className="px-4 py-3 font-medium uppercase tracking-[0.06em]">
                  Release
                </th>
                <th className="px-4 py-3 font-medium uppercase tracking-[0.06em]">
                  Day
                </th>
                <th className="px-4 py-3 font-medium uppercase tracking-[0.06em]">
                  Health
                </th>
                <th className="px-4 py-3 font-medium uppercase tracking-[0.06em]">
                  Projected wk1
                </th>
                <th className="px-4 py-3 font-medium uppercase tracking-[0.06em]">
                  Flags
                </th>
                <th className="px-4 py-3 font-medium uppercase tracking-[0.06em]">
                  Genre · Tier
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle bg-surface">
              {rows.map((row) => (
                <DashboardTableRow key={row.id} row={row} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
