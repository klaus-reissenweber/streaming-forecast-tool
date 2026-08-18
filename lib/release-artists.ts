/** Catalog roles for artists on a release. Explicit — never inferred from the title. */
export const ARTIST_ROLES = [
  "primary",
  "featured",
  "collaborator",
  "remixer",
  "original",
] as const;

export type ArtistRole = (typeof ARTIST_ROLES)[number];

export const ARTIST_ROLE_LABELS: Record<ArtistRole, string> = {
  primary: "Primary",
  featured: "Featured",
  collaborator: "Collaborator",
  remixer: "Remixer",
  original: "Original artist",
};

export const MAX_RELEASE_ARTISTS = 4;

export interface ReleaseArtist {
  id: string;
  release_id: string;
  artist_name: string;
  monthly_listeners: number | null;
  role: ArtistRole;
  position: number;
}

export interface ReleaseArtistInsert {
  release_id: string;
  artist_name: string;
  monthly_listeners: number | null;
  role: ArtistRole;
  position: number;
}

export function isArtistRole(value: string): value is ArtistRole {
  return (ARTIST_ROLES as readonly string[]).includes(value);
}

/** The unique primary row, if present. Forecast identity — not a blend. */
export function primaryReleaseArtist(
  artists: readonly ReleaseArtist[],
): ReleaseArtist | null {
  return artists.find((row) => row.role === "primary") ?? null;
}

export function sortReleaseArtists(
  artists: readonly ReleaseArtist[],
): ReleaseArtist[] {
  return [...artists].sort((a, b) => a.position - b.position);
}

/** Draft row while editing an existing roster (empty ML string = unknown). */
export interface ReleaseArtistDraft {
  name: string;
  monthlyListeners: number | string;
  role: ArtistRole | "";
}

/** Validated roster row ready to persist. Position is 1-based list order. */
export interface ReleaseArtistWriteRow {
  artist_name: string;
  monthly_listeners: number | null;
  role: ArtistRole;
  position: number;
}

export const MIN_ARTIST_MONTHLY_LISTENERS = 1;
export const MAX_ARTIST_MONTHLY_LISTENERS = 500_000_000;
