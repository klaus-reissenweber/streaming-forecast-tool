/**
 * Backfill daily_data.streams_songstats / popularity_songstats from Songstats.
 *
 *   npx tsx --env-file=.env.local scripts/songstats-backfill.ts [--dry-run] ISRC [ISRC...]
 *
 * Alignment: day_number N is the history row for release_date + (N − 1).
 * Writes streams_songstats, popularity_songstats, streams_source='songstats'.
 * Never writes the streams column.
 *
 * Requires SONGSTATS_API_KEY and SUPABASE_SERVICE_ROLE_KEY.
 */
import { createServiceClient } from "@/lib/supabase/service";
import {
  getTrackHistory,
  getTrackInfo,
  type TrackHistoryRow,
} from "@/lib/songstats/client";

const WINDOW_DAYS = 28;
const SOURCE = "songstats";

type AlignedRow = {
  day_number: number;
  date: string;
  streams_songstats: number | null;
  popularity_songstats: number;
};

function parseArgs(argv: string[]): { dryRun: boolean; isrcs: string[] } {
  const isrcs: string[] = [];
  let dryRun = false;
  for (const arg of argv) {
    if (arg === "--dry-run" || arg === "-n") {
      dryRun = true;
      continue;
    }
    if (arg.startsWith("-")) {
      throw new Error(`Unknown flag: ${arg}`);
    }
    isrcs.push(arg.trim());
  }
  if (isrcs.length === 0) {
    throw new Error(
      "Usage: npx tsx --env-file=.env.local scripts/songstats-backfill.ts [--dry-run] ISRC [ISRC...]",
    );
  }
  return { dryRun, isrcs };
}

function addUtcDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`release_date: ${isoDate}`);
  }
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function alignHistoryToDays(
  history: TrackHistoryRow[],
  releaseDate: string,
): AlignedRow[] {
  const byDate = new Map(history.map((row) => [row.date, row]));
  const aligned: AlignedRow[] = [];
  for (let day = 1; day <= WINDOW_DAYS; day++) {
    const date = addUtcDays(releaseDate, day - 1);
    const hit = byDate.get(date);
    if (!hit) {
      throw new Error(`body.stats history missing date ${date} (day_number=${day})`);
    }
    aligned.push({
      day_number: day,
      date,
      streams_songstats: hit.daily_streams,
      popularity_songstats: hit.popularity_current,
    });
  }
  return aligned;
}

function asString(value: unknown, path: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(path);
  }
  return value;
}

type ReleaseHit = {
  id: string;
  track_name: string;
  artist_name: string;
  release_date: string;
  isrc: string | null;
};

async function resolveRelease(
  sb: ReturnType<typeof createServiceClient>,
  isrc: string,
): Promise<ReleaseHit> {
  const byIsrc = await sb
    .from("releases")
    .select("id, track_name, artist_name, release_date, isrc")
    .eq("isrc", isrc)
    .maybeSingle();
  if (byIsrc.error) {
    throw new Error(`releases.isrc: ${byIsrc.error.message}`);
  }
  if (byIsrc.data) {
    return byIsrc.data as ReleaseHit;
  }

  const info = await getTrackInfo(isrc);
  const title = info.title;
  const releaseDate = info.releaseDate;
  const { data, error } = await sb
    .from("releases")
    .select("id, track_name, artist_name, release_date, isrc")
    .eq("release_date", releaseDate)
    .ilike("track_name", title);
  if (error) {
    throw new Error(`releases title/date: ${error.message}`);
  }
  const hits = (data ?? []) as ReleaseHit[];
  if (hits.length === 0) {
    throw new Error(`no release for isrc=${isrc} title=${title} release_date=${releaseDate}`);
  }
  if (hits.length > 1) {
    throw new Error(
      `ambiguous release for isrc=${isrc}: ${hits.map((row) => row.id).join(", ")}`,
    );
  }
  return hits[0]!;
}

function printRows(isrc: string, release: ReleaseHit, rows: AlignedRow[]): void {
  console.log(
    `${isrc} release_id=${release.id} "${release.track_name}" / ${release.artist_name} release_date=${release.release_date}`,
  );
  console.log("day_number\tdate\tstreams_songstats\tpopularity_songstats");
  for (const row of rows) {
    console.log(
      `${row.day_number}\t${row.date}\t${row.streams_songstats}\t${row.popularity_songstats}`,
    );
  }
}

async function writeRows(
  sb: ReturnType<typeof createServiceClient>,
  releaseId: string,
  rows: AlignedRow[],
): Promise<void> {
  for (const row of rows) {
    const patch = {
      streams_songstats: row.streams_songstats,
      popularity_songstats: row.popularity_songstats,
      streams_source: SOURCE,
    };
    const { data, error } = await sb
      .from("daily_data")
      .update(patch)
      .eq("release_id", releaseId)
      .eq("day_number", row.day_number)
      .select("id");
    if (error) {
      throw new Error(`daily_data update day ${row.day_number}: ${error.message}`);
    }
    if ((data ?? []).length > 0) {
      continue;
    }
    const { error: insertError } = await sb.from("daily_data").insert({
      release_id: releaseId,
      day_number: row.day_number,
      ...patch,
    });
    if (insertError) {
      throw new Error(`daily_data insert day ${row.day_number}: ${insertError.message}`);
    }
  }
}

async function main(): Promise<number> {
  const { dryRun, isrcs } = parseArgs(process.argv.slice(2));
  const sb = createServiceClient();
  if (dryRun) {
    console.log("dry-run: printing only, not writing daily_data");
  }

  for (const isrc of isrcs) {
    const history = await getTrackHistory(isrc);
    const release = await resolveRelease(sb, isrc);
    const rows = alignHistoryToDays(history, release.release_date);
    printRows(isrc, release, rows);
    if (!dryRun) {
      await writeRows(sb, release.id, rows);
      console.log(`wrote ${rows.length} rows streams_source=${SOURCE}`);
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
