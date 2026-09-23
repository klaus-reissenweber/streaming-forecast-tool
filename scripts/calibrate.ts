/**
 * Score locked week-1 stream forecasts against closed-release actuals.
 *
 *   npx tsx --env-file=.env.local --env-file=retrain/.env.local \
 *     scripts/calibrate.ts
 *
 * Read-only. No Songstats, no writes.
 */
import {
  adSpendPlanFromRelease,
  buildAdDailyLayer,
} from "@/lib/ad-forecast";
import { calibrate } from "@/lib/analysis/calibration";
import { calibrationFindings } from "@/lib/analysis/findings";
import { mean, median, sd } from "@/lib/analysis/stats";
import type { ClosedRelease } from "@/lib/analysis/types";
import { computeWeek1Actuals } from "@/lib/compute-week1-actuals";
import { loadActiveModel } from "@/lib/load-active-model";
import type { AdModel } from "@/lib/model/ad-model";
import {
  DAILY_DATA_SELECT_COLUMNS,
  parseDailyDataRow,
  parseReleaseRow,
  RELEASE_SELECT_COLUMNS,
  type DailyDataPoint,
  type DailyDataRow,
  type ReleaseRecord,
  type ReleaseRow,
} from "@/lib/map-release-row";
import { expectedStreamRange } from "@/lib/save-rate-band-label";
import { createServiceClient } from "@/lib/supabase/service";

/** Spend splits omitted from RELEASE_SELECT_COLUMNS; ad plan needs them. */
const RELEASE_CALIBRATE_COLUMNS = [
  RELEASE_SELECT_COLUMNS,
  "spotify_marquee_spend_planned",
  "spotify_showcase_spend_planned",
  "campaign_start_offset_days",
  "campaign_duration_days",
  "meta_traffic_spend_planned",
  "meta_awareness_spend_planned",
].join(", ");

function groupDailyData(
  rows: DailyDataPoint[],
): Map<string, DailyDataPoint[]> {
  const map = new Map<string, DailyDataPoint[]>();
  for (const row of rows) {
    const existing = map.get(row.release_id);
    if (existing) existing.push(row);
    else map.set(row.release_id, [row]);
  }
  for (const days of map.values()) {
    days.sort((a, b) => a.day_number - b.day_number);
  }
  return map;
}

async function loadClosed(): Promise<{
  releases: ReleaseRecord[];
  dailyDataByReleaseId: Map<string, DailyDataPoint[]>;
}> {
  const sb = createServiceClient();
  const { data: releaseRows, error: releaseError } = await sb
    .from("releases")
    .select(RELEASE_CALIBRATE_COLUMNS)
    .eq("status", "closed")
    .order("closed_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });
  if (releaseError) {
    throw new Error(`releases: ${releaseError.message}`);
  }
  const releases = (releaseRows ?? []).map((row) =>
    parseReleaseRow(row as unknown as ReleaseRow),
  );
  if (releases.length === 0) {
    return { releases, dailyDataByReleaseId: new Map() };
  }

  const { data: dailyRows, error: dailyError } = await sb
    .from("daily_data")
    .select(DAILY_DATA_SELECT_COLUMNS)
    .in("release_id", releases.map((release) => release.id))
    .order("day_number", { ascending: true });
  if (dailyError) {
    throw new Error(`daily_data: ${dailyError.message}`);
  }

  return {
    releases,
    dailyDataByReleaseId: groupDailyData(
      (dailyRows ?? []).map((row) =>
        parseDailyDataRow(row as unknown as DailyDataRow),
      ),
    ),
  };
}

async function loadPrimaryArtistNames(
  releaseIds: string[],
): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  if (releaseIds.length === 0) return names;
  const sb = createServiceClient();
  const { data, error } = await sb
    .from("release_artists")
    .select("release_id, artist_name, role")
    .in("release_id", releaseIds)
    .eq("role", "primary");
  if (error) {
    throw new Error(`release_artists: ${error.message}`);
  }
  for (const row of data ?? []) {
    const id = typeof row.release_id === "string" ? row.release_id : "";
    const name = typeof row.artist_name === "string" ? row.artist_name.trim() : "";
    if (id && name) names.set(id, name);
  }
  return names;
}

type ScoredRow = ClosedRelease & {
  release_date: string;
  editorial_tier: number;
  ratio: number;
  log_ratio: number;
  paid_estimate: number;
  ratio_with_paid: number;
  inside: boolean;
  usable: boolean;
};

function quantile(xs: number[], p: number): number {
  if (!xs.length) return NaN;
  const sorted = [...xs].sort((a, b) => a - b);
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo]!;
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (idx - lo);
}

function medianRatio(rows: ScoredRow[]): number {
  return median(rows.map((row) => row.ratio));
}

