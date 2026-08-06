/**
 * Interactive gap-fill for model-required fields.
 * Spotify: converted_listeners, attributed_streams (+ write keys: format, artist, release_key, spend)
 * Meta: clicks (link_clicks)
 * Benchmarks use active ad_model CPL / SPL.
 */

import { resolveSpl } from "@/lib/ad-forecast";
import type {
  AdUploadFormat,
  AdUploadPlatform,
  CanonicalField,
  CanonicalRow,
} from "@/lib/ad-upload/canonical";
import type { AdModel } from "@/lib/model/ad-model";
import type { Genre } from "@/lib/forecast";

export type GapFillAction =
  | { type: "skip" }
  | { type: "manual"; field: CanonicalField; value: number }
  | { type: "benchmark"; field: CanonicalField; value: number };

export type GapNeed = {
  /** 0-based index into the mapped row array (= CanonicalRow.source_row_index). */
  rowIndex: number;
  /** 1-based display number (rowIndex + 1) — same numbering as write errors. */
  displayRow: number;
  platform: AdUploadPlatform;
  missing: CanonicalField[];
  benchmarks: Partial<
    Record<
      CanonicalField,
      { value: number; label: string }
    >
  >;
};

/** Server Actions JSON-stringify object keys — accept both number and string keys. */
export function normalizeGapDecisions(
  decisions: Record<number | string, GapFillAction[]> | null | undefined,
): Record<number, GapFillAction[]> {
  const out: Record<number, GapFillAction[]> = {};
  if (!decisions) return out;
  for (const [key, actions] of Object.entries(decisions)) {
    const index = Number(key);
    if (!Number.isInteger(index) || !Array.isArray(actions)) continue;
    out[index] = actions;
  }
  return out;
}

function spotifyModelMissing(row: CanonicalRow): CanonicalField[] {
  const missing: CanonicalField[] = [];
  if (row.converted_listeners == null || !(row.converted_listeners > 0)) {
    missing.push("converted_listeners");
  }
  if (row.attributed_streams == null || !(row.attributed_streams > 0)) {
    missing.push("attributed_streams");
  }
  return missing;
}

/** Fields required to persist a Spotify row (must be gap-filled before write). */
function spotifyWriteMissing(row: CanonicalRow): CanonicalField[] {
  const missing: CanonicalField[] = [];
  if (!row.format) missing.push("format");
  if (!row.artist?.trim()) missing.push("artist");
  if (!row.release_key?.trim()) missing.push("release_key");
  if (row.spend == null || !(row.spend > 0)) missing.push("spend");
  return missing;
}

function metaMissing(row: CanonicalRow): CanonicalField[] {
  const missing: CanonicalField[] = [];
  if (!row.release_key?.trim()) missing.push("release_key");
  if (row.spend == null || !(row.spend > 0)) missing.push("spend");
  if (row.objective === "awareness") {
    if (
      !(row.impressions != null && row.impressions > 0) &&
      !(row.reach != null && row.reach > 0)
    ) {
      missing.push("impressions");
    }
  } else if (row.clicks == null || !(row.clicks > 0)) {
    missing.push("clicks");
  }
  return missing;
}

export function computeGapNeeds(
  rows: CanonicalRow[],
  platform: AdUploadPlatform,
  adModel: AdModel,
  artistName: string,
  genre: Genre,
): GapNeed[] {
  const { spl } = resolveSpl(adModel, artistName, genre);
  const needs: GapNeed[] = [];

  for (const row of rows) {
    if (row.skipped) continue;
    const missing =
      platform === "spotify"
        ? [...spotifyWriteMissing(row), ...spotifyModelMissing(row)]
        : platform === "meta"
          ? metaMissing(row)
          : [
              ...spotifyWriteMissing(row),
              ...spotifyModelMissing(row),
              ...metaMissing(row),
            ];
    // Dedupe while preserving order.
    const unique = [...new Set(missing)];
    if (unique.length === 0) continue;

    const format: AdUploadFormat = row.format ?? "marquee";
    const cpl = adModel.spotifyCpl[format];
    const benchmarks: GapNeed["benchmarks"] = {};

    if (
      unique.includes("converted_listeners") &&
      row.spend != null &&
      row.spend > 0 &&
      cpl > 0
    ) {
      benchmarks.converted_listeners = {
        value: Math.round(row.spend / cpl),
        label: `spend ÷ CPL[${format}] (${cpl.toFixed(2)})`,
      };
    }
    if (unique.includes("attributed_streams")) {
      const listeners =
        row.converted_listeners ??
        benchmarks.converted_listeners?.value ??
        null;
      if (listeners != null && listeners > 0) {
        benchmarks.attributed_streams = {
          value: Math.round(listeners * spl),
          label: `converted_listeners × SPL (${spl.toFixed(2)})`,
        };
      }
    }
    if (unique.includes("clicks") && row.spend != null && row.spend > 0) {
      const cpc = adModel.metaFunnel.cpc;
      if (cpc > 0) {
        benchmarks.clicks = {
          value: Math.round(row.spend / cpc),
          label: `spend ÷ CPC (${cpc.toFixed(2)})`,
        };
      }
    }

    needs.push({
      rowIndex: row.source_row_index,
      displayRow: row.source_row_index + 1,
      platform,
      missing: unique,
      benchmarks,
    });
  }

  return needs;
}

/** Apply gap-fill decisions; mark usable / derived / skipped. */
export function applyGapFill(
  rows: CanonicalRow[],
  platform: AdUploadPlatform,
  decisions: Record<number | string, GapFillAction[]> | null | undefined,
): CanonicalRow[] {
  const normalized = normalizeGapDecisions(decisions);

  return rows.map((row) => {
    const next: CanonicalRow = {
      ...row,
      derived_fields: [...row.derived_fields],
    };
    const actions = normalized[row.source_row_index] ?? [];

    for (const action of actions) {
      if (action.type === "skip") {
        next.skipped = true;
        next.usable_for_modeling = false;
        break;
      }
      if (action.type === "manual" || action.type === "benchmark") {
        const value = action.value;
        if (typeof value !== "number" || !Number.isFinite(value)) continue;
        // Only numeric canonical fields accept gap-fill values.
        if (
          action.field === "spend" ||
          action.field === "impressions" ||
          action.field === "reach" ||
          action.field === "clicks" ||
          action.field === "converted_listeners" ||
          action.field === "attributed_streams"
        ) {
          next[action.field] = value;
          if (
            action.type === "benchmark" &&
            !next.derived_fields.includes(action.field)
          ) {
            next.derived_fields.push(action.field);
          }
        }
      }
    }

    if (next.skipped) {
      next.usable_for_modeling = false;
      return next;
    }

    if (platform === "spotify") {
      next.usable_for_modeling =
        spotifyWriteMissing(next).length === 0 &&
        spotifyModelMissing(next).length === 0;
    } else if (platform === "meta") {
      next.usable_for_modeling = metaMissing(next).length === 0;
    } else {
      next.usable_for_modeling = false;
    }

    return next;
  });
}

/** Why a Spotify row cannot be written (for upsert error messages). */
export function spotifyRowRejectReason(row: CanonicalRow): string | null {
  if (row.skipped) return "skipped";
  const missing = [...spotifyWriteMissing(row), ...spotifyModelMissing(row)];
  if (missing.length === 0) return null;
  return `missing ${missing.join(", ")}`;
}
