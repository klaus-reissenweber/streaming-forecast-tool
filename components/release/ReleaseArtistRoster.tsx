import { ARTIST_ROLE_LABELS, type ReleaseArtist } from "@/lib/release-artists";
import { formatCompactNumber } from "@/lib/format";

export function ReleaseArtistRoster({
  artists,
}: {
  artists: readonly ReleaseArtist[];
}) {
  if (artists.length === 0) {
    return null;
  }

  return (
    <ul className="mt-3 divide-y divide-border-subtle rounded-instrument border border-border bg-canvas-subtle">
      {artists.map((artist) => (
        <li
          key={artist.id}
          className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-3 py-2 text-body-sm"
        >
          <span className="text-foreground">
            {artist.artist_name}
            <span className="text-muted">
              {" "}
              · {ARTIST_ROLE_LABELS[artist.role]}
            </span>
          </span>
          <span className="font-mono tabular-nums text-secondary">
            {artist.monthly_listeners == null
              ? "ML unknown"
              : `${formatCompactNumber(artist.monthly_listeners)} ML`}
          </span>
        </li>
      ))}
    </ul>
  );
}
