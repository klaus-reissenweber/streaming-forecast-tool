import type { SupabaseClient } from "@supabase/supabase-js";
import type { DailyDayInput } from "@/lib/validate-daily-day";

export interface PersistDailyDataError {
  message: string;
  code?: string | null;
}

function toPersistError(error: {
  message?: string;
  code?: string | null;
}): PersistDailyDataError {
  return {
    message: error.message ?? "Could not save daily data.",
    code: error.code ?? null,
  };
}

/** Upserts one daily_data row on (release_id, day_number). */
export async function upsertDailyDayRow(
  supabase: SupabaseClient,
  releaseId: string,
  row: DailyDayInput,
): Promise<{ error: PersistDailyDataError | null }> {
  // recorded_at is per daily_data row (this day only), not a release-level timestamp.
  // A future "last updated" indicator for the release should use
  // max(recorded_at) across all daily_data rows for release_id, not any single row.
  const { error } = await supabase.from("daily_data").upsert(
    {
      release_id: releaseId,
      day_number: row.day_number,
      streams: row.streams,
      saves: row.saves,
      other_pct: row.other_pct,
      recorded_at: new Date().toISOString(),
    },
    { onConflict: "release_id,day_number" },
  );

  if (error) {
    return { error: toPersistError(error) };
  }

  return { error: null };
}

/** Upserts many daily_data rows for one release. Days omitted from the batch are unchanged. */
export async function bulkUpsertDailyRows(
  supabase: SupabaseClient,
  releaseId: string,
  rows: DailyDayInput[],
): Promise<{ error: PersistDailyDataError | null; rowCount: number }> {
  if (rows.length === 0) {
    return { error: null, rowCount: 0 };
  }

  const payload = rows.map((row) => ({
    release_id: releaseId,
    day_number: row.day_number,
    streams: row.streams,
    saves: row.saves,
    other_pct: row.other_pct,
    // Same per-row semantics as upsertDailyDayRow; bulk does not set one release-wide time.
    recorded_at: new Date().toISOString(),
  }));

  const { error } = await supabase
    .from("daily_data")
    .upsert(payload, { onConflict: "release_id,day_number" });

  if (error) {
    return { error: toPersistError(error), rowCount: 0 };
  }

  return { error: null, rowCount: rows.length };
}

/** Deletes one daily_data row for a release/day. No-op if the row does not exist. */
export async function deleteDailyDayRow(
  supabase: SupabaseClient,
  releaseId: string,
  dayNumber: number,
): Promise<{ error: PersistDailyDataError | null }> {
  const { error } = await supabase
    .from("daily_data")
    .delete()
    .eq("release_id", releaseId)
    .eq("day_number", dayNumber);

  if (error) {
    return { error: toPersistError(error) };
  }

  return { error: null };
}
