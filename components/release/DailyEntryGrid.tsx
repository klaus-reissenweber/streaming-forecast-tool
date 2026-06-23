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
    "w-14 rounded border px-1.5 py-1 text-center text-xs tabular-nums " +
    (readOnly
      ? "border-stone-200 bg-stone-50 text-stone-400 placeholder:text-stone-300"
      : "border-stone-300 bg-white text-stone-900 placeholder:text-stone-300 focus:border-orange-600 focus:outline-none focus:ring-1 focus:ring-orange-600");

  if (status === "error") {
    return base + " border-red-400 ring-1 ring-red-200";
  }
  if (status === "saved") {
    return base + " border-emerald-300";
  }
  if (status === "pending" || status === "saving") {
    return base + " border-amber-300";
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
    <div className="mt-5 overflow-x-auto">
      <table className="min-w-full border-collapse text-sm">
        <thead>
          <tr>
            <th
              scope="col"
              className="sticky left-0 z-10 border-b border-stone-200 bg-white px-2 py-2 text-left text-xs font-semibold uppercase tracking-wide text-stone-500"
            >
              Metric
            </th>
            {DAYS.map((day) => (
              <th
                key={day}
                scope="col"
                className="border-b border-stone-200 px-1 py-2 text-center text-xs font-medium text-stone-500"
              >
                D{day}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ROWS.map((row) => (
            <tr key={row.key} className="border-b border-stone-100 last:border-b-0">
              <th
                scope="row"
                className="sticky left-0 z-10 bg-white px-2 py-2 text-left text-xs font-medium text-stone-700"
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
