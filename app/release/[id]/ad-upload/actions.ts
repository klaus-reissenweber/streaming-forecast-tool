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
  extractTableFromImage,
  extractTableFromPdf,
} from "@/lib/ad-upload/extract-table";
import {
  applyGapFill,
  computeGapNeeds,
  normalizeGapDecisions,
  type GapFillAction,
  type GapNeed,
} from "@/lib/ad-upload/gap-fill";
import { parseCsvBuffer, parseXlsxBuffer } from "@/lib/ad-upload/parse-tabular";
import { proposeMapping } from "@/lib/ad-upload/propose-mapping";
import {
  loadSourceProfile,
  saveSourceProfile,
} from "@/lib/ad-upload/source-profiles";
import { upsertCanonicalRows } from "@/lib/ad-upload/upsert";
import { generateOrRefreshAdReport } from "@/lib/ad-report/generate";
import { requireAllowedUser } from "@/lib/auth/require-allowed-user";
import type { Genre } from "@/lib/forecast";
import { loadActiveModel } from "@/lib/load-active-model";
import { isValidReleaseId, loadRelease } from "@/lib/load-release";

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
  if (kind === "csv") return parseCsvBuffer(buffer);
  if (kind === "xlsx") return parseXlsxBuffer(buffer);
  if (kind === "pdf") return extractTableFromPdf(buffer);
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
        error: "No tabular rows found in the upload.",
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
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
