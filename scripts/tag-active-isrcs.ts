/**
 * Resolve Songstats track IDs / ISRCs for active releases.
 *
 *   npx tsx --env-file=.env.local scripts/tag-active-isrcs.ts
 *   npx tsx --env-file=.env.local scripts/tag-active-isrcs.ts --apply <release_id>=<songstats_track_id> [...]
 *
 * Default is dry run: search only (not billable if /status is unchanged).
 * --apply calls getTrackInfo (billable) and writes isrc / songstats_track_id / label.
 */
import {
  getAccountStatus,
  getTrackInfo,
  getTrackSearch,
  type TrackSearchHit,
} from "@/lib/songstats/client";
import { addUtcDays } from "@/lib/songstats/derive-daily-grid";
import { createServiceClient } from "@/lib/supabase/service";

const MAX_ACTIVE_WITHOUT_CHOOSING = 10;
const DATE_SLACK_DAYS = 3;

type ActiveRelease = {
  id: string;
  artist_name: string;
  track_name: string;
  release_date: string;
  isrc: string | null;
};

function loadEnvAlias(): void {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_URL) {
    process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.SUPABASE_URL;
  }
}

function utcToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function utcDayDiff(later: string, earlier: string): number {
  const a = Date.parse(`${earlier.slice(0, 10)}T00:00:00.000Z`);
  const b = Date.parse(`${later.slice(0, 10)}T00:00:00.000Z`);
  return Math.round((b - a) / 86_400_000);
}

function dayNumberToday(releaseDate: string, today: string): number {
  return utcDayDiff(today, releaseDate) + 1;
}

function withinSlack(candidateDate: string, releaseDate: string): boolean {
  return Math.abs(utcDayDiff(candidateDate, releaseDate)) <= DATE_SLACK_DAYS;
}

function parseArgs(argv: string[]): {
  apply: Array<{ releaseId: string; songstatsTrackId: string }>;
} {
  const apply: Array<{ releaseId: string; songstatsTrackId: string }> = [];
  let applyMode = false;
  for (const arg of argv) {
    if (arg === "--apply") {
      applyMode = true;
      continue;
    }
    if (arg.startsWith("-")) {
      throw new Error(`Unknown flag: ${arg}`);
    }
    if (!applyMode) {
      throw new Error(
        "Usage: npx tsx --env-file=.env.local scripts/tag-active-isrcs.ts [--apply id=track_id ...]",
      );
    }
    const eq = arg.indexOf("=");
    if (eq === -1) {
      throw new Error(`Apply pair must be release_id=songstats_track_id: ${arg}`);
    }
    const releaseId = arg.slice(0, eq).trim();
    const songstatsTrackId = arg.slice(eq + 1).trim();
    if (!releaseId || !songstatsTrackId) {
      throw new Error(`Apply pair must be release_id=songstats_track_id: ${arg}`);
    }
    apply.push({ releaseId, songstatsTrackId });
  }
  return { apply };
}

function artistLine(hit: TrackSearchHit): string {
  return hit.artists.map((row) => row.name).join(", ");
}

async function loadActive(): Promise<ActiveRelease[]> {
  const sb = createServiceClient();
  const { data, error } = await sb
    .from("releases")
    .select("id, artist_name, track_name, release_date, isrc")
    .eq("status", "active")
    .order("release_date", { ascending: true });
  if (error) {
    throw new Error(`releases: ${error.message}`);
  }
  return (data ?? []).map((row) => ({
    id: String(row.id),
    artist_name: String(row.artist_name),
    track_name: String(row.track_name),
    release_date: String(row.release_date).slice(0, 10),
    isrc:
      typeof row.isrc === "string" && row.isrc.trim() !== ""
        ? row.isrc.trim()
        : null,
  }));
}

function printActiveTable(rows: ActiveRelease[], today: string): void {
  console.log(`today=${today}  active=${rows.length}`);
  console.log("id\tartist\ttitle\trelease_date\tday\tisrc");
  for (const row of rows) {
    console.log(
      [
        row.id,
        row.artist_name,
        row.track_name,
        row.release_date,
        dayNumberToday(row.release_date, today),
        row.isrc ? "yes" : "no",
      ].join("\t"),
    );
  }
}

