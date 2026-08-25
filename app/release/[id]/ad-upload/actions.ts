"use server";

import { revalidatePath } from "next/cache";
import { applyMapping } from "@/lib/ad-upload/apply-mapping";
import {
  releaseKeyFromTrackName,
  type AdUploadColumnMappings,
  type AdUploadFileConstants,
  type AdUploadPlatform,
  type CanonicalRow,
  type ParsedTable,
} from "@/lib/ad-upload/canonical";
import {
  applyGapFill,
  computeGapNeeds,
  normalizeGapDecisions,
  type GapFillAction,
  type GapNeed,
} from "@/lib/ad-upload/gap-fill";
import { proposeMapping } from "@/lib/ad-upload/propose-mapping";
import {
  loadSourceProfile,
  saveSourceProfile,
} from "@/lib/ad-upload/source-profiles";
import {
  listCreativesForReleaseKey,
  uploadCampaignCreative,
  type AdCreativeRecord,
} from "@/lib/ad-upload/creatives";
import {
  loadManualCampaignsForReleaseKey,
  type ManualCampaignsForWizard,
} from "@/lib/ad-upload/load-manual-campaigns";
import {
  manualDraftsToCanonicalRows,
  type ManualCampaignDraft,
} from "@/lib/ad-upload/manual-rows";
import type { UpsertedCampaignRef } from "@/lib/ad-upload/campaign-ref";
import { upsertCanonicalRows } from "@/lib/ad-upload/upsert";
import { generateOrRefreshAdReport } from "@/lib/ad-report/generate";
import { requireAllowedUser } from "@/lib/auth/require-allowed-user";
import type { Genre } from "@/lib/forecast";
import { loadActiveModel } from "@/lib/load-active-model";
import { isValidReleaseId, loadRelease } from "@/lib/load-release";
import { createServiceClient } from "@/lib/supabase/service";

export type ParseUploadResult =
  | {
      success: true;
      table: ParsedTable;
      proposal: Awaited<ReturnType<typeof proposeMapping>>;
      release: {
        id: string;
        artistName: string;
        trackName: string;
        genre: Genre;
        releaseKey: string;
      };
    }
  | { success: false; error: string };

export type GapPreviewResult =
  | {
      success: true;
      rows: CanonicalRow[];
      gaps: GapNeed[];
      platform: AdUploadPlatform;
    }
  | { success: false; error: string };

export type ConfirmUploadResult =
  | {
      success: true;
      spotifyUpserted: number;
      metaUpserted: number;
      skipped: number;
      warnings: string[];
      profileSaved: boolean;
      reportUrl: string | null;
      reportPath: string | null;
      campaigns: UpsertedCampaignRef[];
      releaseKey: string;
    }
  | { success: false; error: string };

function detectKind(
  fileName: string,
  mime: string,
): "csv" | "xlsx" | "pdf" | "image" | null {
  const name = fileName.toLowerCase();
  if (name.endsWith(".csv") || mime.includes("csv") || mime === "text/plain") {
    return "csv";
  }
  if (
    name.endsWith(".xlsx") ||
    name.endsWith(".xls") ||
    mime.includes("spreadsheet") ||
    mime.includes("excel")
  ) {
    return "xlsx";
  }
  if (name.endsWith(".pdf") || mime === "application/pdf") {
    return "pdf";
  }
  if (
    name.match(/\.(png|jpe?g|webp|gif)$/) ||
    mime.startsWith("image/")
  ) {
    return "image";
  }
  return null;
}

async function parseFileToTable(
  buffer: Buffer,
  kind: "csv" | "xlsx" | "pdf" | "image",
  mime: string,
): Promise<ParsedTable> {
  if (kind === "csv") {
    const { parseCsvBuffer } = await import("@/lib/ad-upload/parse-tabular");
    return parseCsvBuffer(buffer);
  }
  if (kind === "xlsx") {
    const { parseXlsxBuffer } = await import("@/lib/ad-upload/parse-tabular");
    return parseXlsxBuffer(buffer);
  }
  if (kind === "pdf") {
    const { extractTableFromPdf } = await import(
      "@/lib/ad-upload/extract-table"
    );
    return extractTableFromPdf(buffer);
  }
  const { extractTableFromImage } = await import(
    "@/lib/ad-upload/extract-table"
  );
  return extractTableFromImage(buffer, mime);
}

