"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { SectionHeader } from "@/components/layout/SectionHeader";
import { StatusPill, type PillTone } from "@/components/ui/StatusPill";
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
  { label: string; tone: PillTone }
> = {
  "on-track": {
    label: "On track",
    tone: "neutral",
  },
  outperforming: {
    label: "Outperforming",
    tone: "positive",
  },
  lagging: {
    label: "Lagging",
    tone: "negative",
  },
  awaiting: {
    label: "Awaiting",
    tone: "neutral",
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
      return "text-secondary";
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
      <span className="tabular-nums text-foreground">
        {formatCompactNumber(row.projectedWk1)}
      </span>
      <span className={`text-[11px] tabular-nums ${deltaClass}`}>
        vs {formatCompactNumber(row.lockedWk1)} forecast
        {row.healthStatus !== "awaiting" ? (
          <>
            <span className="text-secondary"> · </span>
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
    return <span className="text-secondary">—</span>;
  }

  const badgeClass =
    mostSevereType != null
      ? FLAG_BADGE_CLASS[mostSevereType]
      : "bg-canvas text-secondary";

  return (
    <span
      className={`inline-flex min-w-[1.5rem] items-center justify-center rounded-full px-2 py-0.5 text-[10px] font-semibold tabular-nums ${badgeClass}`}
    >
      {count}
    </span>
  );
}

function DashboardReleaseCard({ row }: { row: DashboardRow }) {
  const healthConfig = HEALTH_STATUS_CONFIG[row.healthStatus];

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

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="text-sm tabular-nums text-secondary">
          {formatDayIntoCampaign(row.dayIntoCampaign)}
        </span>
        <StatusPill tone={healthConfig.tone}>{healthConfig.label}</StatusPill>
        <span className="inline-flex items-center gap-1.5 text-caption text-secondary">
          Flags {formatFlagCountCell(row.flagCount, row.mostSevereFlagType)}
        </span>
      </div>

      <div className="mt-2">{formatProjectedWk1Cell(row)}</div>
    </Link>
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
          className="block text-sm font-semibold text-foreground hover:text-accent-readable hover:underline"
          onClick={(event) => event.stopPropagation()}
        >
          {row.trackName}
        </Link>
        <p className="text-secondary">{row.artistName}</p>
      </td>
      <td className="px-4 py-3 tabular-nums text-secondary">
        {formatDayIntoCampaign(row.dayIntoCampaign)}
      </td>
      <td className="px-4 py-3">
        <StatusPill tone={healthConfig.tone}>{healthConfig.label}</StatusPill>
      </td>
      <td className="px-4 py-3">{formatProjectedWk1Cell(row)}</td>
      <td className="px-4 py-3">
        {formatFlagCountCell(row.flagCount, row.mostSevereFlagType)}
      </td>
      <td className="px-4 py-3">
        <p className="text-[11px] text-secondary">{row.genreDisplay}</p>
        <p className="text-[11px] text-secondary">{row.editorialTierDisplay}</p>
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
        <SectionHeader>Releases</SectionHeader>
      </div>

      {rows.length === 0 ? (
        <div className="mx-5 mb-5 border border-dashed border-border bg-canvas px-4 py-12 text-center text-body-sm text-secondary">
          <p>No active releases. Create one to begin monitoring.</p>
          <Link
            href="/new"
            className="mt-3 inline-block text-sm font-medium text-accent-readable hover:text-accent-hover hover:underline"
          >
            Create release
          </Link>
        </div>
      ) : (
        <>
          <ul className="divide-y divide-border-subtle border-t border-border-subtle md:hidden">
            {rows.map((row) => (
              <li key={row.id}>
                <DashboardReleaseCard row={row} />
              </li>
            ))}
          </ul>
          <div className="hidden overflow-x-auto border-t border-border-subtle md:block">
          <table className="min-w-[880px] w-full text-left text-body-sm">
            <thead className="border-b border-border-subtle bg-canvas text-label text-foreground">
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
        </>
      )}
    </section>
  );
}
