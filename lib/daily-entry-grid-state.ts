import type { DailyDataPoint } from "@/lib/map-release-row";

export interface DayGridFields {
  streams: string;
  saves: string;
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
    };
  });
}

export function dayFieldsFromGrid(
  grid: DayGridState,
  dayNumber: number,
): DayGridFields {
  return grid[dayNumber - 1] ?? { streams: "", saves: "" };
}
