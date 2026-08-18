import type { SupabaseClient } from "@supabase/supabase-js";
import type { ReleaseArtistWriteRow } from "@/lib/release-artists";

export interface PersistReleaseArtistsError {
  message: string;
  code?: string | null;
}

function toPersistError(error: {
  message?: string;
  code?: string | null;
}): PersistReleaseArtistsError {
  return {
    message: error.message ?? "Could not save artist roster.",
    code: error.code ?? null,
  };
}

const RESTORE_SELECT =
  "id, release_id, artist_name, monthly_listeners, role, position";

/**
 * Replace the roster for one release.
 *
 * Writes ONLY `release_artists`. Never updates `releases` (including
 * artist_name, monthly_listeners, monthly_listeners_at_release, and
 * locked_forecast_*). Does not recompute or re-lock a forecast.
 */
export async function replaceReleaseArtists(
  supabase: SupabaseClient,
  releaseId: string,
  rows: readonly ReleaseArtistWriteRow[],
): Promise<{ error: PersistReleaseArtistsError | null }> {
  const { data: existing, error: loadError } = await supabase
    .from("release_artists")
    .select(RESTORE_SELECT)
    .eq("release_id", releaseId);

  if (loadError) {
    return { error: toPersistError(loadError) };
  }

  const snapshot = existing ?? [];

  const { error: deleteError } = await supabase
    .from("release_artists")
    .delete()
    .eq("release_id", releaseId);

  if (deleteError) {
    return { error: toPersistError(deleteError) };
  }

  const payload = rows.map((row) => ({
    release_id: releaseId,
    artist_name: row.artist_name,
    monthly_listeners: row.monthly_listeners,
    role: row.role,
    position: row.position,
  }));

  const { error: insertError } = await supabase
    .from("release_artists")
    .insert(payload);

  if (insertError) {
    if (snapshot.length > 0) {
      const restore = snapshot.map((row) => ({
        release_id: row.release_id,
        artist_name: row.artist_name,
        monthly_listeners: row.monthly_listeners,
        role: row.role,
        position: row.position,
      }));
      const { error: restoreError } = await supabase
        .from("release_artists")
        .insert(restore);
      if (restoreError) {
        return {
          error: {
            message:
              "Could not save artist roster, and restoring the previous roster failed. Reload and try again.",
            code: restoreError.code ?? insertError.code ?? null,
          },
        };
      }
    }
    return { error: toPersistError(insertError) };
  }

  return { error: null };
}
