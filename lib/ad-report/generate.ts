/**
 * Generate or refresh a release's frozen ad performance report.
 * Service-role writes only.
 */

import { buildAdReportSnapshot } from "@/lib/ad-report/build-snapshot";
import {
  AD_REPORT_COLUMNS,
  isMissingNotesColumn,
  loadAdReportByReleaseId,
  mapAdReportRow,
  reportPublicPath,
  reportPublicUrl,
  type AdReportRow,
} from "@/lib/ad-report/load";
import { generateReportSlug } from "@/lib/ad-report/slug";
import type { AdReportRecord } from "@/lib/ad-report/types";
import { loadDailyData, loadRelease } from "@/lib/load-release";
import { createServiceClient } from "@/lib/supabase/service";

export type GenerateAdReportResult = {
  report: AdReportRecord;
  path: string;
  url: string;
};

function siteOrigin(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (configured) return configured;
  return "http://localhost:3000";
}

/**
 * Upsert ad_reports for a release: refresh metrics_snapshot, keep slug stable.
 * Does not write `notes` — regenerating must preserve editorial edits.
 */
export async function generateOrRefreshAdReport(
  releaseId: string,
): Promise<GenerateAdReportResult> {
  const release = await loadRelease(releaseId);
  if (!release) {
    throw new Error("Release not found.");
  }

  const dailyData = await loadDailyData(releaseId);
  const snapshot = await buildAdReportSnapshot(release, dailyData);
  const title = `${release.track_name} · ${release.artist_name}`;

  const existing = await loadAdReportByReleaseId(releaseId, {
    includeExpired: true,
  });
  const slug = existing?.slug ?? generateReportSlug();
  const sb = createServiceClient();

  const payload = {
    release_id: releaseId,
    slug,
    title,
    metrics_snapshot: snapshot,
    updated_at: new Date().toISOString(),
    // Preserve created_at / expires_at / notes on refresh by omitting them.
    // Upsert with onConflict release_id overwrites only listed columns.
    ...(existing
      ? {}
      : {
          created_at: new Date().toISOString(),
        }),
  };

  const first = await sb
    .from("ad_reports")
    .upsert(payload, { onConflict: "release_id" })
    .select(AD_REPORT_COLUMNS)
    .single();

  let row: AdReportRow | null = first.data as AdReportRow | null;
  let error = first.error;

  if (error && isMissingNotesColumn(error.message)) {
    const retry = await sb
      .from("ad_reports")
      .upsert(payload, { onConflict: "release_id" })
      .select(
        "id, release_id, slug, title, created_at, updated_at, expires_at, metrics_snapshot",
      )
      .single();
    row = retry.data as AdReportRow | null;
    error = retry.error;
  }

  if (error || !row) {
    throw new Error(`ad_reports upsert: ${error?.message ?? "no row returned"}`);
  }

  const report = mapAdReportRow(row);

  const path = reportPublicPath(report.slug);
  return {
    report,
    path,
    url: reportPublicUrl(report.slug, siteOrigin()),
  };
}
