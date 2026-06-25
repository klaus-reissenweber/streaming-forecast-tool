import Link from "next/link";
import { EDITORIAL_TIER_DEFINITIONS } from "@/lib/constants";
import type { EditorialTier, Genre } from "@/lib/forecast";
import type { ReleaseStatus } from "@/lib/map-release-row";

export interface ReleasePageHeaderProps {
  trackName: string;
  artistName: string;
  genre: Genre;
  releaseDateDisplay: string;
  editorialTier: EditorialTier;
  status: ReleaseStatus;
}

function formatGenreLabel(genre: Genre): string {
  return genre
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function statusBadge(status: ReleaseStatus): {
  tag: string;
  tagClass: string;
} {
  if (status === "closed") {
    return {
      tag: "[CLOSED · READ-ONLY]",
      tagClass: "bracket-tag--neutral",
    };
  }

  return {
    tag: "[ACTIVE]",
    tagClass: "bracket-tag--positive",
  };
}

export function ReleasePageHeader({
  trackName,
  artistName,
  genre,
  releaseDateDisplay,
  editorialTier,
  status,
}: ReleasePageHeaderProps) {
  const tierLabel = EDITORIAL_TIER_DEFINITIONS[editorialTier].label;
  const badge = statusBadge(status);
  const genreLabel = formatGenreLabel(genre);

  return (
    <header className="border-b border-border pb-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="font-serif text-release-title text-foreground">
            {trackName}
            <span className="font-normal text-secondary"> · {artistName}</span>
          </h1>
          <p className="mt-1 text-body-sm text-secondary">
            {genreLabel} · Release {releaseDateDisplay} · Editorial tier{" "}
            {editorialTier} ({tierLabel})
          </p>
        </div>

        <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
          <span className={`bracket-tag ${badge.tagClass}`}>{badge.tag}</span>
          <nav className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-medium">
            <Link
              href="/"
              className="text-accent-readable hover:text-accent-hover hover:underline"
            >
              Active releases
            </Link>
            <Link
              href="/archive"
              className="text-accent-readable hover:text-accent-hover hover:underline"
            >
              Archive
            </Link>
            <Link
              href="/new"
              className="text-accent-readable hover:text-accent-hover hover:underline"
            >
              Create another release
            </Link>
          </nav>
        </div>
      </div>
    </header>
  );
}
