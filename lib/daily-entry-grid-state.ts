import type { DailyDataPoint } from "@/lib/map-release-row";

export interface DayGridFields {
  streams: string;
  saves: string;
  other_pct: string;
}

export type DayGridState = DayGridFields[];

export type DayFieldKey = keyof DayGridFields;

export function buildInitialDayGrid(dailyData: DailyDataPoint[]): DayGridState {
  const byDay = new Map(dailyData.map((row) => [row.day_number, row]));

  return Array.from({ length: 28 }, (_, index) => {
    const dayNumber = index + 1;
    const row = byDay.get(dayNumber);

    return {
      streams: row?.streams != null ? String(row.streams) : "",
      saves: row?.saves != null ? String(row.saves) : "",
      other_pct: row?.other_pct != null ? String(row.other_pct) : "",
    };
  });
}

export function dayFieldsFromGrid(
  grid: DayGridState,
  dayNumber: number,
): DayGridFields {
  return grid[dayNumber - 1] ?? { streams: "", saves: "", other_pct: "" };
}
