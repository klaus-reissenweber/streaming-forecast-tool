import {
  DAILY_DATA_SELECT_COLUMNS,
  DailyDataRowParseError,
  parseDailyDataRow,
  parseReleaseRow,
  RELEASE_SELECT_COLUMNS,
  ReleaseRowParseError,
  type DailyDataPoint,
  type DailyDataRow,
  type ReleaseRecord,
  type ReleaseRow,
} from "@/lib/map-release-row";
import { createClient } from "@/lib/supabase/server";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidReleaseId(id: string): boolean {
  return UUID_RE.test(id);
}

/**
 * Loads a single release by UUID.
 * Returns null when the id is malformed or no row exists.
 * Throws on Supabase errors or corrupt row data (`ReleaseRowParseError`).
 */
export async function loadRelease(id: string): Promise<ReleaseRecord | null> {
  if (!isValidReleaseId(id)) {
    return null;
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("releases")
    .select(RELEASE_SELECT_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(`releases: ${error.message}`);
  }

  if (!data) {
    return null;
  }

  return parseReleaseRow(data as unknown as ReleaseRow);
}

/**
 * Loads all daily_data rows for a release, ordered by day_number ascending.
 * Returns an empty array when none exist.
 * Throws on Supabase errors or corrupt row data (`DailyDataRowParseError`).
 */
export async function loadDailyData(
  releaseId: string,
): Promise<DailyDataPoint[]> {
  if (!isValidReleaseId(releaseId)) {
    return [];
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("daily_data")
    .select(DAILY_DATA_SELECT_COLUMNS)
    .eq("release_id", releaseId)
    .order("day_number", { ascending: true });

  if (error) {
    throw new Error(`daily_data: ${error.message}`);
  }

  const rows = (data ?? []) as unknown as DailyDataRow[];
  return rows.map((row) => parseDailyDataRow(row));
}

export { ReleaseRowParseError, DailyDataRowParseError };
