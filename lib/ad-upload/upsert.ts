/**
 * Upsert normalized canonical rows into ad_spotify_campaigns / ad_meta_campaigns.
 *
 * Conflict targets must match table unique constraints:
 * - ad_spotify_campaigns: unique (campaign_uid, surface)
 * - ad_meta_campaigns: unique (campaign_uid) when migrated; else unique (release_key)
 */

import { createHash } from "node:crypto";
import type {
  AdUploadPlatform,
  CanonicalRow,
} from "@/lib/ad-upload/canonical";
import type { UpsertedCampaignRef } from "@/lib/ad-upload/campaign-ref";
import {
  canonicalToMetaDbRow,
  canonicalToSpotifyDbRow,
  spotifyDbPayloadRejectReason,
} from "@/lib/ad-upload/column-map";
import { spotifyRowRejectReason } from "@/lib/ad-upload/gap-fill";
import { readableCampaignName } from "@/lib/campaign-display-name";
import { createServiceClient } from "@/lib/supabase/service";

export type { UpsertedCampaignRef };

/** Stable hash for synthetic ids (not format-scoped for Spotify). */
export function campaignUid(parts: Array<string | null | undefined>): string {
  const basis = parts.map((p) => (p ?? "").trim().toLowerCase()).join("|");
  return createHash("sha256").update(basis).digest("hex").slice(0, 32);
}

/**
 * Spotify campaign_uid is shared across formats for the same campaign so
 * Marquee + Showcase persist as two rows under unique (campaign_uid, surface).
 * Do not include format or spend in the identity.
 */
export function spotifyCampaignUid(row: {
  release_key: string;
  campaign_name: string | null;
  start_date: string | null;
  end_date: string | null;
}): string {
  if (row.campaign_name?.trim()) {
    return campaignUid([
      "spotify",
      row.release_key,
      row.campaign_name,
      row.start_date,
      row.end_date,
    ]);
  }
  return campaignUid([
    "spotify",
    row.release_key,
    row.start_date,
    row.end_date,
  ]);
}

export function metaCampaignUid(row: {
  release_key: string;
  objective: string;
  campaign_name: string | null;
  start_date: string | null;
  end_date: string | null;
}): string {
  return campaignUid([
    "meta",
    row.release_key,
    row.objective,
    row.campaign_name,
    row.start_date,
    row.end_date,
  ]);
}

export function toSpotifyRow(
  row: CanonicalRow,
  sourcePartner: string,
): { row: Record<string, unknown>; error?: undefined } | { row?: undefined; error: string } {
  // Completeness on canonical fields first (attributed_streams, spend, …).
  const reason = spotifyRowRejectReason(row);
  if (reason === "skipped") {
    return { error: "skipped" };
  }
  if (reason) {
    return { error: reason };
  }

  const releaseKey = row.release_key!.trim();
  const uid =
    row.campaign_uid?.trim() ||
    spotifyCampaignUid({
      release_key: releaseKey,
      campaign_name: row.campaign_name,
      start_date: row.start_date,
      end_date: row.end_date,
    });

  // Canonical → DB column names (attributed_streams → est_attributed_streams).
  const dbRow = canonicalToSpotifyDbRow(row, {
    campaign_uid: uid,
    usable_for_modeling: row.usable_for_modeling && !row.skipped,
    exclusion_reason: row.usable_for_modeling
      ? null
      : "incomplete_model_fields",
    derived_fields: row.derived_fields,
    source_partner: sourcePartner || null,
  });

  // Second gate: real DB column names must be populated (catches name drift).
  const dbReason = spotifyDbPayloadRejectReason(dbRow);
  if (dbReason) {
    return { error: dbReason };
  }

  return { row: dbRow };
}

