import {
  parseAdReportNotes,
  type AdReportNotes,
} from "@/lib/ad-report/notes";
import type { AdReportMetricsSnapshot, AdReportRecord } from "@/lib/ad-report/types";
import { normalizeMetricsSnapshot } from "@/lib/ad-report/labels";
import { createServiceClient } from "@/lib/supabase/service";

export const AD_REPORT_COLUMNS =
  "id, release_id, slug, title, created_at, updated_at, expires_at, metrics_snapshot, notes";
const AD_REPORT_COLUMNS_WITHOUT_NOTES =
  "id, release_id, slug, title, created_at, updated_at, expires_at, metrics_snapshot";

export type AdReportRow = {
  id: string;
  release_id: string;
  slug: string;
  title: string;
  created_at: string;
  updated_at: string;
  expires_at: string | null;
  metrics_snapshot: AdReportMetricsSnapshot;
  notes?: AdReportNotes | null;
};

export function mapAdReportRow(row: AdReportRow): AdReportRecord {
  return {
    id: row.id,
    releaseId: row.release_id,
    slug: row.slug,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    expiresAt: row.expires_at,
    metricsSnapshot: normalizeMetricsSnapshot(row.metrics_snapshot),
    notes: parseAdReportNotes(row.notes),
  };
}

function isExpired(expiresAt: string | null): boolean {
  if (!expiresAt) return false;
  const t = Date.parse(expiresAt);
  return Number.isFinite(t) && t <= Date.now();
}

export function isMissingNotesColumn(message: string): boolean {
  return (
    /notes/i.test(message) &&
    /does not exist|schema cache|could not find/i.test(message)
  );
}

type QueryResult = {
  data: unknown;
  error: { message: string } | null;
};

/**
 * Select notes when the column exists. Until the migration is applied,
 * fall back so generate/load keep working.
 */
export async function selectAdReport<T>(
  run: (columns: string) => PromiseLike<QueryResult>,
  errorLabel: string,
): Promise<T | null> {
  const withNotes = await run(AD_REPORT_COLUMNS);
  if (!withNotes.error) {
    return (withNotes.data as T | null) ?? null;
  }
  if (isMissingNotesColumn(withNotes.error.message)) {
    const without = await run(AD_REPORT_COLUMNS_WITHOUT_NOTES);
    if (without.error) {
      throw new Error(`${errorLabel}: ${without.error.message}`);
    }
    return (without.data as T | null) ?? null;
  }
  throw new Error(`${errorLabel}: ${withNotes.error.message}`);
}

/** Public lookup by exact slug (service role). No listing. */
export async function loadAdReportBySlug(
  slug: string,
): Promise<AdReportRecord | null> {
  const trimmed = slug.trim();
  if (trimmed.length < 16) return null;

  const sb = createServiceClient();
  const data = await selectAdReport<AdReportRow>(
    (columns) =>
      sb.from("ad_reports").select(columns).eq("slug", trimmed).maybeSingle(),
    "ad_reports by slug",
  );
  if (!data) return null;

  const report = mapAdReportRow(data);
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
  const data = await selectAdReport<AdReportRow>(
    (columns) =>
      sb
        .from("ad_reports")
        .select(columns)
        .eq("release_id", releaseId)
        .maybeSingle(),
    "ad_reports by release",
  );
  if (!data) return null;

  const report = mapAdReportRow(data);
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
  const data = await selectAdReport<AdReportRow[]>(
    (columns) =>
      sb.from("ad_reports").select(columns).order("updated_at", {
        ascending: false,
      }),
    "ad_reports list",
  );

  return (data ?? [])
    .map((row) => mapAdReportRow(row))
    .filter((report) => !isExpired(report.expiresAt));
}
