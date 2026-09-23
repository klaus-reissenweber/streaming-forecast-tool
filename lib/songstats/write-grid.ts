import type { SupabaseClient } from "@supabase/supabase-js";
import type { DerivedDay } from "@/lib/songstats/derive-daily-grid";

/**
 * Unique identity for a daily_data day.
 * Live name from 202506240001_initial_schema_baseline.sql
 * (pg_catalog is not exposed over PostgREST).
 */
export const DAILY_DATA_UNIQUE_RELEASE_DAY =
  "daily_data_release_id_day_number_key";

export const ADD_DAILY_DATA_UNIQUE_RELEASE_DAY_SQL =
  "alter table public.daily_data add constraint daily_data_release_id_day_number_key unique (release_id, day_number);";

const MISSING_UNIQUE = /no unique or exclusion constraint/i;

type ExistingDay = {
  day_number: number;
  streams_source: string | null;
};

export type WriteGridOptions = {
  popularityByDay?: ReadonlyMap<number, number | null>;
};

function isWritableSource(source: string | null | undefined): boolean {
  return source == null || source === "" || source === "songstats";
}

function patchForDay(
  day: DerivedDay,
  popularity: number | null | undefined,
): {
  streams_songstats: number | null;
  popularity_songstats: number | null;
  songstats_quality: string;
  streams_source: "songstats";
} {
  return {
    streams_songstats: day.streams,
    popularity_songstats: popularity ?? null,
    songstats_quality: day.quality,
    streams_source: "songstats",
  };
}

/**
 * Writes derived Songstats columns only.
 * Never updates daily_data.streams. Inserts new days with streams = null.
 */
export async function writeDerivedGrid(
  supabase: SupabaseClient,
  releaseId: string,
  grid: readonly DerivedDay[],
  options?: WriteGridOptions,
): Promise<void> {
  const { data, error } = await supabase
    .from("daily_data")
    .select("day_number, streams_source")
    .eq("release_id", releaseId);
  if (error) {
    throw new Error(`daily_data: ${error.message}`);
  }

  const existing = new Map<number, ExistingDay>();
  for (const row of data ?? []) {
    existing.set(row.day_number, {
      day_number: row.day_number,
      streams_source: row.streams_source ?? null,
    });
  }

  for (const day of grid) {
    const current = existing.get(day.dayNumber);
    const popularity = options?.popularityByDay?.get(day.dayNumber) ?? null;
    const patch = patchForDay(day, popularity);

    if (!current) {
      const { error: insertError } = await supabase.from("daily_data").insert({
        release_id: releaseId,
        day_number: day.dayNumber,
        streams: null,
        saves: null,
        ...patch,
      });
      if (insertError) {
        if (MISSING_UNIQUE.test(insertError.message)) {
          throw new Error(
            `daily_data has no unique (release_id, day_number). Apply:\n${ADD_DAILY_DATA_UNIQUE_RELEASE_DAY_SQL}`,
          );
        }
        throw new Error(
          `daily_data insert day ${day.dayNumber}: ${insertError.message}`,
        );
      }
      continue;
    }

    if (!isWritableSource(current.streams_source)) {
      continue;
    }

    const { error: updateError } = await supabase
      .from("daily_data")
      .update(patch)
      .eq("release_id", releaseId)
      .eq("day_number", day.dayNumber);
    if (updateError) {
      throw new Error(
        `daily_data update day ${day.dayNumber}: ${updateError.message}`,
      );
    }
  }
}
