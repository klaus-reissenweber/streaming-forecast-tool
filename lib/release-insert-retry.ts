/** Columns the PGRST204 retry must never strip. */
export const PROTECTED_SONGSTATS_RELEASE_COLUMNS = [
  "inputs_version",
  "songstats_artist_id",
  "songstats_track_id",
  "isrc",
  "ml_captured_at",
  "followers_at_release",
  "popularity_at_release",
  "label",
  "forecast_artist_source",
] as const;

const OPTIONAL_AD_SPEND_COLUMNS = [
  "meta_traffic_spend_planned",
  "meta_awareness_spend_planned",
  "spotify_marquee_spend_planned",
  "spotify_showcase_spend_planned",
] as const;

export const SONGSTATS_SCHEMA_REQUIRED_ERROR =
  "Songstats lock columns are missing from the database schema cache. Apply migrations/songstats_create_form.sql and run NOTIFY pgrst, 'reload schema'; then try again.";

export function pgrst204MissingColumn(
  message: string | null | undefined,
): string | null {
  if (!message) return null;
  const match = message.match(
    /Could not find the '([^']+)' column of 'releases' in the schema cache/i,
  );
  return match?.[1] ?? null;
}

export function isProtectedSongstatsReleaseColumn(column: string): boolean {
  return (PROTECTED_SONGSTATS_RELEASE_COLUMNS as readonly string[]).includes(
    column,
  );
}

/**
 * Ad-spend columns may be omitted on PGRST204. Songstats columns may not.
 * If a retry would drop a protected column, fail instead.
 */
export function rowForPgrst204Retry<T extends object>(
  row: T,
  error: { code?: string | null; message?: string | null },
): { ok: true; row: T } | { ok: false; error: string } {
  const missing = pgrst204MissingColumn(error.message);
  if (missing && isProtectedSongstatsReleaseColumn(missing)) {
    return { ok: false, error: SONGSTATS_SCHEMA_REQUIRED_ERROR };
  }

  const next = { ...row } as T & Record<string, unknown>;
  for (const column of OPTIONAL_AD_SPEND_COLUMNS) {
    delete next[column];
  }

  for (const column of PROTECTED_SONGSTATS_RELEASE_COLUMNS) {
    if (
      Object.prototype.hasOwnProperty.call(row, column) &&
      !Object.prototype.hasOwnProperty.call(next, column)
    ) {
      return { ok: false, error: SONGSTATS_SCHEMA_REQUIRED_ERROR };
    }
  }

  return { ok: true, row: next };
}
