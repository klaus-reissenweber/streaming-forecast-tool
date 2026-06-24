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

export function ReleasePageHeader({
  trackName,
  artistName,
  genre,
  releaseDateDisplay,
  editorialTier,
  status,
}: ReleasePageHeaderProps) {
  const tierLabel = EDITORIAL_TIER_DEFINITIONS[editorialTier].label;
  const isClosed = status === "closed";

  return (
    <header className="border-b border-stone-200 pb-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-stone-900">
            {trackName}
            <span className="font-normal text-stone-500"> · {artistName}</span>
          </h1>
          <p className="mt-1 text-sm text-stone-500">
            {genre} · Release {releaseDateDisplay} · Editorial tier {editorialTier}{" "}
            ({tierLabel})
          </p>
        </div>

        <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
          {isClosed ? (
            <span className="inline-flex rounded-full bg-stone-200 px-2.5 py-0.5 text-xs font-medium text-stone-800">
              Closed release · read-only
            </span>
          ) : (
            <span className="inline-flex rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-800">
              Active
            </span>
          )}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <Link
              href="/archive"
              className="font-medium text-orange-700 hover:text-orange-800 hover:underline"
            >
              Archive
            </Link>
            <Link
              href="/new"
              className="font-medium text-orange-700 hover:text-orange-800 hover:underline"
            >
              Create another release
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}