async function dryRun(rows: ActiveRelease[]): Promise<number> {
  const missing = rows.filter((row) => !row.isrc);
  console.log(`\nreleases without isrc: ${missing.length}`);
  if (missing.length === 0) {
    console.log("nothing to search.");
    return 0;
  }

  const before = await getAccountStatus();
  console.log(
    `\n/status before first search: current_month_total_requested_objects=${before.current_month_total_requested_objects}`,
  );

  let checkedQuota = false;
  for (const row of missing) {
    const q = `${row.artist_name} ${row.track_name}`;
    const hits = await getTrackSearch(q);
    if (!checkedQuota) {
      const after = await getAccountStatus();
      console.log(
        `/status after first search: current_month_total_requested_objects=${after.current_month_total_requested_objects}`,
      );
      if (
        after.current_month_total_requested_objects !==
        before.current_month_total_requested_objects
      ) {
        console.log(
          "STOP: object count rose after tracks/search. Search bills separately; do not continue.",
        );
        return 2;
      }
      checkedQuota = true;
    }

    const close = hits.filter((hit) =>
      withinSlack(hit.release_date, row.release_date),
    );
    console.log(
      `\n${row.id}  ${row.artist_name} — ${row.track_name}  forecast_release_date=${row.release_date}  q=${JSON.stringify(q)}`,
    );
    if (hits.length === 0) {
      console.log("  no candidates");
      continue;
    }
    for (const hit of hits) {
      const closeFlag = withinSlack(hit.release_date, row.release_date)
        ? "yes"
        : "no";
      console.log(
        [
          " ",
          hit.songstats_track_id,
          `title=${JSON.stringify(hit.title)}`,
          `artists=${JSON.stringify(artistLine(hit))}`,
          `release_date=${hit.release_date}`,
          `within_3_days=${closeFlag}`,
        ].join("  "),
      );
    }
    if (close.length > 1) {
      console.log(
        "  AMBIGUOUS: more than one candidate within 3 days — left for you.",
      );
    } else if (close.length === 1) {
      console.log(
        `  unique within 3 days: ${close[0]!.songstats_track_id}  (not applied)`,
      );
    } else {
      console.log("  none within 3 days");
    }
  }
  return 0;
}

async function applyPairs(
  rows: ActiveRelease[],
  pairs: Array<{ releaseId: string; songstatsTrackId: string }>,
): Promise<number> {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const sb = createServiceClient();
  let failed = 0;

  for (const pair of pairs) {
    const row = byId.get(pair.releaseId);
    if (!row) {
      console.error(`refuse ${pair.releaseId}: not an active release`);
      failed += 1;
      continue;
    }
    const info = await getTrackInfo(pair.songstatsTrackId, "songstats_track_id");
    const releaseDate = info.releaseDate;
    if (!withinSlack(releaseDate, row.release_date)) {
      console.error(
        `refuse ${pair.releaseId}: Songstats release_date ${releaseDate} is more than ${DATE_SLACK_DAYS} days from ${row.release_date}`,
      );
      failed += 1;
      continue;
    }
    const isrc = info.isrc;
    const label = info.label;
    const { error } = await sb
      .from("releases")
      .update({
        isrc,
        songstats_track_id: pair.songstatsTrackId,
        label,
      })
      .eq("id", pair.releaseId)
      .eq("status", "active");
    if (error) {
      console.error(`write ${pair.releaseId}: ${error.message}`);
      failed += 1;
      continue;
    }
    console.log(
      `applied ${pair.releaseId}  track=${pair.songstatsTrackId}  isrc=${isrc}  label=${label}  songstats_release_date=${releaseDate}`,
    );
  }
  return failed === 0 ? 0 : 1;
}

async function main(): Promise<number> {
  loadEnvAlias();
  const { apply } = parseArgs(process.argv.slice(2));
  const today = utcToday();
  const rows = await loadActive();
  printActiveTable(rows, today);

  if (rows.length > MAX_ACTIVE_WITHOUT_CHOOSING) {
    console.log(
      `\nSTOP: ${rows.length} active releases > ${MAX_ACTIVE_WITHOUT_CHOOSING}. Choose a subset before search or apply.`,
    );
    return 2;
  }

  const windowFrom = addUtcDays(today, -30);
  const windowTo = addUtcDays(today, 2);
  const inCronWindow = rows.filter(
    (row) => row.release_date >= windowFrom && row.release_date <= windowTo,
  );
  console.log(
    `cron window ${windowFrom}..${windowTo}: ${inCronWindow.length} of ${rows.length} active`,
  );

  if (apply.length > 0) {
    return applyPairs(rows, apply);
  }
  return dryRun(rows);
}

main()
  .then((code) => process.exit(code))
  .catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
