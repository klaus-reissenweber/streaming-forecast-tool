import { CloseReleaseButton } from "@/components/release/CloseReleaseButton";
import { ReleaseArtistRoster } from "@/components/release/ReleaseArtistRoster";
import { ReleaseReportActions } from "@/components/release/ReleaseReportActions";
import { StatusPill } from "@/components/ui/StatusPill";
import { EDITORIAL_TIER_DEFINITIONS } from "@/lib/constants";
import type { EditorialTier, Genre } from "@/lib/forecast";
import type { ReleaseStatus } from "@/lib/map-release-row";
import type { ReleaseArtist } from "@/lib/release-artists";

export interface ReleasePageHeaderProps {
  releaseId: string;
  trackName: string;
  artistName: string;
  genre: Genre;
  releaseDateDisplay: string;
  editorialTier: EditorialTier;
  status: ReleaseStatus;
  reportPath?: string | null;
  reportUrl?: string | null;
  artists?: readonly ReleaseArtist[];
}

function formatGenreLabel(genre: Genre): string {
  return genre
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function statusBadge(status: ReleaseStatus): {
  label: string;
  tone: "neutral" | "positive";
} {
  if (status === "closed") {
    return {
      label: "Closed · read-only",
      tone: "neutral",
    };
  }

  return {
    label: "Active",
    tone: "positive",
  };
}

export function ReleasePageHeader({
  releaseId,
  trackName,
  artistName,
  genre,
  releaseDateDisplay,
  editorialTier,
  status,
  reportPath = null,
  reportUrl = null,
  artists = [],
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
          <ReleaseArtistRoster artists={artists} />
        </div>

        <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
          <StatusPill tone={badge.tone}>{badge.label}</StatusPill>
          {status === "active" ? (
            <CloseReleaseButton releaseId={releaseId} />
          ) : null}
          <ReleaseReportActions
            releaseId={releaseId}
            reportPath={reportPath}
            reportUrl={reportUrl}
          />
        </div>
      </div>
    </header>
  );
}
