import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageBreadcrumbs } from "@/components/layout/PageBreadcrumbs";
import { AdResultsStatus } from "@/components/release/AdResultsStatus";
import { AdResultsUploadWizard } from "@/components/release/AdResultsUploadWizard";
import { summarizeAdCampaigns } from "@/lib/ad-results-summary";
import { releaseKeyFromTrackName } from "@/lib/ad-upload/canonical";
import { requireAllowedUser } from "@/lib/auth/require-allowed-user";
import { loadCampaignFlightsForReleaseKey } from "@/lib/load-campaign-flights";
import { loadManualCampaignsForReleaseKey } from "@/lib/ad-upload/load-manual-campaigns";
import { loadRelease } from "@/lib/load-release";

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { id } = await params;
  const release = await loadRelease(id);
  if (!release) return { title: "Upload Ad Results" };
  return {
    title: `Upload Ad Results · ${release.track_name}`,
    description: `Import partner ad results for ${release.track_name}.`,
  };
}

export default async function AdUploadPage({ params }: PageProps) {
  const { id } = await params;
  const auth = await requireAllowedUser();
  if (!auth.ok) {
    return (
      <main className="mx-auto max-w-3xl px-5 py-8">
        <h1 className="text-release-title font-semibold text-foreground">
          Upload Ad Results
        </h1>
        <p className="mt-3 text-body-sm text-secondary">{auth.error}</p>
        <p className="mt-6">
          <Link href="/login" className="text-accent-readable hover:underline">
            Sign in
          </Link>
        </p>
      </main>
    );
  }

  const release = await loadRelease(id);
  if (!release) notFound();

  const releaseKey = releaseKeyFromTrackName(release.track_name);
  const campaignFlights = await loadCampaignFlightsForReleaseKey(
    releaseKey,
  ).catch(() => []);
  const adSummary = summarizeAdCampaigns(campaignFlights);
  const existingCampaigns = await loadManualCampaignsForReleaseKey(
    releaseKey,
  ).catch(() => null);

  return (
    <main className="mx-auto max-w-4xl px-5 py-8">
      <PageBreadcrumbs
        items={[
          {
            label: "Releases",
            href: release.status === "closed" ? "/archive" : "/",
          },
          { label: release.track_name, href: `/release/${id}` },
          { label: "Ad Results" },
        ]}
      />
      <div className="mt-4 mb-6">
        <h1 className="text-release-title font-semibold text-foreground">
          Ad Results
        </h1>
        <p className="mt-1 text-sm text-secondary">
          Enter campaign numbers manually, or upload a partner export — both
          write into the same ad model tables for this release.
        </p>
      </div>
      <div className="mb-6">
        <AdResultsStatus summary={adSummary} />
      </div>
      <AdResultsUploadWizard
        releaseId={id}
        artistName={release.artist_name}
        trackName={release.track_name}
        initialSpotifyDrafts={existingCampaigns?.spotify}
        initialMetaDrafts={existingCampaigns?.meta}
        initialMetaObjective={existingCampaigns?.metaObjective}
      />
    </main>
  );
}
