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
  const statusLabel = status === "active" ? "Active" : "Closed";

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
          <span
            className={
              "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium " +
              (status === "active"
                ? "bg-emerald-100 text-emerald-800"
                : "bg-stone-200 text-stone-700")
            }
          >
            {statusLabel}
          </span>
          <Link
            href="/new"
            className="text-sm font-medium text-orange-700 hover:text-orange-800 hover:underline"
          >
            Create another release
          </Link>
        </div>
      </div>
    </header>
  );
}
