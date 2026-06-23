// lib/parseRelease.ts
// Pure parse + validation for the intern import page. No DB, no React, no model math.
// Mirrors the logic in the preview artifact so behavior is identical.

export const GENRES = ["dubstep", "house", "melodic-bass", "downtempo", "big-room"] as const;
export type Genre = (typeof GENRES)[number];

export interface ReleaseMeta {
  track_name: string;
  artist_name: string;
  genre: string;
  monthly_listeners: string | number;
  is_feature: boolean;
  editorial_tier: number;
  release_date: string; // yyyy-mm-dd
}

export interface DailyRow {
  day_number: number;
  streams: number;
  saves: number;
  other_pct: number | null;
}

export interface ParseResult {
  rows: DailyRow[];
  issues: string[];
}

export function parseDailyData(text: string, hasDayColumn: boolean): ParseResult {
  const rows: DailyRow[] = [];
  const issues: string[] = [];
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  let autoDay = 0;
  lines.forEach((line, idx) => {
    const cells = line.split(/[,\t]|\s{2,}/).map((c) => c.trim());
    // Skip a header row (first cell non-numeric, e.g. "Day").
    if (idx === 0 && cells[0] && isNaN(Number(cells[0]))) return;
    autoDay += 1;

    let day: string, streams: string, saves: string, other: string | undefined;
    if (hasDayColumn) {
      [day, streams, saves, other] = cells;
    } else {
      day = String(autoDay);
      [streams, saves, other] = cells;
    }

    const rowNo = idx + 1;
    const dn = Number(day);
    const st = Number(streams);
    const sv = Number(saves);
    const ot = other === undefined || other === "" ? null : Number(other);

    if (!Number.isInteger(dn) || dn < 1 || dn > 28)
      issues.push(`Line ${rowNo}: day "${day}" must be a whole number 1–28.`);
    if (!Number.isFinite(st) || st < 0 || !Number.isInteger(st))
      issues.push(`Line ${rowNo}: streams "${streams}" must be a whole number ≥ 0.`);
    if (!Number.isFinite(sv) || sv < 0 || !Number.isInteger(sv))
      issues.push(`Line ${rowNo}: saves "${saves}" must be a whole number ≥ 0.`);
    if (ot !== null && (!Number.isFinite(ot) || ot < 0 || ot > 100))
      issues.push(`Line ${rowNo}: Other% "${other}" must be between 0 and 100 (or blank).`);

    rows.push({ day_number: dn, streams: st, saves: sv, other_pct: ot });
  });

  const seen = new Map<number, number>();
  rows.forEach((r) => seen.set(r.day_number, (seen.get(r.day_number) || 0) + 1));
  [...seen.entries()]
    .filter(([, n]) => n > 1)
    .forEach(([d]) => issues.push(`Day ${d} appears more than once.`));

  rows.sort((a, b) => a.day_number - b.day_number);
  return { rows, issues };
}

export interface ValidationResult {
  errors: string[];
  warnings: string[];
  closed: boolean;
  validDays: number;
  daysSince: number | null;
  wk1Streams: number;
}

export function validateRelease(
  meta: ReleaseMeta,
  parsed: ParseResult,
  forceClosed: boolean
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!String(meta.track_name).trim()) errors.push("Track name is required.");
  if (!String(meta.artist_name).trim()) errors.push("Artist name is required.");
  if (!GENRES.includes(meta.genre as Genre)) errors.push("Pick a genre.");
  if (!meta.release_date) errors.push("Release date is required.");
  const ml = Number(meta.monthly_listeners);
  if (!Number.isFinite(ml) || ml <= 0)
    errors.push("Monthly listeners must be a number greater than 0.");

  errors.push(...parsed.issues);

  const validDays = parsed.rows.length;
  if (validDays === 0) errors.push("Add at least one day of data.");

  let daysSince: number | null = null;
  if (meta.release_date) {
    daysSince = Math.floor(
      (Date.now() - new Date(meta.release_date + "T00:00:00").getTime()) / 86400000
    );
  }

  // A release is training-eligible (per RETRAINING.md) when it has >=7 days of
  // data AND >=28 days have elapsed since release. Otherwise it stays "active".
  const eligible = validDays >= 7 && daysSince !== null && daysSince >= 28;
  const closed = forceClosed || eligible;

  if (!eligible && !forceClosed) {
    const reasons: string[] = [];
    if (validDays < 7) reasons.push(`only ${validDays} day(s) entered (need ≥7)`);
    if (daysSince !== null && daysSince < 28)
      reasons.push(`released ${daysSince} day(s) ago (need ≥28)`);
    warnings.push(
      `Will be saved as ACTIVE, not closed. ${reasons.join(
        " and "
      )}. The retrain script only trains on closed releases.`
    );
  }
  if (forceClosed && !eligible)
    warnings.push("Forcing CLOSED before the 28-day window. Verify before retraining.");

  const wk1Streams = parsed.rows
    .filter((r) => r.day_number >= 1 && r.day_number <= 7)
    .reduce((s, r) => s + (Number.isFinite(r.streams) ? r.streams : 0), 0);

  return { errors, warnings, closed, validDays, daysSince, wk1Streams };
}
