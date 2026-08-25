/**
 * Persist editorial notes on an ad report. Service-role write after auth.
 * Does not touch metrics_snapshot.
 */

import {
  applyNotesPatch,
  notesToJson,
  type AdReportNotes,
  type AdReportNotesPatch,
} from "@/lib/ad-report/notes";
import {
  isMissingNotesColumn,
  loadAdReportBySlug,
} from "@/lib/ad-report/load";
import { createServiceClient } from "@/lib/supabase/service";

export async function persistAdReportNotes(
  slug: string,
  patch: AdReportNotesPatch,
): Promise<AdReportNotes> {
  const report = await loadAdReportBySlug(slug);
  if (!report) {
    throw new Error("Report not found.");
  }

  const next = applyNotesPatch(report.notes, patch);
  const sb = createServiceClient();
  const { error } = await sb
    .from("ad_reports")
    .update({
      notes: notesToJson(next),
      updated_at: new Date().toISOString(),
    })
    .eq("id", report.id);

  if (error) {
    if (isMissingNotesColumn(error.message)) {
      throw new Error(
        "Report notes are not available until the notes migration is applied.",
      );
    }
    throw new Error(`ad_reports notes: ${error.message}`);
  }

  return next;
}
