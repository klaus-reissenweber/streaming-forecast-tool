import {
  GENRES,
  META_OBJECTIVES,
  RELEASE_TYPES,
  SPOTIFY_FORMATS,
} from "@/lib/constants";
import type {
  EditorialTier,
  Genre,
  MetaObjective,
  ReleaseForecastInputs,
  ReleaseType,
  SpotifyFormat,
} from "@/lib/forecast";

export type ReleaseStatus = "active" | "closed";

/** Row shape returned by Supabase `releases` select (snake_case). */
export interface ReleaseRow {
  id: string;
  track_name: string;
  artist_name: string;
  genre: string;
  monthly_listeners: number | string;
  is_feature: boolean;
  editorial_tier: number;
  release_date: string;
  release_type: string;
  spotify_format: string;
  meta_spend_planned: number | string;
  meta_objective: string;
  spotify_spend_planned: number | string;
  locked_forecast_streams: number;
  locked_forecast_saves: number;
  model_version_used: string;
  status: string;
  created_at: string;
  closed_at: string | null;
}

/** Validated release row used by the release detail view and forecast mapping. */
export type ReleaseRecord = Omit<
  ReleaseRow,
  | "genre"
  | "editorial_tier"
  | "release_type"
  | "spotify_format"
  | "meta_objective"
  | "status"
  | "monthly_listeners"
  | "meta_spend_planned"
  | "spotify_spend_planned"
> & {
  genre: Genre;
  editorial_tier: EditorialTier;
  release_type: ReleaseType;
  spotify_format: SpotifyFormat;
  meta_objective: MetaObjective;
  status: ReleaseStatus;
  monthly_listeners: number;
  meta_spend_planned: number;
  spotify_spend_planned: number;
};

/** Row shape returned by Supabase `daily_data` select. */
export interface DailyDataRow {
  id: string;
  release_id: string;
  day_number: number;
  streams: number;
  saves: number;
  other_pct: number | null;
  recorded_at: string;
}

/** Validated daily data point (day 1–28). */
export type DailyDataPoint = DailyDataRow;

export class ReleaseRowParseError extends Error {
  readonly releaseId: string | undefined;

  constructor(message: string, releaseId?: string) {
    super(message);
    this.name = "ReleaseRowParseError";
    this.releaseId = releaseId;
  }
}

export class DailyDataRowParseError extends Error {
  readonly releaseId: string | undefined;

  constructor(message: string, releaseId?: string) {
    super(message);
    this.name = "DailyDataRowParseError";
    this.releaseId = releaseId;
  }
}

const EDITORIAL_TIERS: EditorialTier[] = [0, 1, 2, 3];

const RELEASE_SELECT_COLUMNS = [
  "id",
  "track_name",
  "artist_name",
  "genre",
  "monthly_listeners",
  "is_feature",
  "editorial_tier",
  "release_date",
  "release_type",
  "spotify_format",
  "meta_spend_planned",
  "meta_objective",
  "spotify_spend_planned",
  "locked_forecast_streams",
  "locked_forecast_saves",
  "model_version_used",
  "status",
  "created_at",
  "closed_at",
].join(", ");

const DAILY_DATA_SELECT_COLUMNS = [
  "id",
  "release_id",
  "day_number",
  "streams",
  "saves",
  "other_pct",
  "recorded_at",
].join(", ");

export { RELEASE_SELECT_COLUMNS, DAILY_DATA_SELECT_COLUMNS };

function parseRequiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${field} must be a non-empty string.`);
  }
  return value;
}

function parseInteger(
  value: unknown,
  field: string,
  options?: { min?: number },
): number {
  let numeric: number;

  if (typeof value === "number") {
    numeric = value;
  } else if (typeof value === "string" && value.trim() !== "") {
    numeric = Number(value);
  } else {
    throw new Error(`${field} must be a number.`);
  }

  if (!Number.isFinite(numeric) || !Number.isInteger(numeric)) {
    throw new Error(`${field} must be a whole number.`);
  }

  if (options?.min !== undefined && numeric < options.min) {
    throw new Error(`${field} must be at least ${options.min}.`);
  }

  return numeric;
}

function parseNumeric(
  value: unknown,
  field: string,
  options?: { min?: number },
): number {
  let numeric: number;

  if (typeof value === "number") {
    numeric = value;
  } else if (typeof value === "string" && value.trim() !== "") {
    numeric = Number(value);
  } else {
    throw new Error(`${field} must be a number.`);
  }

  if (!Number.isFinite(numeric)) {
    throw new Error(`${field} must be a finite number.`);
  }

  if (options?.min !== undefined && numeric < options.min) {
    throw new Error(`${field} must be at least ${options.min}.`);
  }

  return numeric;
}

function parseEnum<T extends string>(
  value: unknown,
  field: string,
  allowed: readonly T[],
): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new Error(`${field} has an invalid value.`);
  }
  return value as T;
}

function parseEditorialTier(value: unknown): EditorialTier {
  const tier = parseInteger(value, "editorial_tier", { min: 0 });
  if (!EDITORIAL_TIERS.includes(tier as EditorialTier)) {
    throw new Error("editorial_tier must be 0–3.");
  }
  return tier as EditorialTier;
}

function parseNullableTimestamp(value: unknown, field: string): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  return parseRequiredString(value, field);
}

/** Validates and narrows a Supabase release row. Throws `ReleaseRowParseError` on failure. */
export function parseReleaseRow(row: ReleaseRow): ReleaseRecord {
  const releaseId = typeof row.id === "string" ? row.id : undefined;

  try {
    return {
      id: parseRequiredString(row.id, "id"),
      track_name: parseRequiredString(row.track_name, "track_name"),
      artist_name: parseRequiredString(row.artist_name, "artist_name"),
      genre: parseEnum(row.genre, "genre", GENRES),
      monthly_listeners: parseInteger(row.monthly_listeners, "monthly_listeners", {
        min: 1,
      }),
      is_feature: Boolean(row.is_feature),
      editorial_tier: parseEditorialTier(row.editorial_tier),
      release_date: parseRequiredString(row.release_date, "release_date"),
      release_type: parseEnum(row.release_type, "release_type", RELEASE_TYPES),
      spotify_format: parseEnum(row.spotify_format, "spotify_format", SPOTIFY_FORMATS),
      meta_spend_planned: parseNumeric(row.meta_spend_planned, "meta_spend_planned", {
        min: 0,
      }),
      meta_objective: parseEnum(row.meta_objective, "meta_objective", META_OBJECTIVES),
      spotify_spend_planned: parseNumeric(
        row.spotify_spend_planned,
        "spotify_spend_planned",
        { min: 0 },
      ),
      locked_forecast_streams: parseInteger(
        row.locked_forecast_streams,
        "locked_forecast_streams",
        { min: 0 },
      ),
      locked_forecast_saves: parseInteger(
        row.locked_forecast_saves,
        "locked_forecast_saves",
        { min: 0 },
      ),
      model_version_used: parseRequiredString(
        row.model_version_used,
        "model_version_used",
      ),
      status: parseEnum(row.status, "status", ["active", "closed"] as const),
      created_at: parseRequiredString(row.created_at, "created_at"),
      closed_at: parseNullableTimestamp(row.closed_at, "closed_at"),
    };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Invalid release row.";
    throw new ReleaseRowParseError(message, releaseId);
  }
}

/** Validates and narrows a Supabase daily_data row. Throws `DailyDataRowParseError` on failure. */
export function parseDailyDataRow(row: DailyDataRow): DailyDataPoint {
  const releaseId =
    typeof row.release_id === "string" ? row.release_id : undefined;

  try {
    const dayNumber = parseInteger(row.day_number, "day_number", { min: 1 });
    if (dayNumber > 28) {
      throw new Error("day_number must be 1–28.");
    }

    let otherPct: number | null = null;
    if (row.other_pct !== null && row.other_pct !== undefined) {
      otherPct = parseNumeric(row.other_pct, "other_pct", { min: 0 });
      if (otherPct > 100) {
        throw new Error("other_pct must be between 0 and 100.");
      }
    }

    return {
      id: parseRequiredString(row.id, "id"),
      release_id: parseRequiredString(row.release_id, "release_id"),
      day_number: dayNumber,
      streams: parseInteger(row.streams, "streams", { min: 0 }),
      saves: parseInteger(row.saves, "saves", { min: 0 }),
      other_pct: otherPct,
      recorded_at: parseRequiredString(row.recorded_at, "recorded_at"),
    };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Invalid daily_data row.";
    throw new DailyDataRowParseError(message, releaseId);
  }
}

/** Maps a validated release row to forecast math inputs (camelCase). */
export function releaseRowToForecastInputs(
  record: ReleaseRecord,
): ReleaseForecastInputs {
  return {
    monthlyListeners: record.monthly_listeners,
    isFeature: record.is_feature,
    editorialTier: record.editorial_tier,
    genre: record.genre,
    releaseType: record.release_type,
    spotifyFormat: record.spotify_format,
    metaSpendPlanned: record.meta_spend_planned,
    metaObjective: record.meta_objective,
    spotifySpendPlanned: record.spotify_spend_planned,
  };
}
