/** Parsed daily_data row from CSV / spreadsheet paste (no DB access). */

export interface DailyRow {
  day_number: number;
  streams: number;
  saves: number;
  other_pct: number | null;
}

export interface ParseDailyDataResult {
  rows: DailyRow[];
  issues: string[];
}

/** @deprecated Use ParseDailyDataResult */
export type ParseResult = ParseDailyDataResult;

export function parseDailyData(
  text: string,
  hasDayColumn: boolean,
): ParseDailyDataResult {
  const rows: DailyRow[] = [];
  const issues: string[] = [];
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  let autoDay = 0;
  lines.forEach((line, idx) => {
    const cells = line.split(/[,\t]|\s{2,}/).map((cell) => cell.trim());
    if (idx === 0 && cells[0] && Number.isNaN(Number(cells[0]))) {
      return;
    }
    autoDay += 1;

    let day: string;
    let streams: string;
    let saves: string;
    let other: string | undefined;
    if (hasDayColumn) {
      [day, streams, saves, other] = cells;
    } else {
      day = String(autoDay);
      [streams, saves, other] = cells;
    }

    const rowNo = idx + 1;
    const dayNumber = Number(day);
    const streamsValue = Number(streams);
    const savesValue = Number(saves);
    const otherPct =
      other === undefined || other === "" ? null : Number(other);

    if (!Number.isInteger(dayNumber) || dayNumber < 1 || dayNumber > 28) {
      issues.push(`Line ${rowNo}: day "${day}" must be a whole number 1–28.`);
    }
    if (
      !Number.isFinite(streamsValue) ||
      streamsValue < 0 ||
      !Number.isInteger(streamsValue)
    ) {
      issues.push(
        `Line ${rowNo}: streams "${streams}" must be a whole number ≥ 0.`,
      );
    }
    if (
      !Number.isFinite(savesValue) ||
      savesValue < 0 ||
      !Number.isInteger(savesValue)
    ) {
      issues.push(
        `Line ${rowNo}: saves "${saves}" must be a whole number ≥ 0.`,
      );
    }
    if (
      otherPct !== null &&
      (!Number.isFinite(otherPct) || otherPct < 0 || otherPct > 100)
    ) {
      issues.push(
        `Line ${rowNo}: Other% "${other}" must be between 0 and 100 (or blank).`,
      );
    }

    rows.push({
      day_number: dayNumber,
      streams: streamsValue,
      saves: savesValue,
      other_pct: otherPct,
    });
  });

  const seen = new Map<number, number>();
  for (const row of rows) {
    seen.set(row.day_number, (seen.get(row.day_number) ?? 0) + 1);
  }
  for (const [day, count] of seen.entries()) {
    if (count > 1) {
      issues.push(`Day ${day} appears more than once.`);
    }
  }

  rows.sort((a, b) => a.day_number - b.day_number);
  return { rows, issues };
}
