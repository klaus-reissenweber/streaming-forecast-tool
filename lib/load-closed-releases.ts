import type { Genre } from "@/lib/forecast";
import {
  DAILY_DATA_SELECT_COLUMNS,
  parseDailyDataRow,
  parseReleaseRow,
  RELEASE_SELECT_COLUMNS,
  type DailyDataPoint,
  type DailyDataRow,
  type ReleaseRecord,
  type ReleaseRow,
} from "@/lib/map-release-row";
import { createClient } from "@/lib/supabase/server";

export interface LoadClosedReleasesOptions {
  /** When set, only closed releases for this genre are returned. */
  genre?: Genre;
}

export interface ClosedReleasesBundle {
  releases: ReleaseRecord[];
  dailyDataByReleaseId: Map<string, DailyDataPoint[]>;
}

function groupDailyDataByReleaseId(
  rows: DailyDataPoint[],
): Map<string, DailyDataPoint[]> {
  const map = new Map<string, DailyDataPoint[]>();

  for (const row of rows) {
    const existing = map.get(row.release_id);
    if (existing) {
      existing.push(row);
    } else {
      map.set(row.release_id, [row]);
    }
  }

  for (const days of map.values()) {
    days.sort((a, b) => a.day_number - b.day_number);
  }

  return map;
}

/**
 * Loads all closed releases and their daily_data in two batched queries.
 * Default DB order: closed_at descending, then created_at descending.
 */
export async function loadClosedReleasesWithDailyData(
  options?: LoadClosedReleasesOptions,
): Promise<ClosedReleasesBundle> {
  const supabase = await createClient();

  let query = supabase
    .from("releases")
    .select(RELEASE_SELECT_COLUMNS)
    .eq("status", "closed")
    .order("closed_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (options?.genre) {
    query = query.eq("genre", options.genre);
  }

  const { data: releaseRows, error: releaseError } = await query;

  if (releaseError) {
    throw new Error(`releases: ${releaseError.message}`);
  }

  const releases = (releaseRows ?? []).map((row) =>
    parseReleaseRow(row as unknown as ReleaseRow),
  );

  if (releases.length === 0) {
    return { releases: [], dailyDataByReleaseId: new Map() };
  }

  const releaseIds = releases.map((release) => release.id);
  const { data: dailyRows, error: dailyError } = await supabase
    .from("daily_data")
    .select(DAILY_DATA_SELECT_COLUMNS)
    .in("release_id", releaseIds)
    .order("day_number", { ascending: true });

  if (dailyError) {
    throw new Error(`daily_data: ${dailyError.message}`);
  }

  const parsedDaily = (dailyRows ?? []).map((row) =>
    parseDailyDataRow(row as unknown as DailyDataRow),
  );

  return {
    releases,
    dailyDataByReleaseId: groupDailyDataByReleaseId(parsedDaily),
  };
}
