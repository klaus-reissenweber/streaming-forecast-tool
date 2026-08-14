import type { AdReportMetricsSnapshot, AdReportRecord } from "@/lib/ad-report/types";
import { createServiceClient } from "@/lib/supabase/service";

type AdReportRow = {
  id: string;
  release_id: string;
  slug: string;
  title: string;
  created_at: string;
  updated_at: string;
  expires_at: string | null;
  metrics_snapshot: AdReportMetricsSnapshot;
};

function mapRow(row: AdReportRow): AdReportRecord {
  return {
    id: row.id,
    releaseId: row.release_id,
    slug: row.slug,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    expiresAt: row.expires_at,
    metricsSnapshot: row.metrics_snapshot,
  };
}

function isExpired(expiresAt: string | null): boolean {
  if (!expiresAt) return false;
  const t = Date.parse(expiresAt);
  return Number.isFinite(t) && t <= Date.now();
}

/** Public lookup by exact slug (service role). No listing. */
export async function loadAdReportBySlug(
  slug: string,
): Promise<AdReportRecord | null> {
  const trimmed = slug.trim();
  if (trimmed.length < 16) return null;

  const sb = createServiceClient();
  const { data, error } = await sb
    .from("ad_reports")
    .select(
      "id, release_id, slug, title, created_at, updated_at, expires_at, metrics_snapshot",
    )
    .eq("slug", trimmed)
    .maybeSingle();

  if (error) {
    throw new Error(`ad_reports by slug: ${error.message}`);
  }
  if (!data) return null;

  const report = mapRow(data as AdReportRow);
  if (isExpired(report.expiresAt)) return null;
  return report;
}

/**
 * Auth'd helpers: load report row by release.
 * @param options.includeExpired — when true, return expired rows (slug reuse on refresh).
 */
export async function loadAdReportByReleaseId(
  releaseId: string,
  options?: { includeExpired?: boolean },
): Promise<AdReportRecord | null> {
  const sb = createServiceClient();
  const { data, error } = await sb
    .from("ad_reports")
    .select(
      "id, release_id, slug, title, created_at, updated_at, expires_at, metrics_snapshot",
    )
    .eq("release_id", releaseId)
    .maybeSingle();

  if (error) {
    throw new Error(`ad_reports by release: ${error.message}`);
  }
  if (!data) return null;

  const report = mapRow(data as AdReportRow);
  if (!options?.includeExpired && isExpired(report.expiresAt)) return null;
  return report;
}

export function reportPublicPath(slug: string): string {
  return `/report/${slug}`;
}

/** Internal preview of the public report — does not change the shareable URL. */
export function reportInternalPath(slug: string): string {
  return `${reportPublicPath(slug)}?from=app`;
}

export function withInternalReportPreview(path: string): string {
  const pathname = path.split("?")[0] ?? path;
  return `${pathname}?from=app`;
}

export function isInternalReportPreview(from: string | undefined): boolean {
  return from === "app";
}

export function reportPublicUrl(slug: string, origin?: string): string {
  const path = reportPublicPath(slug);
  if (!origin) return path;
  return `${origin.replace(/\/$/, "")}${path}`;
}

/** Auth'd listing of generated reports (expired rows omitted). */
export async function loadAdReportsList(): Promise<AdReportRecord[]> {
  const sb = createServiceClient();
  const { data, error } = await sb
    .from("ad_reports")
    .select(
      "id, release_id, slug, title, created_at, updated_at, expires_at, metrics_snapshot",
    )
    .order("updated_at", { ascending: false });

  if (error) {
    throw new Error(`ad_reports list: ${error.message}`);
  }

  return (data ?? [])
    .map((row) => mapRow(row as AdReportRow))
    .filter((report) => !isExpired(report.expiresAt));
}
