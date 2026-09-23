/**
 * Read-only check after a manual / cron Songstats totals run.
 *
 *   npx tsx --env-file=.env.local scripts/verify-cron-run.ts
 */
import { getAccountStatus } from "@/lib/songstats/client";
import {
  deriveDailyGrid,
  SPOTIFY_COUNT_THROUGH_OFFSET_DAYS,
  type SongstatsTotalReading,
} from "@/lib/songstats/derive-daily-grid";
import { createServiceClient } from "@/lib/supabase/service";

const BASELINE_OBJECTS = 4;

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

async function main(): Promise<number> {
  loadEnvAlias();
  const today = utcToday();
  const sb = createServiceClient();

  const { data: tagged, error: taggedError } = await sb
    .from("releases")
    .select("id, artist_name, track_name, release_date, isrc")
    .eq("status", "active")
    .not("isrc", "is", null);
  if (taggedError) {
    console.error(`releases: ${taggedError.message}`);
    return 1;
  }

  const taggedRows = (tagged ?? []).filter(
    (row) => typeof row.isrc === "string" && row.isrc.trim() !== "",
  );

  const { data: totals, error: totalsError } = await sb
    .from("songstats_daily_totals")
    .select("release_id, trigger, fetched_at, streams_total")
    .order("fetched_at", { ascending: true });
  if (totalsError) {
    console.error(`songstats_daily_totals: ${totalsError.message}`);
    return 1;
  }

  type Agg = {
    trigger: string;
    count: number;
    latestFetchedAt: string;
    latestStreamsTotal: number;
  };
  const grouped = new Map<string, Map<string, Agg>>();
  const readings = new Map<string, SongstatsTotalReading[]>();
  for (const row of totals ?? []) {
    const releaseId = String(row.release_id);
    const trigger = String(row.trigger);
    const fetchedAt = String(row.fetched_at);
    const streamsTotal = Number(row.streams_total);
    if (!grouped.has(releaseId)) grouped.set(releaseId, new Map());
    const byTrigger = grouped.get(releaseId)!;
    const current = byTrigger.get(trigger);
    if (!current) {
      byTrigger.set(trigger, {
        trigger,
        count: 1,
        latestFetchedAt: fetchedAt,
        latestStreamsTotal: streamsTotal,
      });
    } else {
      current.count += 1;
      if (fetchedAt >= current.latestFetchedAt) {
        current.latestFetchedAt = fetchedAt;
        current.latestStreamsTotal = streamsTotal;
      }
    }
    const series = readings.get(releaseId) ?? [];
    series.push({ streamsTotal, fetchedAt });
    readings.set(releaseId, series);
  }

  console.log("=== songstats_daily_totals by release / trigger ===");
  if (grouped.size === 0) {
    console.log("(no rows)");
  }
  for (const [releaseId, byTrigger] of grouped) {
    for (const agg of byTrigger.values()) {
      console.log(
        [
          releaseId,
          `trigger=${agg.trigger}`,
          `rows=${agg.count}`,
          `latest_fetched_at=${agg.latestFetchedAt}`,
          `latest_streams_total=${agg.latestStreamsTotal}`,
        ].join("  "),
      );
    }
  }

  const status = await getAccountStatus();
  const expectedObjects = BASELINE_OBJECTS + taggedRows.length;
  console.log(
    `\n/status current_month_total_requested_objects=${status.current_month_total_requested_objects}`,
  );
  console.log(
    `expected=${expectedObjects}  (4 baseline + ${taggedRows.length} tagged active)`,
  );

  console.log(
    `\n=== derived grid offset=${SPOTIFY_COUNT_THROUGH_OFFSET_DAYS} days 1..today ===`,
  );
  const missingRows: string[] = [];
  for (const row of taggedRows) {
    const releaseDate = String(row.release_date).slice(0, 10);
    const todayDay = Math.min(28, Math.max(0, utcDayDiff(today, releaseDate) + 1));
    const series = readings.get(String(row.id)) ?? [];
    if (series.length === 0) {
      missingRows.push(String(row.id));
    }
    const grid = deriveDailyGrid(series, releaseDate);
    console.log(
      `\n${row.id}  ${row.artist_name} — ${row.track_name}  release_date=${releaseDate}  today_day=${todayDay}  totals=${series.length}`,
    );
    console.log("day\tstreams\tcumulative\tquality");
    for (const day of grid) {
      if (todayDay > 0 && day.dayNumber > todayDay) break;
      console.log(
        [day.dayNumber, day.streams ?? "", day.cumulative, day.quality].join(
          "\t",
        ),
      );
    }
  }

  const rowsPass = taggedRows.length > 0 && missingRows.length === 0;
  const objectsPass =
    status.current_month_total_requested_objects === expectedObjects;

  console.log("");
  console.log(
    rowsPass
      ? "PASS: rows exist for every tagged release"
      : `FAIL: rows exist for every tagged release  missing=${missingRows.join(",") || "none tagged"}`,
  );
  console.log(
    objectsPass
      ? "PASS: object count matches expected"
      : `FAIL: object count matches expected  got=${status.current_month_total_requested_objects} expected=${expectedObjects}`,
  );

  return rowsPass && objectsPass ? 0 : 1;
}

main()
  .then((code) => process.exit(code))
  .catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
