"use client";

import type { DayFieldKey, DayGridState } from "@/lib/daily-entry-grid-state";

const DAYS = Array.from({ length: 28 }, (_, index) => index + 1);

const ROWS: { key: DayFieldKey; label: string }[] = [
  { key: "streams", label: "Streams" },
  { key: "saves", label: "Saves" },
  { key: "other_pct", label: "Other %" },
];

export type DaySaveStatus = "idle" | "pending" | "saving" | "saved" | "error";

export interface DaySaveState {
  status: DaySaveStatus;
  message?: string;
}

export interface DailyEntryGridProps {
  grid: DayGridState;
  readOnly?: boolean;
  dayStatus?: Record<number, DaySaveState>;
  onCellChange: (day: number, field: DayFieldKey, value: string) => void;
  onDayBlur: (day: number) => void;
}

function cellClassName(status: DaySaveStatus | undefined, readOnly: boolean): string {
  const base =
    "w-14 rounded border px-1.5 py-1 text-center font-mono text-xs tabular-nums " +
    (readOnly
      ? "cursor-default border-border bg-canvas-subtle text-muted placeholder:text-muted/50"
      : "border-border bg-surface text-foreground placeholder:text-muted/50 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent");

  if (status === "error") {
    return `${base} border-semantic-negative ring-1 ring-semantic-negative/20`;
  }
  if (status === "saved") {
    return `${base} border-semantic-positive`;
  }
  if (status === "pending" || status === "saving") {
    return `${base} border-semantic-warning`;
  }

  return base;
}

export function DailyEntryGrid({
  grid,
  readOnly = false,
  dayStatus = {},
  onCellChange,
  onDayBlur,
}: DailyEntryGridProps) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full border-collapse text-sm">
        <thead>
          <tr>
            <th
              scope="col"
              className="sticky left-0 z-10 border-b border-border bg-surface px-2 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted"
            >
              Metric
            </th>
            {DAYS.map((day) => (
              <th
                key={day}
                scope="col"
                className="border-b border-border px-1 py-2 text-center font-mono text-[11px] font-medium uppercase tracking-[0.06em] text-muted"
              >
                D{day}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ROWS.map((row) => (
            <tr key={row.key} className="border-b border-border-subtle last:border-b-0">
              <th
                scope="row"
                className="sticky left-0 z-10 bg-surface px-2 py-2 text-left text-xs font-medium text-secondary"
              >
                {row.label}
              </th>
              {DAYS.map((day) => {
                const status = dayStatus[day]?.status;
                const value = grid[day - 1]?.[row.key] ?? "";

                return (
                  <td key={day} className="px-1 py-1.5">
                    <input
                      type="text"
                      inputMode={row.key === "other_pct" ? "decimal" : "numeric"}
                      disabled={readOnly}
                      readOnly={readOnly}
                      value={value}
                      aria-label={`${row.label} day ${day}`}
                      aria-invalid={status === "error"}
                      placeholder="..."
                      className={cellClassName(status, readOnly)}
                      onChange={(event) =>
                        onCellChange(day, row.key, event.target.value)
                      }
                      onBlur={() => onDayBlur(day)}
                    />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