/** Step 1: upload file → parse + propose mapping. */
export async function parseAdResultsUpload(
  releaseId: string,
  formData: FormData,
): Promise<ParseUploadResult> {
  const auth = await requireAllowedUser();
  if (!auth.ok) return { success: false, error: auth.error };

  if (!isValidReleaseId(releaseId)) {
    return { success: false, error: "Invalid release id." };
  }
  const release = await loadRelease(releaseId);
  if (!release) return { success: false, error: "Release not found." };

  const file = formData.get("file");
  const partnerLabel = String(formData.get("partnerLabel") ?? "").trim();
  if (!(file instanceof File)) {
    return { success: false, error: "Choose a file to upload." };
  }
  if (!partnerLabel) {
    return { success: false, error: "Partner / label name is required." };
  }

  const kind = detectKind(file.name, file.type);
  if (!kind) {
    return {
      success: false,
      error: "Unsupported file type. Use CSV, XLSX, PDF, or an image.",
    };
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const table = await parseFileToTable(buffer, kind, file.type);
    if (table.headers.length === 0 || table.rows.length === 0) {
      return {
        success: false,
        error:
          table.warnings.length > 0
            ? `No tabular rows found in the upload. ${table.warnings.join(" ")}`
            : "No tabular rows found in the upload.",
      };
    }

    const releaseKey = releaseKeyFromTrackName(release.track_name);
    const profile = await loadSourceProfile(partnerLabel, "unknown");
    const proposal = await proposeMapping({
      headers: table.headers,
      sampleRows: table.rows.slice(0, 5),
      partnerLabel,
      defaultArtist: release.artist_name,
      defaultReleaseKey: releaseKey,
      profile,
    });

    // Surface CSV encoding/delimiter notes alongside mapping notes.
    if (table.warnings.length > 0) {
      proposal.notes = [...table.warnings, ...proposal.notes];
    }

    // Re-load profile with detected platform if better match.
    if (proposal.fileConstants.platform !== "unknown") {
      const typed = await loadSourceProfile(
        partnerLabel,
        proposal.fileConstants.platform,
      );
      if (typed) {
        const again = await proposeMapping({
          headers: table.headers,
          sampleRows: table.rows.slice(0, 5),
          partnerLabel,
          defaultArtist: release.artist_name,
          defaultReleaseKey: releaseKey,
          profile: typed,
        });
        if (table.warnings.length > 0) {
          again.notes = [...table.warnings, ...again.notes];
        }
        return {
          success: true,
          table,
          proposal: again,
          release: {
            id: release.id,
            artistName: release.artist_name,
            trackName: release.track_name,
            genre: release.genre,
            releaseKey,
          },
        };
      }
    }

    return {
      success: true,
      table,
      proposal,
      release: {
        id: release.id,
        artistName: release.artist_name,
        trackName: release.track_name,
        genre: release.genre,
        releaseKey,
      },
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Step 2→3: apply user mapping → compute gap needs. */
export async function previewAdUploadGaps(input: {
  releaseId: string;
  table: ParsedTable;
  columnMappings: AdUploadColumnMappings;
  fileConstants: AdUploadFileConstants;
}): Promise<GapPreviewResult> {
  const auth = await requireAllowedUser();
  if (!auth.ok) return { success: false, error: auth.error };

  const release = await loadRelease(input.releaseId);
  if (!release) return { success: false, error: "Release not found." };

  try {
    const rows = applyMapping(
      input.table,
      input.columnMappings,
      input.fileConstants,
    );
    const adModel = (await loadActiveModel()).adModel;
    const platform = input.fileConstants.platform;
    const gaps = computeGapNeeds(
      rows,
      platform,
      adModel,
      release.artist_name,
      release.genre,
    );
    return { success: true, rows, gaps, platform };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Manual entry → same canonical + applyGapFill + upsertCanonicalRows path
 * as file upload (no parallel write).
 */
export async function confirmManualAdResults(input: {
  releaseId: string;
  platform: "spotify" | "meta";
  partnerLabel?: string;
  objective?: "awareness" | "traffic" | "streaming" | null;
  drafts: ManualCampaignDraft[];
}): Promise<ConfirmUploadResult> {
  const auth = await requireAllowedUser();
  if (!auth.ok) return { success: false, error: auth.error };

  if (!isValidReleaseId(input.releaseId)) {
    return { success: false, error: "Invalid release id." };
  }
  const release = await loadRelease(input.releaseId);
  if (!release) return { success: false, error: "Release not found." };

  if (input.platform !== "spotify" && input.platform !== "meta") {
    return { success: false, error: "Platform must be Spotify or Meta." };
  }
  if (!Array.isArray(input.drafts) || input.drafts.length === 0) {
    return { success: false, error: "Add at least one campaign row." };
  }

  try {
    const releaseKey = releaseKeyFromTrackName(release.track_name);
    const canonical = manualDraftsToCanonicalRows({
      platform: input.platform,
      drafts: input.drafts,
      artist: release.artist_name,
      releaseKey,
      objective: input.objective ?? "traffic",
    });
    // Completeness gate → usable_for_modeling (same as upload).
    const rows = applyGapFill(canonical, input.platform, {});
    const partner =
      input.partnerLabel?.trim() || "Manual entry";

    const result = await upsertCanonicalRows({
      rows,
      platform: input.platform,
      sourcePartner: partner,
    });

    let reportUrl: string | null = null;
    let reportPath: string | null = null;
    const warnings = [...result.errors];
    try {
      const report = await generateOrRefreshAdReport(input.releaseId);
      reportUrl = report.url;
      reportPath = report.path;
      revalidatePath(report.path);
    } catch (reportErr) {
      warnings.push(
        `Ad rows saved, but report refresh failed: ${
          reportErr instanceof Error ? reportErr.message : String(reportErr)
        }`,
      );
    }

    revalidatePath(`/release/${input.releaseId}`);
    revalidatePath(`/release/${input.releaseId}/ad-upload`);

    return {
      success: true,
      spotifyUpserted: result.spotifyUpserted,
      metaUpserted: result.metaUpserted,
      skipped: result.skipped,
      warnings,
      profileSaved: false,
      reportUrl,
      reportPath,
      campaigns: result.campaigns,
      releaseKey,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function loadManualCampaignsAction(
  releaseId: string,
): Promise<
  | { success: true; campaigns: ManualCampaignsForWizard }
  | { success: false; error: string }
> {
  const auth = await requireAllowedUser();
  if (!auth.ok) return { success: false, error: auth.error };
  if (!isValidReleaseId(releaseId)) {
    return { success: false, error: "Invalid release id." };
  }
  const release = await loadRelease(releaseId);
  if (!release) return { success: false, error: "Release not found." };
  try {
    const campaigns = await loadManualCampaignsForReleaseKey(
      releaseKeyFromTrackName(release.track_name),
    );
    return { success: true, campaigns };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function deleteManualAdCampaign(input: {
  releaseId: string;
  platform: "spotify" | "meta";
  campaignUid: string;
  format?: "marquee" | "showcase" | "";
}): Promise<{ success: true } | { success: false; error: string }> {
  const auth = await requireAllowedUser();
  if (!auth.ok) return { success: false, error: auth.error };
  if (!isValidReleaseId(input.releaseId)) {
    return { success: false, error: "Invalid release id." };
  }
  const uid = input.campaignUid.trim();
  if (!uid) {
    return { success: false, error: "Missing campaign identity." };
  }
  const release = await loadRelease(input.releaseId);
  if (!release) return { success: false, error: "Release not found." };

  const sb = createServiceClient();
  try {
    await sb.from("ad_campaign_creatives").delete().eq("campaign_uid", uid);

    if (input.platform === "spotify") {
      const format =
        input.format === "marquee" || input.format === "showcase"
          ? input.format
          : null;
      let query = sb.from("ad_spotify_campaigns").delete().eq("campaign_uid", uid);
      if (format) {
        query = query.eq("surface", format);
      }
      const { error } = await query;
      if (error) {
        return { success: false, error: error.message };
      }
    } else {
      const { error } = await sb
        .from("ad_meta_campaigns")
        .delete()
        .eq("campaign_uid", uid);
      if (error) {
        return { success: false, error: error.message };
      }
    }

    try {
      await generateOrRefreshAdReport(input.releaseId);
    } catch {
      // Row is gone; report refresh is best-effort.
    }
    revalidatePath(`/release/${input.releaseId}`);
    revalidatePath(`/release/${input.releaseId}/ad-upload`);
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Step 4: gap-fill + confirm upsert + save partner profile. */
export async function confirmAdResultsUpload(input: {
  releaseId: string;
  table: ParsedTable;
  columnMappings: AdUploadColumnMappings;
  fileConstants: AdUploadFileConstants;
  gapDecisions: Record<number | string, GapFillAction[]>;
  /**
   * Preferred: client-resolved canonical rows (mapping + accepted gap-fill
   * already merged). When present, write uses these directly so the confirm
   * payload matches what the user reviewed.
   */
  resolvedRows?: CanonicalRow[];
  saveProfile: boolean;
}): Promise<ConfirmUploadResult> {
  const auth = await requireAllowedUser();
  if (!auth.ok) return { success: false, error: auth.error };

  const release = await loadRelease(input.releaseId);
  if (!release) return { success: false, error: "Release not found." };

  try {
    const decisions = normalizeGapDecisions(input.gapDecisions);
    // Prefer client-resolved rows (mapping + accepted gap-fill already merged).
    // Still run applyGapFill so string-keyed decisions from the wire merge in,
    // and so a missing resolvedRows payload can rebuild from table + mappings.
    const baseRows =
      input.resolvedRows && input.resolvedRows.length > 0
        ? input.resolvedRows.map((row) => ({
            ...row,
            derived_fields: [...(row.derived_fields ?? [])],
          }))
        : applyMapping(
            input.table,
            input.columnMappings,
            input.fileConstants,
          );
    const rows = applyGapFill(
      baseRows,
      input.fileConstants.platform,
      decisions,
    );

    const result = await upsertCanonicalRows({
      rows,
      platform: input.fileConstants.platform,
      sourcePartner: input.fileConstants.partnerLabel,
    });

    let profileSaved = false;
    if (input.saveProfile && input.fileConstants.partnerLabel.trim()) {
      await saveSourceProfile({
        partnerLabel: input.fileConstants.partnerLabel,
        platform: input.fileConstants.platform,
        columnMappings: input.columnMappings,
        fileConstants: input.fileConstants,
        headers: input.table.headers,
      });
      profileSaved = true;
    }

    let reportUrl: string | null = null;
    let reportPath: string | null = null;
    const warnings = [...result.errors];
    try {
      const report = await generateOrRefreshAdReport(input.releaseId);
      reportUrl = report.url;
      reportPath = report.path;
      revalidatePath(report.path);
    } catch (reportErr) {
      warnings.push(
        `Ad rows saved, but report refresh failed: ${
          reportErr instanceof Error ? reportErr.message : String(reportErr)
        }`,
      );
    }

    revalidatePath(`/release/${input.releaseId}`);
    revalidatePath(`/release/${input.releaseId}/ad-upload`);

    return {
      success: true,
      spotifyUpserted: result.spotifyUpserted,
      metaUpserted: result.metaUpserted,
      skipped: result.skipped,
      warnings,
      profileSaved,
      reportUrl,
      reportPath,
      campaigns: result.campaigns,
      releaseKey: releaseKeyFromTrackName(release.track_name),
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Attach a creative image to a campaign after ad rows are saved. */
export async function uploadAdCreative(input: {
  releaseId: string;
  releaseKey: string;
  campaignUid: string;
  platform: "spotify" | "meta";
  caption?: string;
  fileName: string;
  contentType: string;
  base64: string;
}): Promise<
  | { success: true; creative: AdCreativeRecord; reportPath: string | null }
  | { success: false; error: string }
> {
  const auth = await requireAllowedUser();
  if (!auth.ok) return { success: false, error: auth.error };
  if (!isValidReleaseId(input.releaseId)) {
    return { success: false, error: "Invalid release id." };
  }
  if (!input.campaignUid?.trim() || !input.releaseKey?.trim()) {
    return { success: false, error: "Missing campaign identity." };
  }
  if (input.platform !== "spotify" && input.platform !== "meta") {
    return { success: false, error: "Invalid platform." };
  }

  try {
    const binary = Buffer.from(input.base64, "base64");
    const creative = await uploadCampaignCreative({
      releaseKey: input.releaseKey.trim(),
      campaignUid: input.campaignUid.trim(),
      platform: input.platform,
      fileName: input.fileName,
      contentType: input.contentType,
      bytes: binary.buffer.slice(
        binary.byteOffset,
        binary.byteOffset + binary.byteLength,
      ),
      caption: input.caption ?? null,
    });

    let reportPath: string | null = null;
    try {
      const report = await generateOrRefreshAdReport(input.releaseId);
      reportPath = report.path;
      revalidatePath(report.path);
    } catch {
      // Creative saved; report refresh is best-effort.
    }
    revalidatePath(`/release/${input.releaseId}/ad-upload`);
    return { success: true, creative, reportPath };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function listAdCreativesForRelease(input: {
  releaseId: string;
}): Promise<
  | { success: true; creatives: AdCreativeRecord[]; releaseKey: string }
  | { success: false; error: string }
> {
  const auth = await requireAllowedUser();
  if (!auth.ok) return { success: false, error: auth.error };
  if (!isValidReleaseId(input.releaseId)) {
    return { success: false, error: "Invalid release id." };
  }
  const release = await loadRelease(input.releaseId);
  if (!release) return { success: false, error: "Release not found." };
  const releaseKey = releaseKeyFromTrackName(release.track_name);
  try {
    const creatives = await listCreativesForReleaseKey(releaseKey);
    return { success: true, creatives, releaseKey };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
