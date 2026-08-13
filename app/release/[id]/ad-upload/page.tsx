import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AdResultsUploadWizard } from "@/components/release/AdResultsUploadWizard";
import { requireAllowedUser } from "@/lib/auth/require-allowed-user";
import { loadRelease } from "@/lib/load-release";

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { id } = await params;
  const release = await loadRelease(id);
  if (!release) return { title: "Upload ad results" };
  return {
    title: `Upload ad results · ${release.track_name}`,
    description: `Import partner ad results for ${release.track_name}.`,
  };
}

export default async function AdUploadPage({ params }: PageProps) {
  const { id } = await params;
  const auth = await requireAllowedUser();
  if (!auth.ok) {
    return (
      <main className="mx-auto max-w-3xl px-5 py-8">
        <h1 className="font-serif text-release-title font-semibold text-foreground">
          Upload ad results
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

  return (
    <main className="mx-auto max-w-4xl px-5 py-8">
      <div className="mb-6">
        <p className="text-sm font-medium">
          <Link
            href={`/release/${id}`}
            className="text-accent-readable hover:underline"
          >
            ← {release.track_name}
          </Link>
        </p>
        <h1 className="mt-2 font-serif text-release-title font-semibold text-foreground">
          Ad results
        </h1>
        <p className="mt-1 text-body-sm text-secondary">
          Enter campaign numbers manually, or upload a partner export — both
          write into the same ad model tables for this release.
        </p>
      </div>
      <AdResultsUploadWizard
        releaseId={id}
        artistName={release.artist_name}
        trackName={release.track_name}
      />
    </main>
  );
}
