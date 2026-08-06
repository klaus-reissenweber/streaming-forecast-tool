/**
 * Apply column mappings + file constants → CanonicalRow[].
 */

import {
  CANONICAL_FIELDS,
  emptyCanonicalRow,
  type AdUploadColumnMappings,
  type AdUploadFileConstants,
  type AdUploadFormat,
  type AdUploadObjective,
  type CanonicalField,
  type CanonicalRow,
  type ParsedTable,
} from "@/lib/ad-upload/canonical";
import { normalizeToCanonicalField } from "@/lib/ad-upload/column-map";
import { normalizeMetaObjective } from "@/lib/meta-objective";

const CANONICAL_FIELDS_SET = new Set<string>(CANONICAL_FIELDS);

function parseNumber(raw: string): number | null {
  if (raw == null) return null;
  const cleaned = String(raw).trim().replace(/[$,\s]/g, "");
  if (cleaned === "" || cleaned === "—" || cleaned === "-") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function parseDate(raw: string): string | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    let y = Number(m[3]);
    if (y < 100) y += 2000;
    // Prefer ISO if looks like YYYY already handled; assume MDY when a>12.
    const month = a > 12 ? b : a;
    const day = a > 12 ? a : b;
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${y}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }
  const t = Date.parse(s);
  if (!Number.isFinite(t)) return null;
  const d = new Date(t);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function parseFormat(raw: string): AdUploadFormat | null {
  const v = String(raw ?? "").trim().toLowerCase();
  if (v.includes("marquee")) return "marquee";
  if (v.includes("showcase")) return "showcase";
  return null;
}

function parseObjective(raw: string): AdUploadObjective | null {
  return normalizeMetaObjective(raw);
}

function setField(
  row: CanonicalRow,
  field: CanonicalField,
  raw: string,
): void {
  switch (field) {
    case "spend":
    case "impressions":
    case "reach":
    case "clicks":
    case "converted_listeners":
    case "attributed_streams":
      row[field] = parseNumber(raw);
      break;
    case "format":
      row.format = parseFormat(raw);
      break;
    case "objective":
      row.objective = parseObjective(raw);
      break;
    case "campaign_name":
    case "artist":
    case "release_key":
      row[field] = String(raw ?? "").trim() || null;
      break;
    case "start_date":
    case "end_date":
      row[field] = parseDate(raw);
      break;
    default:
      break;
  }
}

export function applyMapping(
  table: ParsedTable,
  columnMappings: AdUploadColumnMappings,
  fileConstants: AdUploadFileConstants,
): CanonicalRow[] {
  const headerIndex = new Map(
    table.headers.map((h, i) => [h, i] as const),
  );

  return table.rows.map((cells, rowIndex) => {
    const row = emptyCanonicalRow(rowIndex);

    for (const [header, fieldRaw] of Object.entries(columnMappings)) {
      if (!fieldRaw) continue;
      // Coerce DB aliases (est_attributed_streams, spend_usd, link_clicks) → canonical.
      const field =
        (CANONICAL_FIELDS_SET.has(fieldRaw)
          ? fieldRaw
          : normalizeToCanonicalField(fieldRaw)) ?? null;
      if (!field) continue;
      const idx = headerIndex.get(header);
      if (idx == null) continue;
      const raw = cells[idx] ?? "";
      if (raw === "") continue;
      setField(row, field, raw);
    }

    // File-level constants fill blanks (whole file = Marquee / partner X).
    if (!row.format && fileConstants.format) {
      row.format = fileConstants.format;
    }
    if (!row.objective && fileConstants.objective) {
      row.objective = fileConstants.objective;
    }
    if (!row.artist && fileConstants.artist) {
      row.artist = fileConstants.artist;
    }
    if (!row.release_key && fileConstants.releaseKey) {
      row.release_key = fileConstants.releaseKey;
    }

    return row;
  });
}

export function previewMappedRows(
  rows: CanonicalRow[],
  limit = 5,
): CanonicalRow[] {
  return rows.slice(0, limit);
}
