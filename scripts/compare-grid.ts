/**
 * Compare typed daily_data.streams to derived Songstats grid.
 *
 *   npx tsx --env-file=.env.local scripts/compare-grid.ts <release_id>
 *
 * Read-only. Prints offsets 1 and 2.
 */
import {
  deriveDailyGrid,
  type SongstatsTotalReading,
} from "@/lib/songstats/derive-daily-grid";
import { createServiceClient } from "@/lib/supabase/service";

function loadEnvAlias(): void {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_URL) {
    process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.SUPABASE_URL;
  }
}

async function main(): Promise<number> {
  loadEnvAlias();
  const releaseId = process.argv[2]?.trim();
  if (!releaseId) {
    console.error("Usage: npx tsx --env-file=.env.local scripts/compare-grid.ts <release_id>");
    return 1;
  }

  const sb = createServiceClient();
  const { data: release, error: releaseError } = await sb
    .from("releases")
    .select("id, track_name, artist_name, release_date")
    .eq("id", releaseId)
    .maybeSingle();
  if (releaseError) {
    console.error(releaseError.message);
    return 1;
  }
  if (!release) {
    console.error(`no release ${releaseId}`);
    return 1;
  }

  const { data: daily, error: dailyError } = await sb
    .from("daily_data")
    .select("day_number, streams, streams_songstats")
    .eq("release_id", releaseId)
    .order("day_number");
  if (dailyError) {
    console.error(dailyError.message);
    return 1;
  }

  const { data: totals, error: totalsError } = await sb
    .from("songstats_daily_totals")
    .select("streams_total, fetched_at, popularity")
    .eq("release_id", releaseId)
    .order("fetched_at");
  if (totalsError) {
    const missing =
      /could not find the table|does not exist|schema cache/i.test(
        totalsError.message,
      );
    if (missing) {
      console.log(
        `${release.artist_name} — ${release.track_name}  release_date=${release.release_date}`,
      );
      console.log(
        "songstats_daily_totals does not exist yet (migration not applied). No totals to derive.",
      );
      return 0;
    }
    console.error(`songstats_daily_totals: ${totalsError.message}`);
    return 1;
  }

  const readings: SongstatsTotalReading[] = (totals ?? []).map((row) => ({
    streamsTotal: Number(row.streams_total),
    fetchedAt: String(row.fetched_at),
    popularity: row.popularity == null ? null : Number(row.popularity),
  }));

  console.log(
    `${release.artist_name} — ${release.track_name}  release_date=${release.release_date}  totals=${readings.length}`,
  );
  if (readings.length === 0) {
    console.log("no songstats_daily_totals rows; nothing to derive.");
    return 0;
  }

  const typed = new Map<number, number | null>();
  const stored = new Map<
    number,
    { streams_songstats: number | null; quality: string | null }
  >();
  for (const row of daily ?? []) {
    typed.set(row.day_number, row.streams);
    stored.set(row.day_number, {
      streams_songstats: row.streams_songstats,
      quality: null,
    });
  }

  for (const offset of [1, 2] as const) {
    const grid = deriveDailyGrid(readings, release.release_date, {
      offsetDays: offset,
    });
    console.log(`\n=== offset ${offset} ===`);
    console.log(
      "day\ttyped\tderived\tquality\tdiff\tstored_songstats\tstored_quality",
    );
    for (const day of grid) {
      const typedStreams = typed.get(day.dayNumber);
      const diff =
        typedStreams != null && day.streams != null
          ? typedStreams - day.streams
          : "";
      const row = stored.get(day.dayNumber);
      console.log(
        [
          day.dayNumber,
          typedStreams ?? "",
          day.streams ?? "",
          day.quality,
          diff,
          row?.streams_songstats ?? "",
          row?.quality ?? "",
        ].join("\t"),
      );
    }
  }
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
