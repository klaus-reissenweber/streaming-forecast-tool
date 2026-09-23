import { createServiceClient } from "@/lib/supabase/service";
import { getTrackTotals } from "@/lib/songstats/client";
import {
  deriveDailyGrid,
  type SongstatsTotalReading,
} from "@/lib/songstats/derive-daily-grid";
import { writeDerivedGrid } from "@/lib/songstats/write-grid";

export const MANUAL_REFRESH_MIN_AGE_MS = 10 * 60 * 1000;

export type TotalsTrigger = "cron" | "manual";

export class RefreshTooSoonError extends Error {
  constructor() {
    super("Last Songstats reading for this release is under 10 minutes old.");
    this.name = "RefreshTooSoonError";
  }
}

function asReading(row: {
  streams_total: number | string;
  fetched_at: string;
  popularity: number | string | null;
}): SongstatsTotalReading {
  return {
    streamsTotal: Number(row.streams_total),
    fetchedAt: row.fetched_at,
    popularity:
      row.popularity == null || row.popularity === ""
        ? null
        : Number(row.popularity),
  };
}

export async function recordTrackTotals(args: {
  releaseId: string;
  isrc: string;
  trigger: TotalsTrigger;
}): Promise<{ streamsTotal: number; fetchedAt: string }> {
  const totals = await getTrackTotals(args.isrc);
  const sb = createServiceClient();
  const { error } = await sb.from("songstats_daily_totals").insert({
    release_id: args.releaseId,
    isrc: args.isrc,
    fetched_at: totals.fetchedAt,
    source: totals.source,
    streams_total: totals.streamsTotal,
    popularity: totals.popularity,
    trigger: args.trigger,
  });
  if (error) {
    throw new Error(`songstats_daily_totals: ${error.message}`);
  }
  return { streamsTotal: totals.streamsTotal, fetchedAt: totals.fetchedAt };
}

export async function deriveAndWriteGrid(
  releaseId: string,
  releaseDate: string,
): Promise<void> {
  const sb = createServiceClient();
  const { data, error } = await sb
    .from("songstats_daily_totals")
    .select("streams_total, fetched_at, popularity")
    .eq("release_id", releaseId)
    .order("fetched_at", { ascending: true });
  if (error) {
    throw new Error(`songstats_daily_totals: ${error.message}`);
  }

  const readings = (data ?? []).map((row) =>
    asReading(
      row as {
        streams_total: number | string;
        fetched_at: string;
        popularity: number | string | null;
      },
    ),
  );
  const grid = deriveDailyGrid(readings, releaseDate);
  const latest = [...readings].reverse().find((row) => row.popularity != null);
  const popularityByDay = new Map<number, number | null>();
  if (latest?.popularity != null) {
    for (const day of grid) {
      if (day.quality !== "pending") {
        popularityByDay.set(day.dayNumber, latest.popularity);
      }
    }
  }

  await writeDerivedGrid(sb, releaseId, grid, { popularityByDay });
}

export async function assertRefreshAllowed(releaseId: string): Promise<void> {
  const sb = createServiceClient();
  const { data, error } = await sb
    .from("songstats_daily_totals")
    .select("fetched_at")
    .eq("release_id", releaseId)
    .order("fetched_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    throw new Error(`songstats_daily_totals: ${error.message}`);
  }
  if (!data?.fetched_at) return;
  const age = Date.now() - Date.parse(data.fetched_at);
  if (Number.isFinite(age) && age < MANUAL_REFRESH_MIN_AGE_MS) {
    throw new RefreshTooSoonError();
  }
}

export async function ingestReleaseTotals(args: {
  releaseId: string;
  isrc: string;
  releaseDate: string;
  trigger: TotalsTrigger;
}): Promise<void> {
  await recordTrackTotals({
    releaseId: args.releaseId,
    isrc: args.isrc,
    trigger: args.trigger,
  });
  await deriveAndWriteGrid(args.releaseId, args.releaseDate);
}
