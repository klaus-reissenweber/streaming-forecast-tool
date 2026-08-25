import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AdReportDashboard } from "@/components/report/AdReportDashboard";
import {
  isInternalReportPreview,
  loadAdReportBySlug,
} from "@/lib/ad-report/load";
import type { AdReportMetricsSnapshot } from "@/lib/ad-report/types";

interface ReportPageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ from?: string }>;
}

function isValidSnapshot(
  value: unknown,
): value is AdReportMetricsSnapshot {
  if (!value || typeof value !== "object") return false;
  const snap = value as AdReportMetricsSnapshot;
  return snap.version === 1 && !!snap.release?.trackName;
}

export async function generateMetadata({
  params,
}: ReportPageProps): Promise<Metadata> {
  const { slug } = await params;
  const report = await loadAdReportBySlug(slug).catch(() => null);
  if (!report || !isValidSnapshot(report.metricsSnapshot)) {
    return { title: "Report Not Found", robots: { index: false, follow: false } };
  }
  return {
    title: `${report.title} · Performance Report`,
    description: `Paid + forecast performance snapshot for ${report.metricsSnapshot.release.trackName}.`,
    robots: { index: false, follow: false },
  };
}

export default async function PublicAdReportPage({
  params,
  searchParams,
}: ReportPageProps) {
  const { slug } = await params;
  const { from } = await searchParams;
  const report = await loadAdReportBySlug(slug).catch(() => null);

  if (!report || !isValidSnapshot(report.metricsSnapshot)) {
    notFound();
  }

  const backHref = isInternalReportPreview(from)
    ? `/release/${report.metricsSnapshot.release.id}`
    : null;

  return (
    <main className="min-h-full bg-canvas print:bg-white">
      <AdReportDashboard
        title={report.title}
        snapshot={report.metricsSnapshot}
        generatedAt={
          report.metricsSnapshot.generatedAt || report.updatedAt
        }
        backHref={backHref}
      />
    </main>
  );
}
