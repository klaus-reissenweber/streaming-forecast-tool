import {
  isArtistRole,
  sortReleaseArtists,
  type ReleaseArtist,
} from "@/lib/release-artists";
import { createClient } from "@/lib/supabase/server";

const SELECT_COLUMNS =
  "id, release_id, artist_name, monthly_listeners, role, position";

function isMissingTableError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("release_artists") &&
    (lower.includes("does not exist") ||
      lower.includes("schema cache") ||
      lower.includes("could not find"))
  );
}

function parseRow(row: Record<string, unknown>): ReleaseArtist | null {
  const id = typeof row.id === "string" ? row.id : null;
  const releaseId =
    typeof row.release_id === "string" ? row.release_id : null;
  const name =
    typeof row.artist_name === "string" ? row.artist_name.trim() : "";
  const role = typeof row.role === "string" ? row.role : "";
  const position = Number(row.position);
  if (!id || !releaseId || !name || !isArtistRole(role)) {
    return null;
  }
  if (!Number.isInteger(position) || position < 1 || position > 4) {
    return null;
  }
  const rawMl = row.monthly_listeners;
  let monthlyListeners: number | null = null;
  if (rawMl != null && rawMl !== "") {
    const n = typeof rawMl === "number" ? rawMl : Number(rawMl);
    monthlyListeners = Number.isFinite(n) ? n : null;
  }
  return {
    id,
    release_id: releaseId,
    artist_name: name,
    monthly_listeners: monthlyListeners,
    role,
    position,
  };
}

/**
 * Loads the artist roster for one release, ordered by position.
 * Returns [] when the table is not migrated yet or no rows exist.
 */
export async function loadReleaseArtists(
  releaseId: string,
): Promise<ReleaseArtist[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("release_artists")
    .select(SELECT_COLUMNS)
    .eq("release_id", releaseId)
    .order("position", { ascending: true });

  if (error) {
    if (isMissingTableError(error.message)) {
      return [];
    }
    throw new Error(`release_artists: ${error.message}`);
  }

  return sortReleaseArtists(
    (data ?? [])
      .map((row) => parseRow(row as Record<string, unknown>))
      .filter((row): row is ReleaseArtist => row != null),
  );
}
