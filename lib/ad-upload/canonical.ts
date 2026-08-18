/**
 * Canonical target schema for partner ad-result uploads.
 * Everything maps into these fields before gap-fill + upsert.
 *
 * Upload surface (all optional except spend):
 *   Meta:     spend, impressions, clicks,
 *             linkfire_visits, linkfire_spotify_clicks
 *             (attributed_streams optional on file upload only → linkfire_streams)
 *   Spotify:  spend, reach, clicks, converted_listeners,
 *             attributed_streams (→ est_attributed_streams), saves,
 *             streams_per_listener (optional; independent of attributed_streams)
 * Completeness for usable_for_modeling is enforced separately in gap-fill.
 */

export const CANONICAL_FIELDS = [
  "spend",
  "impressions",
  "reach",
  "clicks",
  "linkfire_visits",
  "linkfire_spotify_clicks",
  "converted_listeners",
  "attributed_streams",
  "streams_per_listener",
  "saves",
  "format",
  "objective",
  "campaign_name",
  "start_date",
  "end_date",
  "artist",
  "release_key",
] as const;

export type CanonicalField = (typeof CANONICAL_FIELDS)[number];

/** Fields shown as primary upload targets (platform-filtered in the wizard). */
export const META_UPLOAD_FIELDS = [
  "spend",
  "impressions",
  "clicks",
  "linkfire_visits",
  "linkfire_spotify_clicks",
] as const satisfies readonly CanonicalField[];

export const SPOTIFY_UPLOAD_FIELDS = [
  "spend",
  "reach",
  "clicks",
  "converted_listeners",
  "attributed_streams",
  "saves",
  "streams_per_listener",
] as const satisfies readonly CanonicalField[];

export type AdUploadPlatform = "spotify" | "meta" | "unknown";

export type AdUploadFormat = "marquee" | "showcase";

export type AdUploadObjective = "awareness" | "traffic" | "streaming";

/** File-level constants the sheet may not state. */
export type AdUploadFileConstants = {
  partnerLabel: string;
  platform: AdUploadPlatform;
  format: AdUploadFormat | null;
  objective: AdUploadObjective | null;
  artist: string | null;
  releaseKey: string | null;
};

/** source column name → canonical field (or null = ignore). */
export type AdUploadColumnMappings = Record<string, CanonicalField | null>;

export type CanonicalRow = {
  spend: number | null;
  impressions: number | null;
  reach: number | null;
  clicks: number | null;
  linkfire_visits: number | null;
  linkfire_spotify_clicks: number | null;
  converted_listeners: number | null;
  attributed_streams: number | null;
  streams_per_listener: number | null;
  saves: number | null;
  format: AdUploadFormat | null;
  objective: AdUploadObjective | null;
  campaign_name: string | null;
  start_date: string | null;
  end_date: string | null;
  artist: string | null;
  release_key: string | null;
  /**
   * When set, upsert uses this identity instead of re-hashing name/dates.
   * Manual edit of an existing campaign must pass the stored uid.
   */
  campaign_uid?: string | null;
  /** Fields filled by benchmark (not observed). */
  derived_fields: CanonicalField[];
  /** Ready for model fit after gap-fill. */
  usable_for_modeling: boolean;
  /** Skip → report-only (not usable). */
  skipped: boolean;
  source_row_index: number;
};

export type ParsedTable = {
  headers: string[];
  /** Raw string cells per row (aligned to headers). */
  rows: string[][];
  sourceKind: "csv" | "xlsx" | "pdf" | "image";
  warnings: string[];
};

export function emptyCanonicalRow(sourceRowIndex: number): CanonicalRow {
  return {
    spend: null,
    impressions: null,
    reach: null,
    clicks: null,
    linkfire_visits: null,
    linkfire_spotify_clicks: null,
    converted_listeners: null,
    attributed_streams: null,
    streams_per_listener: null,
    saves: null,
    format: null,
    objective: null,
    campaign_name: null,
    start_date: null,
    end_date: null,
    artist: null,
    release_key: null,
    campaign_uid: null,
    derived_fields: [],
    usable_for_modeling: false,
    skipped: false,
    source_row_index: sourceRowIndex,
  };
}

export function normalizePartnerKey(label: string): string {
  return label
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

/** Slug release_key from track name (seed-style). */
export function releaseKeyFromTrackName(trackName: string): string {
  return trackName
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 120);
}
