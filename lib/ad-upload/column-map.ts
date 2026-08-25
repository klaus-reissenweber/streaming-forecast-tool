/**
 * Canonical upload fields ↔ ad_* table columns.
 *
 * Completeness checks operate on CanonicalRow (canonical names).
 * Upsert payloads must use DB column names — especially:
 *   attributed_streams → est_attributed_streams (Spotify) / linkfire_streams (Meta)
 *   spend → spend_usd
 *   clicks → link_clicks (Meta only)
 *   streams_per_listener → streams_per_listener (Spotify; independent of attributed)
 *   linkfire_visits / linkfire_spotify_clicks → same DB names (Meta)
 */

import { classifyMetaSurfaceFromCtr } from "@/lib/ad-campaign-surface";
import type {
  AdUploadPlatform,
  CanonicalField,
  CanonicalRow,
} from "@/lib/ad-upload/canonical";

/** Spotify DB columns written from a canonical row. */
export const SPOTIFY_DB_COLUMNS = {
  artist: "artist",
  release_key: "release_key",
  format: "surface",
  spend: "spend_usd",
  reach: "reach",
  clicks: "clicks",
  linkfire_visits: null,
  linkfire_spotify_clicks: null,
  converted_listeners: "converted_listeners",
  attributed_streams: "est_attributed_streams",
  streams_per_listener: "streams_per_listener",
  saves: "saves",
  start_date: "start_date",
  end_date: "end_date",
  campaign_name: null, // not a Spotify column; used only for campaign_uid identity
  impressions: null,
  objective: null,
} as const satisfies Record<CanonicalField, string | null>;

/** Meta DB columns written from a canonical row. */
export const META_DB_COLUMNS = {
  artist: null,
  release_key: "release_key",
  format: null,
  spend: "spend_usd",
  reach: "reach",
  clicks: "link_clicks",
  linkfire_visits: "linkfire_visits",
  linkfire_spotify_clicks: "linkfire_spotify_clicks",
  converted_listeners: null,
  // Partner-reported / Linkfire streams for report override (not global SPL fit).
  attributed_streams: "linkfire_streams",
  streams_per_listener: null,
  saves: null,
  start_date: "start_date",
  end_date: "end_date",
  campaign_name: "campaign_name",
  impressions: "impressions",
  objective: "objective",
} as const satisfies Record<CanonicalField, string | null>;

/**
 * Source/header aliases that are DB names or near-DB names — coerce to canonical
 * so AI/profile mappings don't silently drop values in applyMapping.
 */
const DB_OR_ALIAS_TO_CANONICAL: Record<string, CanonicalField> = {
  attributed_streams: "attributed_streams",
  est_attributed_streams: "attributed_streams",
  est_streams: "attributed_streams",
  linkfire_streams: "attributed_streams",
  streams: "attributed_streams",
  spend: "spend",
  spend_usd: "spend",
  amount_spent: "spend",
  converted_listeners: "converted_listeners",
  link_clicks: "clicks",
  clicks: "clicks",
  impressions: "impressions",
  reach: "reach",
  linkfire_visits: "linkfire_visits",
  linkfire_spotify_clicks: "linkfire_spotify_clicks",
  spotify_clicks: "linkfire_spotify_clicks",
  streams_per_listener: "streams_per_listener",
  active_streams_per_listener: "streams_per_listener",
  saves: "saves",
  campaign_name: "campaign_name",
  campaign: "campaign_name",
  start_date: "start_date",
  end_date: "end_date",
  format: "format",
  surface: "format",
  objective: "objective",
  artist: "artist",
  release_key: "release_key",
};

export function normalizeToCanonicalField(
  raw: string | null | undefined,
): CanonicalField | null {
  if (raw == null) return null;
  const key = String(raw)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
  if (!key) return null;
  return DB_OR_ALIAS_TO_CANONICAL[key] ?? null;
}

/** Build Spotify upsert row from canonical fields (DB column names only). */
export function canonicalToSpotifyDbRow(
  row: CanonicalRow,
  extras: {
    campaign_uid: string;
    usable_for_modeling: boolean;
    exclusion_reason: string | null;
    derived_fields: string[];
    source_partner: string | null;
  },
): Record<string, unknown> {
  // Do NOT derive est_attributed_streams from converted_listeners × SPL.
  // Both may be present; attributed streams stay observed.
  const dbRow: Record<string, unknown> = {
    artist: row.artist,
    release_key: row.release_key,
    campaign_uid: extras.campaign_uid,
    [SPOTIFY_DB_COLUMNS.format]: row.format,
    [SPOTIFY_DB_COLUMNS.spend]: row.spend,
    [SPOTIFY_DB_COLUMNS.reach]: row.reach,
    [SPOTIFY_DB_COLUMNS.clicks]: row.clicks,
    [SPOTIFY_DB_COLUMNS.converted_listeners]: row.converted_listeners,
    [SPOTIFY_DB_COLUMNS.attributed_streams]: row.attributed_streams,
    [SPOTIFY_DB_COLUMNS.streams_per_listener!]: row.streams_per_listener,
    [SPOTIFY_DB_COLUMNS.saves!]: row.saves,
    start_date: row.start_date,
    end_date: row.end_date,
    usable_for_modeling: extras.usable_for_modeling,
    exclusion_reason: extras.exclusion_reason,
    derived_fields: extras.derived_fields,
    source_partner: extras.source_partner,
  };
  // Keep legacy column in sync only when a new SPL value is provided.
  if (row.streams_per_listener != null) {
    dbRow.active_streams_per_listener = row.streams_per_listener;
  }
  return dbRow;
}

