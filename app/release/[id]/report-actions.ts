"use server";

import { revalidatePath } from "next/cache";
import { generateOrRefreshAdReport } from "@/lib/ad-report/generate";
import {
  loadAdReportByReleaseId,
  reportPublicUrl,
} from "@/lib/ad-report/load";
import { requireAllowedUser } from "@/lib/auth/require-allowed-user";

function siteOrigin(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (configured) return configured;
  return "http://localhost:3000";
}

export type ReleaseReportLinkResult =
  | {
      success: true;
      path: string;
      url: string;
      title: string;
      updatedAt: string;
    }
  | { success: false; error: string };

/** Existing frozen report for a release (no regenerate). */
export async function getReleaseReportLink(
  releaseId: string,
): Promise<ReleaseReportLinkResult> {
  const auth = await requireAllowedUser();
  if (!auth.ok) return { success: false, error: auth.error };

  try {
    const report = await loadAdReportByReleaseId(releaseId);
    if (!report) {
      return { success: false, error: "No report yet — upload ad results first." };
    }
    return {
      success: true,
      path: `/report/${report.slug}`,
      url: reportPublicUrl(report.slug, siteOrigin()),
      title: report.title,
      updatedAt: report.updatedAt,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Refresh snapshot + return shareable link (keeps slug). */
export async function refreshReleaseReport(
  releaseId: string,
): Promise<ReleaseReportLinkResult> {
  const auth = await requireAllowedUser();
  if (!auth.ok) return { success: false, error: auth.error };

  try {
    const result = await generateOrRefreshAdReport(releaseId);
    revalidatePath(`/release/${releaseId}`);
    revalidatePath(result.path);
    return {
      success: true,
      path: result.path,
      url: result.url,
      title: result.report.title,
      updatedAt: result.report.updatedAt,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