function toScoredRow(
  release: ReleaseRecord,
  days: DailyDataPoint[],
  streamBands: { lo: number; hi: number },
  adModel: AdModel,
  primaryArtistName: string,
): ScoredRow {
  const wk1 = computeWeek1Actuals(days);
  const actual = wk1.streams ?? 0;
  const forecast = release.locked_forecast_streams;
  const range = expectedStreamRange(forecast, streamBands);
  const plan = adSpendPlanFromRelease(release, primaryArtistName);
  const paid_estimate = buildAdDailyLayer(plan, adModel, forecast).week1AdTotal;
  const combined = forecast + paid_estimate;
  const usable = actual > 0 && forecast > 0;
  const ratio = usable ? actual / forecast : NaN;
  const ratio_with_paid =
    actual > 0 && combined > 0 ? actual / combined : NaN;
  return {
    id: release.id,
    name: `${release.artist_name} — ${release.track_name}`,
    actual,
    forecast,
    lo: range.lo,
    hi: range.hi,
    release_date: release.release_date,
    editorial_tier: release.editorial_tier,
    ratio,
    log_ratio: usable ? Math.log(ratio) : NaN,
    paid_estimate,
    ratio_with_paid,
    inside: usable && actual >= range.lo && actual <= range.hi,
    usable,
  };
}

function printGroup(
  title: string,
  groups: Array<{ label: string; rows: ScoredRow[] }>,
): void {
  console.log(`\n=== median ratio by ${title} ===`);
  console.log("group\tn\tmedian_ratio");
  for (const group of groups) {
    console.log(
      `${group.label}\t${group.rows.length}\t${medianRatio(group.rows).toFixed(4)}`,
    );
  }
}

async function main(): Promise<number> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_URL) {
    process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.SUPABASE_URL;
  }
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL");
    return 1;
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("Missing SUPABASE_SERVICE_ROLE_KEY");
    return 1;
  }

  const model = await loadActiveModel();
  const { releases, dailyDataByReleaseId } = await loadClosed();
  const primaryNames = await loadPrimaryArtistNames(
    releases.map((release) => release.id),
  );
  const rows = releases.map((release) =>
    toScoredRow(
      release,
      dailyDataByReleaseId.get(release.id) ?? [],
      model.streamBands,
      model.adModel,
      primaryNames.get(release.id) ?? "",
    ),
  );
  const usable = rows.filter((row) => row.usable);
  const closes: ClosedRelease[] = usable.map(
    ({ id, name, actual, forecast, lo, hi }) => ({
      id,
      name,
      actual,
      forecast,
      lo,
      hi,
    }),
  );
  const scored = calibrate(closes);
  const findings = calibrationFindings(closes);
  const logs = usable.map((row) => row.log_ratio);

  console.log(
    "id\tname\trelease_date\teditorial_tier\tforecast\tactual\tratio\tlog_ratio\tpaid_estimate\tratio_with_paid\tinside",
  );
  for (const row of rows) {
    console.log(
      [
        row.id,
        row.name,
        row.release_date,
        row.editorial_tier,
        row.forecast,
        row.actual,
        Number.isFinite(row.ratio) ? row.ratio.toFixed(4) : "",
        Number.isFinite(row.log_ratio) ? row.log_ratio.toFixed(4) : "",
        row.paid_estimate,
        Number.isFinite(row.ratio_with_paid)
          ? row.ratio_with_paid.toFixed(4)
          : "",
        row.usable ? (row.inside ? "yes" : "no") : "",
      ].join("\t"),
    );
  }

  console.log("\n=== log ratio ===");
  console.log(
    JSON.stringify(
      {
        n: logs.length,
        median: median(logs),
        mean: mean(logs),
        sd: sd(logs),
        q1: quantile(logs, 0.25),
        q2: quantile(logs, 0.5),
        q3: quantile(logs, 0.75),
      },
      null,
      2,
    ),
  );

  const byTier = new Map<number, ScoredRow[]>();
  for (const row of usable) {
    const list = byTier.get(row.editorial_tier) ?? [];
    list.push(row);
    byTier.set(row.editorial_tier, list);
  }
  printGroup(
    "editorial_tier",
    [...byTier.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([tier, group]) => ({ label: String(tier), rows: group })),
  );

  const byForecast = [...usable].sort(
    (a, b) => a.forecast - b.forecast || a.id.localeCompare(b.id),
  );
  const cut1 = Math.floor(byForecast.length / 3);
  const cut2 = Math.floor((2 * byForecast.length) / 3);
  printGroup("forecast tercile", [
    { label: "small", rows: byForecast.slice(0, cut1) },
    { label: "medium", rows: byForecast.slice(cut1, cut2) },
    { label: "large", rows: byForecast.slice(cut2) },
  ]);

  const byDate = [...usable].sort(
    (a, b) =>
      a.release_date.localeCompare(b.release_date) || a.id.localeCompare(b.id),
  );
  const half = Math.floor(byDate.length / 2);
  printGroup("release date half", [
    { label: `older ${half}`, rows: byDate.slice(0, half) },
    { label: `newer ${byDate.length - half}`, rows: byDate.slice(half) },
  ]);

  console.log(`\nclosed=${releases.length} mapped=${rows.length}`);
  console.log(
    JSON.stringify(
      {
        n: scored.n,
        excluded: scored.excluded,
        inside: scored.inside,
        coverage: scored.coverage,
        coverageCI: scored.coverageCI,
        ratioMean: scored.ratioMean,
        ratioCI: scored.ratioCI,
        ratioMedian: scored.ratioMedian,
        below: scored.below,
        belowCI: scored.belowCI,
        signP: scored.signP,
        nominalCoverage: scored.nominalCoverage,
        intervalsMiscalibrated: scored.intervalsMiscalibrated,
      },
      null,
      2,
    ),
  );
  for (const finding of findings) {
    console.log(`${finding.id}: ${finding.text}`);
  }
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
