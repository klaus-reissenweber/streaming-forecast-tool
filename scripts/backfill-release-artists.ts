/**
 * Backfill one primary release_artists row per existing release.
 *
 *   npx tsx --env-file=.env.local --env-file=retrain/.env.local \
 *     scripts/backfill-release-artists.ts
 *
 * Idempotent: skips a release that already has any roster row.
 * Does not invent featured/remixer/original credits — add those by hand.
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY (writes bypass RLS).
 *
 * DO NOT RUN until the operator is ready. Secondary artists on historical
 * releases are filled in manually afterward so the closed set can test
 * future aggregations.
 */
import { createServiceClient } from "@/lib/supabase/service";

const BATCH = 100;

type ReleaseRow = {
  id: string;
  artist_name: string;
  monthly_listeners_at_release: number | string | null;
};

async function main(): Promise<number> {
  const sb = createServiceClient();

  const releases: ReleaseRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb
      .from("releases")
      .select("id, artist_name, monthly_listeners_at_release")
      .order("created_at", { ascending: true })
      .range(from, from + 999);
    if (error) {
      console.error("releases fetch failed:", error.message);
      return 1;
    }
    releases.push(...((data ?? []) as ReleaseRow[]));
    if (!data || data.length < 1000) break;
  }

  const existingIds = new Set<string>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb
      .from("release_artists")
      .select("release_id")
      .range(from, from + 999);
    if (error) {
      console.error("release_artists fetch failed:", error.message);
      console.error("Apply supabase/migrations/202608170001_release_artists.sql first.");
      return 1;
    }
    for (const row of data ?? []) {
      existingIds.add(String(row.release_id));
    }
    if (!data || data.length < 1000) break;
  }

  const pending = releases.filter((row) => !existingIds.has(row.id));
  console.log(
    `releases=${releases.length} already_have_roster=${existingIds.size} to_insert=${pending.length}`,
  );

  let inserted = 0;
  for (let i = 0; i < pending.length; i += BATCH) {
    const chunk = pending.slice(i, i + BATCH).map((row) => {
      const mlRaw = row.monthly_listeners_at_release;
      const ml = typeof mlRaw === "number" ? mlRaw : Number(mlRaw);
      return {
        release_id: row.id,
        artist_name: row.artist_name.trim(),
        monthly_listeners: Number.isFinite(ml) && ml >= 1 ? ml : null,
        role: "primary" as const,
        position: 1,
      };
    });
    const { error } = await sb.from("release_artists").insert(chunk);
    if (error) {
      console.error("insert failed at offset", i, error.message);
      return 1;
    }
    inserted += chunk.length;
    console.log(`inserted ${inserted}/${pending.length}`);
  }

  console.log("done. primary rows inserted:", inserted);
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
