export const RELEASE_DATE_SLACK_DAYS = 3;

export type ForecastArtistSource = "track_primary" | "track_other" | "picked";

export type InputsVersion = 1 | 2;

export function utcDayDiffAbs(a: string, b: string): number {
  const left = Date.parse(`${a.slice(0, 10)}T00:00:00.000Z`);
  const right = Date.parse(`${b.slice(0, 10)}T00:00:00.000Z`);
  return Math.abs(Math.round((right - left) / 86_400_000));
}

export function releaseDateWarning(
  entered: string,
  fetched: string,
): string | null {
  if (!entered || !fetched) return null;
  if (utcDayDiffAbs(entered, fetched) <= RELEASE_DATE_SLACK_DAYS) {
    return null;
  }
  return `Songstats release date ${fetched} differs from the entered date ${entered} by more than ${RELEASE_DATE_SLACK_DAYS} days.`;
}

export function remixWarning(
  pickedArtistId: string | null | undefined,
  trackArtistIds: readonly string[],
): string | null {
  if (!pickedArtistId) return null;
  if (trackArtistIds.includes(pickedArtistId)) return null;
  return "The picked artist is not on this track. Switch to a credited artist, or keep the pick for a remix / other audience.";
}

export function inputsVersionFor(args: {
  fetched: boolean;
  overridden: boolean;
  fallback: boolean;
}): InputsVersion {
  if (args.overridden || args.fallback || !args.fetched) {
    return 1;
  }
  return 2;
}

export function forecastArtistSourceFor(args: {
  keptPickedArtist: boolean;
  chosenTrackArtistIndex: number;
}): ForecastArtistSource {
  if (args.keptPickedArtist) return "picked";
  return args.chosenTrackArtistIndex === 0 ? "track_primary" : "track_other";
}

export function isValidIsrc(value: string): boolean {
  return /^[A-Za-z0-9]{12}$/.test(value.trim());
}

export const ISRC_RECHECK_ERROR =
  "Re-check the ISRC before saving.";

export function isrcRequiresRecheck(
  isrc: string,
  songstatsTrackId: string | null | undefined,
): boolean {
  return isrc.trim().length > 0 && !songstatsTrackId;
}

export function isrcFromTrackCandidate(
  isrcs: readonly string[],
  fallbackIsrc: string,
): string {
  const first = isrcs.find((value) => value.trim());
  return (first ?? fallbackIsrc).trim();
}

type LookupArtistRow = {
  name: string;
  monthlyListeners: number | string;
  role: string;
  songstatsArtistId?: string | null;
};

export function clearResolvedAfterIsrcEdit<
  T extends {
    artists: LookupArtistRow[];
  },
>(current: T, nextIsrc: string): T {
  const artists = current.artists.map((row, index) =>
    index === 0
      ? { ...row, songstatsArtistId: null, monthlyListeners: "" }
      : row,
  );
  return {
    ...current,
    isrc: nextIsrc,
    songstatsTrackId: null,
    label: "",
    genres: [],
    fetchedReleaseDate: null,
    songstatsArtistId: null,
    forecastArtistSource: "",
    followers: "",
    popularity: "",
    mlCapturedAt: null,
    mlOverridden: false,
    mlOverrideReason: "",
    monthlyListeners: "",
    artists,
  };
}
