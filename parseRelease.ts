// lib/parseRelease.ts
// Pure parse + validation for the intern import page. No DB, no React, no model math.
// Mirrors the logic in the preview artifact so behavior is identical.

import type { ParseDailyDataResult } from "@/lib/parse-daily-data";

export const GENRES = [
  "dubstep",
  "house",
  "melodic-bass",
  "downtempo",
  "big-room",
] as const;
export type Genre = (typeof GENRES)[number];

export interface ReleaseMeta {
  track_name: string;
  artist_name: string;
  genre: string;
  monthly_listeners: string | number;
  is_feature: boolean;
  editorial_tier: number;
  release_date: string;
}

export type { DailyRow, ParseDailyDataResult, ParseResult } from "@/lib/parse-daily-data";
export { parseDailyData } from "@/lib/parse-daily-data";

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
  parsed: ParseDailyDataResult,
  forceClosed: boolean,
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
      (Date.now() - new Date(meta.release_date + "T00:00:00").getTime()) /
        86400000,
    );
  }

  const eligible = validDays >= 7 && daysSince !== null && daysSince >= 28;
  const closed = forceClosed || eligible;

  if (!eligible && !forceClosed) {
    const reasons: string[] = [];
    if (validDays < 7) reasons.push(`only ${validDays} day(s) entered (need ≥7)`);
    if (daysSince !== null && daysSince < 28)
      reasons.push(`released ${daysSince} day(s) ago (need ≥28)`);
    warnings.push(
      `Will be saved as ACTIVE, not closed. ${reasons.join(
        " and ",
      )}. The retrain script only trains on closed releases.`,
    );
  }
  if (forceClosed && !eligible)
    warnings.push(
      "Forcing CLOSED before the 28-day window. Verify before retraining.",
    );

  const wk1Streams = parsed.rows
    .filter((row) => row.day_number >= 1 && row.day_number <= 7)
    .reduce(
      (sum, row) =>
        sum + (Number.isFinite(row.streams) ? row.streams : 0),
      0,
    );

  return { errors, warnings, closed, validDays, daysSince, wk1Streams };
}