export function toMetaRow(
  row: CanonicalRow,
  sourcePartner: string,
): Record<string, unknown> | null {
  const releaseKey = row.release_key?.trim();
  if (!releaseKey) return null;
  if (row.spend == null || !(row.spend > 0)) return null;

  const objective = row.objective ?? "traffic";
  const uid =
    row.campaign_uid?.trim() ||
    metaCampaignUid({
      release_key: releaseKey,
      objective,
      campaign_name: row.campaign_name,
      start_date: row.start_date,
      end_date: row.end_date,
    });

  return canonicalToMetaDbRow(row, {
    campaign_uid: uid,
    objective,
    derived_fields: row.derived_fields,
    source_partner: sourcePartner || null,
  });
}

export type UpsertAdUploadResult = {
  spotifyUpserted: number;
  metaUpserted: number;
  skipped: number;
  errors: string[];
  campaigns: UpsertedCampaignRef[];
};

const SPOTIFY_OPTIONAL_COLS = [
  "derived_fields",
  "source_partner",
  "saves",
  "streams_per_listener",
  "active_streams_per_listener",
  "release_format",
] as const;

function stripCols(
  rows: Record<string, unknown>[],
  cols: readonly string[],
): Record<string, unknown>[] {
  return rows.map((row) => {
    const next = { ...row };
    for (const col of cols) delete next[col];
    return next;
  });
}

/**
 * Upsert Spotify rows on unique (campaign_uid, surface).
 * Strips optional provenance columns when the DB is pre-migration.
 */
async function upsertSpotifyRows(
  sb: ReturnType<typeof createServiceClient>,
  rows: Record<string, unknown>[],
): Promise<{ count: number; error: string | null }> {
  let payload = rows;
  for (let attempt = 0; attempt < 4; attempt++) {
    const { error, count } = await sb.from("ad_spotify_campaigns").upsert(
      payload,
      // Must match unique (campaign_uid, surface) — campaign_uid alone will error.
      { onConflict: "campaign_uid,surface", count: "exact" },
    );
    if (!error) {
      return { count: count ?? payload.length, error: null };
    }
    const missing = SPOTIFY_OPTIONAL_COLS.filter((col) =>
      error.message.includes(`'${col}'`),
    );
    if (missing.length > 0) {
      payload = stripCols(payload, missing);
      continue;
    }
    return { count: 0, error: error.message };
  }
  return { count: 0, error: "Spotify upsert failed after column stripping" };
}

/**
 * Result-indicator rows (surface_source = imported) win over the CTR heuristic
 * on re-upsert. Missing columns (pre-migration) are ignored.
 */
async function restoreImportedMetaSurface(
  sb: ReturnType<typeof createServiceClient>,
  rows: Record<string, unknown>[],
): Promise<Record<string, unknown>[]> {
  const uids = [
    ...new Set(
      rows
        .map((row) =>
          typeof row.campaign_uid === "string" ? row.campaign_uid.trim() : "",
        )
        .filter(Boolean),
    ),
  ];
  if (uids.length === 0) return rows;
  const { data, error } = await sb
    .from("ad_meta_campaigns")
    .select("campaign_uid, surface, surface_source")
    .in("campaign_uid", uids)
    .eq("surface_source", "imported");
  if (error || !data?.length) return rows;
  const imported = new Map(
    data.map((row) => [String(row.campaign_uid), row] as const),
  );
  return rows.map((row) => {
    const existing = imported.get(String(row.campaign_uid ?? ""));
    if (!existing) return row;
    return {
      ...row,
      surface: existing.surface,
      surface_source: "imported",
    };
  });
}