/** Build Meta upsert row from canonical fields (DB column names only). */
export function canonicalToMetaDbRow(
  row: CanonicalRow,
  extras: {
    campaign_uid: string;
    objective: string;
    derived_fields: string[];
    source_partner: string | null;
  },
): Record<string, unknown> {
  const classified = classifyMetaSurfaceFromCtr(row.clicks, row.impressions);
  return {
    release_key: row.release_key,
    campaign_uid: extras.campaign_uid,
    campaign_name: row.campaign_name,
    objective: extras.objective,
    [META_DB_COLUMNS.spend]: row.spend,
    [META_DB_COLUMNS.clicks]: row.clicks,
    [META_DB_COLUMNS.impressions]: row.impressions,
    [META_DB_COLUMNS.reach]: row.reach,
    [META_DB_COLUMNS.linkfire_visits!]: row.linkfire_visits,
    [META_DB_COLUMNS.linkfire_spotify_clicks!]: row.linkfire_spotify_clicks,
    [META_DB_COLUMNS.attributed_streams!]: row.attributed_streams,
    start_date: row.start_date,
    end_date: row.end_date,
    derived_fields: extras.derived_fields,
    source_partner: extras.source_partner,
    surface: classified.surface,
    surface_source: classified.source,
  };
}

/**
 * After building a Spotify DB payload, verify required DB columns are present.
 * Write path only requires identity + spend; model completeness is separate.
 */
export function spotifyDbPayloadRejectReason(
  dbRow: Record<string, unknown>,
): string | null {
  const missing: string[] = [];
  if (dbRow.artist == null || String(dbRow.artist).trim() === "") {
    missing.push("artist");
  }
  if (dbRow.release_key == null || String(dbRow.release_key).trim() === "") {
    missing.push("release_key");
  }
  if (dbRow.surface !== "marquee" && dbRow.surface !== "showcase") {
    missing.push("surface");
  }
  const spend = Number(dbRow.spend_usd);
  if (!(spend > 0)) missing.push("spend_usd");
  if ("attributed_streams" in dbRow) {
    return "payload has attributed_streams (use est_attributed_streams)";
  }
  if (missing.length === 0) return null;
  return `missing ${missing.join(", ")}`;
}

/** Map a DB Spotify row back into canonical fields (for read/verify). */
export function spotifyDbRowToCanonical(
  dbRow: Record<string, unknown>,
  sourceRowIndex = 0,
): Pick<
  CanonicalRow,
  | "spend"
  | "reach"
  | "clicks"
  | "converted_listeners"
  | "attributed_streams"
  | "streams_per_listener"
  | "saves"
  | "format"
  | "artist"
  | "release_key"
  | "start_date"
  | "end_date"
  | "source_row_index"
> {
  const formatRaw = String(dbRow.surface ?? "");
  return {
    spend: numOrNull(dbRow.spend_usd),
    reach: numOrNull(dbRow.reach),
    clicks: numOrNull(dbRow.clicks),
    converted_listeners: numOrNull(dbRow.converted_listeners),
    attributed_streams: numOrNull(dbRow.est_attributed_streams),
    streams_per_listener:
      numOrNull(dbRow.streams_per_listener) ??
      numOrNull(dbRow.active_streams_per_listener),
    saves: numOrNull(dbRow.saves),
    format:
      formatRaw === "marquee" || formatRaw === "showcase" ? formatRaw : null,
    artist: strOrNull(dbRow.artist),
    release_key: strOrNull(dbRow.release_key),
    start_date: strOrNull(dbRow.start_date),
    end_date: strOrNull(dbRow.end_date),
    source_row_index: sourceRowIndex,
  };
}

function numOrNull(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function strOrNull(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s || null;
}

export function dbColumnsForPlatform(
  platform: AdUploadPlatform,
): Record<CanonicalField, string | null> {
  if (platform === "meta") return { ...META_DB_COLUMNS };
  return { ...SPOTIFY_DB_COLUMNS };
}
