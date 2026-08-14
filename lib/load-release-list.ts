import { createClient } from "@/lib/supabase/server";

export type ReleaseListItem = {
  id: string;
  trackName: string;
  artistName: string;
  status: "active" | "closed";
  releaseDate: string | null;
};

function mapStatus(value: unknown): "active" | "closed" {
  return value === "closed" ? "closed" : "active";
}

/** Lean release list for Ads / Reports pickers. */
export async function loadReleaseList(): Promise<ReleaseListItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("releases")
    .select("id, track_name, artist_name, status, release_date")
    .order("release_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`releases list: ${error.message}`);
  }

  return (data ?? []).map((row) => ({
    id: String(row.id),
    trackName: String(row.track_name ?? "Untitled"),
    artistName: String(row.artist_name ?? ""),
    status: mapStatus(row.status),
    releaseDate: typeof row.release_date === "string" ? row.release_date : null,
  }));
}