export async function upsertCanonicalRows(options: {
  rows: CanonicalRow[];
  platform: AdUploadPlatform;
  sourcePartner: string;
}): Promise<UpsertAdUploadResult> {
  const sb = createServiceClient();
  const errors: string[] = [];
  let spotifyUpserted = 0;
  let metaUpserted = 0;
  let skipped = 0;

  const spotifyRows: Record<string, unknown>[] = [];
  const metaRows: Record<string, unknown>[] = [];
  const campaigns: UpsertedCampaignRef[] = [];

  for (const row of options.rows) {
    if (row.skipped) {
      skipped += 1;
      continue;
    }
    const platform =
      options.platform !== "unknown"
        ? options.platform
        : row.format
          ? "spotify"
          : "meta";

    const displayRow = row.source_row_index + 1;
    if (platform === "spotify") {
      const mapped = toSpotifyRow(row, options.sourcePartner);
      if (!mapped.row) {
        if (mapped.error && mapped.error !== "skipped") {
          errors.push(
            `Row ${displayRow}: incomplete Spotify row (${mapped.error})`,
          );
        }
        continue;
      }
      spotifyRows.push(mapped.row);
      campaigns.push({
        campaignUid: String(mapped.row.campaign_uid),
        platform: "spotify",
        campaignName: readableCampaignName({
          campaignName: row.campaign_name,
          campaignUid: String(mapped.row.campaign_uid),
          platform: "spotify",
          format: row.format,
        }),
        format: row.format,
        objective: null,
      });
    } else {
      const mapped = toMetaRow(row, options.sourcePartner);
      if (!mapped) {
        errors.push(
          `Row ${displayRow}: incomplete Meta row (need release_key + spend)`,
        );
        continue;
      }
      metaRows.push(mapped);
      campaigns.push({
        campaignUid: String(mapped.campaign_uid),
        platform: "meta",
        campaignName: readableCampaignName({
          campaignName: row.campaign_name,
          campaignUid: String(mapped.campaign_uid),
          platform: "meta",
          objective: row.objective,
        }),
        format: null,
        objective: row.objective,
      });
    }
  }

  if (spotifyRows.length > 0) {
    const spotifyResult = await upsertSpotifyRows(sb, spotifyRows);
    if (spotifyResult.error) {
      errors.push(`Spotify upsert: ${spotifyResult.error}`);
    } else {
      spotifyUpserted = spotifyResult.count;
    }
  }

  if (metaRows.length > 0) {
    let payload = await restoreImportedMetaSurface(sb, metaRows);
    let wrote = false;
    for (let attempt = 0; attempt < 5; attempt++) {
      const { error, count } = await sb.from("ad_meta_campaigns").upsert(
        payload,
        // Matches unique (campaign_uid) from migration 202608050003.
        { onConflict: "campaign_uid", count: "exact" },
      );
      if (!error) {
        metaUpserted = count ?? payload.length;
        wrote = true;
        break;
      }
      const stripable = [
        "linkfire_spotify_clicks",
        "linkfire_visits",
        "linkfire_streams",
        "derived_fields",
        "source_partner",
        "impressions",
        "campaign_uid",
        "surface",
        "surface_source",
        "market",
      ].filter((col) => error.message.includes(`'${col}'`));
      if (stripable.length > 0) {
        payload = stripCols(payload, stripable);
        continue;
      }
      // Pre-migration: campaign_uid may not exist — fall back to release_key.
      if (
        error.message.includes("campaign_uid") ||
        error.message.includes("no unique") ||
        error.message.includes("unique or exclusion")
      ) {
        const legacy = payload.map((r) => {
          const copy = { ...r };
          delete copy.campaign_uid;
          delete copy.derived_fields;
          delete copy.source_partner;
          delete copy.impressions;
          delete copy.linkfire_spotify_clicks;
          delete copy.surface;
          delete copy.surface_source;
          delete copy.market;
          return copy;
        });
        const retry = await sb
          .from("ad_meta_campaigns")
          .upsert(legacy, { onConflict: "release_key", count: "exact" });
        if (retry.error) {
          errors.push(`Meta upsert: ${retry.error.message}`);
        } else {
          metaUpserted = retry.count ?? legacy.length;
          errors.push(
            "Meta wrote via legacy release_key key — apply migration 202608050003 for campaign_uid upserts.",
          );
          wrote = true;
        }
        break;
      }
      errors.push(`Meta upsert: ${error.message}`);
      break;
    }
    if (!wrote && errors.length === 0) {
      errors.push("Meta upsert failed after column stripping");
    }
  }

  return { spotifyUpserted, metaUpserted, skipped, errors, campaigns };
}
