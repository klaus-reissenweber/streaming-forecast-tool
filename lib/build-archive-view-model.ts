import { SAVE_RATE_BANDS } from "@/lib/constants";
import { computeWeek1Actuals } from "@/lib/compute-week1-actuals";
import { formatLockTimestamp, formatReleaseDate } from "@/lib/format";
import type { Genre } from "@/lib/forecast";
import {
  HEALTH_LAGGING_THRESHOLD_PCT,
  HEALTH_OUTPERFORM_THRESHOLD_PCT,
} from "@/lib/monitoring";
import type { DailyDataPoint, ReleaseRecord } from "@/lib/map-release-row";

export type ArchiveSortOption =
  | "closed_at_desc"
  | "closed_at_asc"
  | "release_date_desc"
  | "release_date_asc"
  | "streams_delta_pct_desc"
  | "streams_delta_pct_asc";

export type DeltaTone = "outperform" | "on_track" | "lagging";

export type SaveRateVsBand = "below" | "within" | "above";

export interface ArchiveRow {
  id: string;
  trackName: string;
  artistName: string;
  genre: Genre;
  releaseDate: string;
  releaseDateDisplay: string;
  closedAt: string | null;
  closedAtDisplay: string | null;

  lockedStreams: number;
  lockedSaves: number;
  lockedSaveRate: number;

  actualStreams: number | null;
  actualSaves: number | null;
  actualSaveRate: number | null;
  wk1Complete: boolean;

  streamsDelta: number | null;
  streamsDeltaPct: number | null;
  streamsDeltaTone: DeltaTone | null;

  savesDelta: number | null;
  savesDeltaPct: number | null;
  savesDeltaTone: DeltaTone | null;

  saveRateBand: { lo: number; hi: number };
  saveRateVsBand: SaveRateVsBand | null;

  detailHref: string;
}

export interface ArchiveSummary {
  totalClosed: number;
  retrainEligible: number;
}

export interface ArchiveViewModel {
  rows: ArchiveRow[];
  summary: ArchiveSummary;
}

function computeSaveRate(streams: number, saves: number): number {
  if (streams <= 0) {
    return 0;
  }
  return (saves / streams) * 100;
}

function computeDelta(
  actual: number | null,
  locked: number,
): { delta: number | null; deltaPct: number | null } {
  if (actual == null) {
    return { delta: null, deltaPct: null };
  }

  const delta = actual - locked;
  const deltaPct = locked > 0 ? (delta / locked) * 100 : null;
  return { delta, deltaPct };
}

/** ±10% bands aligned with health banner (step 6). */
export function deltaTone(deltaPct: number | null): DeltaTone | null {
  if (deltaPct == null) {
    return null;
  }
  if (deltaPct >= HEALTH_OUTPERFORM_THRESHOLD_PCT) {
    return "outperform";
  }
  if (deltaPct <= HEALTH_LAGGING_THRESHOLD_PCT) {
    return "lagging";
  }
  return "on_track";
}

function classifySaveRateVsBand(
  actualSaveRate: number | null,
  genre: Genre,
): SaveRateVsBand | null {
  if (actualSaveRate == null) {
    return null;
  }

  const band = SAVE_RATE_BANDS[genre];
  if (actualSaveRate < band.lo) {
    return "below";
  }
  if (actualSaveRate > band.hi) {
    return "above";
  }
  return "within";
}

