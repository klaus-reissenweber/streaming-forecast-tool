import {
  DailyDataRowParseError,
  ReleaseRowParseError,
} from "@/lib/map-release-row";

export const CORRUPT_RELEASE_DATA_USER_MESSAGE =
  "This release has corrupted data. Please contact your platform admin and don't try to refresh.";

export const GENERIC_RELEASE_LOAD_ERROR_MESSAGE =
  "Something went wrong loading this release. Try again, or create a new release.";

/**
 * Detects corrupt-row parse failures in error boundaries.
 * Checks `name` as well as `instanceof` because server errors may be
 * re-hydrated on the client without preserving the class prototype.
 */
export function isCorruptReleaseDataError(error: unknown): boolean {
  if (error instanceof ReleaseRowParseError || error instanceof DailyDataRowParseError) {
    return true;
  }

  if (!error || typeof error !== "object") {
    return false;
  }

  const name = (error as { name?: string }).name;
  return name === "ReleaseRowParseError" || name === "DailyDataRowParseError";
}

export function releaseErrorUserMessage(error: unknown): string {
  if (isCorruptReleaseDataError(error)) {
    return CORRUPT_RELEASE_DATA_USER_MESSAGE;
  }
  return GENERIC_RELEASE_LOAD_ERROR_MESSAGE;
}
