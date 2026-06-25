import { EDITORIAL_TIER_DEFINITIONS } from "@/lib/constants";
import { deltaTone } from "@/lib/build-archive-view-model";
import { computeFlagsForRelease, type FlagType, type ReleaseFlag } from "@/lib/flags";
import type { EditorialTier, Genre } from "@/lib/forecast";
import {
  computeMonitoringSummary,
  emptyMonitoringSummary,
  type HealthStatus,
  type HealthTone,
  type MonitoringSummary,
} from "@/lib/monitoring";
import {
  releaseRowToForecastInputs,
  type DailyDataPoint,
  type ReleaseRecord,
} from "@/lib/map-release-row";

const FLAG_SEVERITY: Record<FlagType, number> = {
  warning: 0,
  info: 1,
  positive: 2,
};

const RECENT_FLAG_WINDOW_MS = 24 * 60 * 60 * 1000;

export interface DashboardRow {
  id: string;
  trackName: string;
  artistName: string;
  genre: Genre;
  genreDisplay: string;
  editorialTier: EditorialTier;
  editorialTierDisplay: string;
  releaseDate: string;
  dayIntoCampaign: number | null;
  healthStatus: HealthStatus;
  healthTone: HealthTone;
  projectedWk1: number;
  lockedWk1: number;
  projectedDeltaPct: number;
  projectedDeltaTone: ReturnType<typeof deltaTone>;
  flagCount: number;
  mostSevereFlagType: FlagType | null;
  detailHref: string;
}

export interface HealthDistribution {
  onTrack: number;
  lagging: number;
  outperforming: number;
  awaiting: number;
}

export interface RecentFlag {
  releaseId: string;
  trackName: string;
  artistName: string;
  flag: ReleaseFlag;
  firedAt: string;
  firedAtDisplay: string;
}

export interface DashboardSummary {
  totalActive: number;
  healthDistribution: HealthDistribution;
  totalFlags: number;
  recentFlags: RecentFlag[];
}

export interface DashboardViewModel {
  rows: DashboardRow[];
  summary: DashboardSummary;
}

