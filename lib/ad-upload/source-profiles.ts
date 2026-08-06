/**
 * Persist / load partner source profiles for auto-mapping next upload.
 */

import {
  CANONICAL_FIELDS,
  normalizePartnerKey,
  type AdUploadColumnMappings,
  type AdUploadFileConstants,
  type AdUploadPlatform,
  type CanonicalField,
} from "@/lib/ad-upload/canonical";
import { normalizeToCanonicalField } from "@/lib/ad-upload/column-map";
import { createServiceClient } from "@/lib/supabase/service";

const CANONICAL_FIELDS_SET = new Set<string>(CANONICAL_FIELDS);

function coerceMappings(raw: AdUploadColumnMappings): AdUploadColumnMappings {
  const out: AdUploadColumnMappings = {};
  for (const [header, field] of Object.entries(raw)) {
    if (field == null) {
      out[header] = null;
      continue;
    }
    if (CANONICAL_FIELDS_SET.has(field)) {
      out[header] = field as CanonicalField;
      continue;
    }
    out[header] = normalizeToCanonicalField(field);
  }
  return out;
}

export type AdUploadSourceProfile = {
  id: string;
  partnerKey: string;
  partnerLabel: string;
  platform: AdUploadPlatform;
  columnMappings: AdUploadColumnMappings;
  fileConstants: AdUploadFileConstants;
  headerSignature: string[];
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function parseProfile(row: Record<string, unknown>): AdUploadSourceProfile {
  const platformRaw = String(row.platform ?? "unknown");
  const platform: AdUploadPlatform =
    platformRaw === "spotify" || platformRaw === "meta"
      ? platformRaw
      : "unknown";

  const constantsRaw = isRecord(row.file_constants) ? row.file_constants : {};
  const mappingsRaw = isRecord(row.column_mappings)
    ? coerceMappings(row.column_mappings as AdUploadColumnMappings)
    : {};

  return {
    id: String(row.id),
    partnerKey: String(row.partner_key),
    partnerLabel: String(row.partner_label),
    platform,
    columnMappings: mappingsRaw,
    fileConstants: {
      partnerLabel: String(
        constantsRaw.partnerLabel ?? row.partner_label ?? "",
      ),
      platform:
        constantsRaw.platform === "spotify" ||
        constantsRaw.platform === "meta"
          ? constantsRaw.platform
          : platform,
      format:
        constantsRaw.format === "marquee" ||
        constantsRaw.format === "showcase"
          ? constantsRaw.format
          : null,
      objective:
        constantsRaw.objective === "awareness" ||
        constantsRaw.objective === "traffic" ||
        constantsRaw.objective === "streaming"
          ? constantsRaw.objective
          : null,
      artist:
        typeof constantsRaw.artist === "string" ? constantsRaw.artist : null,
      releaseKey:
        typeof constantsRaw.releaseKey === "string"
          ? constantsRaw.releaseKey
          : null,
    },
    headerSignature: Array.isArray(row.header_signature)
      ? row.header_signature.map(String)
      : [],
  };
}

export async function loadSourceProfile(
  partnerLabel: string,
  platform: AdUploadPlatform,
): Promise<AdUploadSourceProfile | null> {
  const key = normalizePartnerKey(partnerLabel);
  if (!key) return null;
  const sb = createServiceClient();
  const { data, error } = await sb
    .from("ad_upload_source_profiles")
    .select("*")
    .eq("partner_key", key)
    .eq("platform", platform === "unknown" ? "unknown" : platform)
    .maybeSingle();
  if (error) {
    // Table may not exist yet pre-migration.
    if (error.message.includes("does not exist")) return null;
    throw new Error(`ad_upload_source_profiles: ${error.message}`);
  }
  if (!data) {
    // Retry without platform if unknown.
    if (platform !== "unknown") {
      const again = await sb
        .from("ad_upload_source_profiles")
        .select("*")
        .eq("partner_key", key)
        .maybeSingle();
      if (again.data) {
        return parseProfile(again.data as Record<string, unknown>);
      }
    }
    return null;
  }
  return parseProfile(data as Record<string, unknown>);
}

export async function saveSourceProfile(options: {
  partnerLabel: string;
  platform: AdUploadPlatform;
  columnMappings: AdUploadColumnMappings;
  fileConstants: AdUploadFileConstants;
  headers: string[];
}): Promise<string> {
  const partnerKey = normalizePartnerKey(options.partnerLabel);
  if (!partnerKey) {
    throw new Error("Partner label is required to save a source profile.");
  }
  const platform =
    options.platform === "unknown" ? "unknown" : options.platform;
  const sb = createServiceClient();
  const row = {
    partner_key: partnerKey,
    partner_label: options.partnerLabel.trim(),
    platform,
    column_mappings: options.columnMappings,
    file_constants: options.fileConstants,
    header_signature: options.headers,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await sb
    .from("ad_upload_source_profiles")
    .upsert(row, { onConflict: "partner_key,platform" })
    .select("id")
    .maybeSingle();
  if (error) {
    throw new Error(`save source profile: ${error.message}`);
  }
  return String(data?.id ?? "");
}