function buildArchiveRow(
  release: ReleaseRecord,
  dailyData: DailyDataPoint[],
): ArchiveRow {
  const wk1 = computeWeek1Actuals(dailyData);
  const lockedSaveRate = computeSaveRate(
    release.locked_forecast_streams,
    release.locked_forecast_saves,
  );

  const actualSaveRate =
    wk1.streams != null && wk1.saves != null
      ? computeSaveRate(wk1.streams, wk1.saves)
      : null;

  const streamsDeltaResult = computeDelta(
    wk1.streams,
    release.locked_forecast_streams,
  );
  const savesDeltaResult = computeDelta(
    wk1.saves,
    release.locked_forecast_saves,
  );

  return {
    id: release.id,
    trackName: release.track_name,
    artistName: release.artist_name,
    genre: release.genre,
    releaseDate: release.release_date,
    releaseDateDisplay: formatReleaseDate(release.release_date),
    closedAt: release.closed_at,
    closedAtDisplay: release.closed_at
      ? formatLockTimestamp(release.closed_at)
      : null,

    lockedStreams: release.locked_forecast_streams,
    lockedSaves: release.locked_forecast_saves,
    lockedSaveRate,

    actualStreams: wk1.streams,
    actualSaves: wk1.saves,
    actualSaveRate,
    wk1Complete: wk1.isComplete,

    streamsDelta: streamsDeltaResult.delta,
    streamsDeltaPct: streamsDeltaResult.deltaPct,
    streamsDeltaTone: deltaTone(streamsDeltaResult.deltaPct),

    savesDelta: savesDeltaResult.delta,
    savesDeltaPct: savesDeltaResult.deltaPct,
    savesDeltaTone: deltaTone(savesDeltaResult.deltaPct),

    saveRateBand: SAVE_RATE_BANDS[release.genre],
    saveRateVsBand: classifySaveRateVsBand(actualSaveRate, release.genre),

    detailHref: `/release/${release.id}`,
  };
}

function compareNullableIsoDesc(
  a: string | null,
  b: string | null,
): number {
  if (a == null && b == null) {
    return 0;
  }
  if (a == null) {
    return 1;
  }
  if (b == null) {
    return -1;
  }
  return b.localeCompare(a);
}

function compareNullableIsoAsc(a: string | null, b: string | null): number {
  return -compareNullableIsoDesc(a, b);
}

function compareNullableNumberDesc(
  a: number | null,
  b: number | null,
): number {
  if (a == null && b == null) {
    return 0;
  }
  if (a == null) {
    return 1;
  }
  if (b == null) {
    return -1;
  }
  return b - a;
}

function compareNullableNumberAsc(
  a: number | null,
  b: number | null,
): number {
  return -compareNullableNumberDesc(a, b);
}

export function sortArchiveRows(
  rows: ArchiveRow[],
  sort: ArchiveSortOption = "closed_at_desc",
): ArchiveRow[] {
  const sorted = [...rows];

  sorted.sort((a, b) => {
    switch (sort) {
      case "closed_at_desc":
        return compareNullableIsoDesc(a.closedAt, b.closedAt);
      case "closed_at_asc":
        return compareNullableIsoAsc(a.closedAt, b.closedAt);
      case "release_date_desc":
        return b.releaseDate.localeCompare(a.releaseDate);
      case "release_date_asc":
        return a.releaseDate.localeCompare(b.releaseDate);
      case "streams_delta_pct_desc":
        return compareNullableNumberDesc(
          a.streamsDeltaPct,
          b.streamsDeltaPct,
        );
      case "streams_delta_pct_asc":
        return compareNullableNumberAsc(a.streamsDeltaPct, b.streamsDeltaPct);
      default:
        return 0;
    }
  });

  return sorted;
}

/** Pure assembly of archive list state from closed releases + daily_data. */
export function buildArchiveViewModel(
  releases: ReleaseRecord[],
  dailyDataByReleaseId: Map<string, DailyDataPoint[]>,
  options?: { sort?: ArchiveSortOption },
): ArchiveViewModel {
  const rows = releases.map((release) =>
    buildArchiveRow(
      release,
      dailyDataByReleaseId.get(release.id) ?? [],
    ),
  );

  const sortedRows = sortArchiveRows(rows, options?.sort ?? "closed_at_desc");
  const retrainEligible = sortedRows.filter((row) => row.wk1Complete).length;

  return {
    rows: sortedRows,
    summary: {
      totalClosed: sortedRows.length,
      retrainEligible,
    },
  };
}