function formatGenreLabel(genre: Genre): string {
  return genre
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function computeDayIntoCampaign(releaseDate: string): number | null {
  const release = new Date(`${releaseDate}T00:00:00`);
  if (Number.isNaN(release.getTime())) {
    return null;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const dayIntoCampaign =
    Math.floor((today.getTime() - release.getTime()) / 86_400_000) + 1;

  if (dayIntoCampaign < 1) {
    return null;
  }

  return Math.min(dayIntoCampaign, 28);
}

function mostSevereFlagType(flags: readonly ReleaseFlag[]): FlagType | null {
  if (flags.length === 0) {
    return null;
  }

  return flags.reduce(
    (mostSevere, flag) =>
      FLAG_SEVERITY[flag.type] < FLAG_SEVERITY[mostSevere.type] ? flag : mostSevere,
    flags[0],
  ).type;
}

function latestDailyDataRecordedAt(
  dailyData: DailyDataPoint[],
): string | null {
  let latest: string | null = null;

  for (const row of dailyData) {
    if (latest == null || row.recorded_at.localeCompare(latest) > 0) {
      latest = row.recorded_at;
    }
  }

  return latest;
}

function formatRecentFlagTimestamp(isoTimestamp: string): string {
  const date = new Date(isoTimestamp);
  if (Number.isNaN(date.getTime())) {
    return isoTimestamp;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function buildMonitoringForRelease(
  release: ReleaseRecord,
  dailyData: DailyDataPoint[],
): MonitoringSummary {
  const locked = {
    streams: release.locked_forecast_streams,
    saves: release.locked_forecast_saves,
  };

  if (dailyData.length === 0) {
    return emptyMonitoringSummary(locked);
  }

  const inputs = releaseRowToForecastInputs(release);
  return computeMonitoringSummary(release, inputs, dailyData, locked);
}

function buildDashboardRow(
  release: ReleaseRecord,
  dailyData: DailyDataPoint[],
): DashboardRow {
  const monitoring = buildMonitoringForRelease(release, dailyData);
  const { health } = monitoring;
  const inputs = releaseRowToForecastInputs(release);
  const locked = {
    streams: release.locked_forecast_streams,
    saves: release.locked_forecast_saves,
  };
  const flags =
    dailyData.length === 0
      ? []
      : computeFlagsForRelease(release, inputs, dailyData, locked, monitoring);

  const tierLabel = EDITORIAL_TIER_DEFINITIONS[release.editorial_tier].label;

  return {
    id: release.id,
    trackName: release.track_name,
    artistName: release.artist_name,
    genre: release.genre,
    genreDisplay: formatGenreLabel(release.genre),
    editorialTier: release.editorial_tier,
    editorialTierDisplay: `Tier ${release.editorial_tier} (${tierLabel})`,
    releaseDate: release.release_date,
    dayIntoCampaign: computeDayIntoCampaign(release.release_date),
    healthStatus: health.status,
    healthTone: health.tone,
    projectedWk1: health.projectedWk1,
    lockedWk1: health.lockedWk1,
    projectedDeltaPct: health.deltaPct,
    projectedDeltaTone: deltaTone(health.deltaPct),
    flagCount: flags.length,
    mostSevereFlagType: mostSevereFlagType(flags),
    detailHref: `/release/${release.id}`,
  };
}

/**
 * v1 proxy: flags have no persisted firing timestamp. A flag is treated as
 * "recent" when the release's latest daily_data.recorded_at falls within the
 * last 24 hours — i.e. data was entered recently, not when the condition first
 * became true. Replace with explicit flag history if/when that exists.
 */
function buildRecentFlags(
  releases: ReleaseRecord[],
  dailyDataByReleaseId: Map<string, DailyDataPoint[]>,
  now: Date,
): RecentFlag[] {
  const cutoffMs = now.getTime() - RECENT_FLAG_WINDOW_MS;
  const recent: RecentFlag[] = [];

  for (const release of releases) {
    const dailyData = dailyDataByReleaseId.get(release.id) ?? [];
    if (dailyData.length === 0) {
      continue;
    }

    const latestRecordedAt = latestDailyDataRecordedAt(dailyData);
    if (latestRecordedAt == null) {
      continue;
    }

    const latestMs = new Date(latestRecordedAt).getTime();
    if (Number.isNaN(latestMs) || latestMs < cutoffMs) {
      continue;
    }

    const monitoring = buildMonitoringForRelease(release, dailyData);
    const inputs = releaseRowToForecastInputs(release);
    const locked = {
      streams: release.locked_forecast_streams,
      saves: release.locked_forecast_saves,
    };
    const flags = computeFlagsForRelease(
      release,
      inputs,
      dailyData,
      locked,
      monitoring,
    );

    for (const flag of flags) {
      recent.push({
        releaseId: release.id,
        trackName: release.track_name,
        artistName: release.artist_name,
        flag,
        firedAt: latestRecordedAt,
        firedAtDisplay: formatRecentFlagTimestamp(latestRecordedAt),
      });
    }
  }

  recent.sort((a, b) => {
    const severityDiff =
      FLAG_SEVERITY[a.flag.type] - FLAG_SEVERITY[b.flag.type];
    if (severityDiff !== 0) {
      return severityDiff;
    }
    return b.firedAt.localeCompare(a.firedAt);
  });

  return recent.slice(0, 5);
}

function buildHealthDistribution(rows: DashboardRow[]): HealthDistribution {
  const distribution: HealthDistribution = {
    onTrack: 0,
    lagging: 0,
    outperforming: 0,
    awaiting: 0,
  };

  for (const row of rows) {
    switch (row.healthStatus) {
      case "on-track":
        distribution.onTrack += 1;
        break;
      case "lagging":
        distribution.lagging += 1;
        break;
      case "outperforming":
        distribution.outperforming += 1;
        break;
      case "awaiting":
        distribution.awaiting += 1;
        break;
    }
  }

  return distribution;
}

/** Pure assembly of dashboard list state from active releases + daily_data. */
export function buildDashboardViewModel(
  releases: ReleaseRecord[],
  dailyDataByReleaseId: Map<string, DailyDataPoint[]>,
  options?: { now?: Date },
): DashboardViewModel {
  const now = options?.now ?? new Date();
  const rows = releases.map((release) =>
    buildDashboardRow(
      release,
      dailyDataByReleaseId.get(release.id) ?? [],
    ),
  );

  const totalFlags = rows.reduce((sum, row) => sum + row.flagCount, 0);

  return {
    rows,
    summary: {
      totalActive: rows.length,
      healthDistribution: buildHealthDistribution(rows),
      totalFlags,
      recentFlags: buildRecentFlags(releases, dailyDataByReleaseId, now),
    },
  };
}
