/**
 * Generate or refresh a release's frozen ad performance report.
 * Service-role writes only.
 */

import { buildAdReportSnapshot } from "@/lib/ad-report/build-snapshot";
import { normalizeMetricsSnapshot } from "@/lib/ad-report/labels";
import {
  loadAdReportByReleaseId,
  reportPublicPath,
  reportPublicUrl,
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

  const { data, error } = await sb
    .from("ad_reports")
    .upsert(
      {
        release_id: releaseId,
        slug,
        title,
        metrics_snapshot: snapshot,
        updated_at: new Date().toISOString(),
        // Preserve created_at / expires_at on refresh via omit when updating;
        // upsert with onConflict release_id will overwrite listed columns.
        ...(existing
          ? {}
          : {
              created_at: new Date().toISOString(),
            }),
      },
      { onConflict: "release_id" },
    )
    .select(
      "id, release_id, slug, title, created_at, updated_at, expires_at, metrics_snapshot",
    )
    .single();

  if (error || !data) {
    throw new Error(`ad_reports upsert: ${error?.message ?? "no row returned"}`);
  }

  const report: AdReportRecord = {
    id: data.id as string,
    releaseId: data.release_id as string,
    slug: data.slug as string,
    title: data.title as string,
    createdAt: data.created_at as string,
    updatedAt: data.updated_at as string,
    expiresAt: (data.expires_at as string | null) ?? null,
    metricsSnapshot: normalizeMetricsSnapshot(
      data.metrics_snapshot as AdReportRecord["metricsSnapshot"],
    ),
  };

  const path = reportPublicPath(report.slug);
  return {
    report,
    path,
    url: reportPublicUrl(report.slug, siteOrigin()),
  };
}
