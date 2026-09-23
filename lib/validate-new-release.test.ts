import { describe, expect, it } from "vitest";
import { DEFAULT_NEW_RELEASE_FORM_VALUES } from "./map-new-release";
import { ISRC_RECHECK_ERROR } from "./songstats/create-form";
import { parseAndValidateNewReleaseForm } from "./validate-new-release";

function validRaw(
  patch: Partial<typeof DEFAULT_NEW_RELEASE_FORM_VALUES> = {},
) {
  return {
    ...DEFAULT_NEW_RELEASE_FORM_VALUES,
    trackName: "Your Loving",
    artistName: "Duke Dumont",
    artists: [
      {
        name: "Duke Dumont",
        monthlyListeners: 9894457,
        role: "primary" as const,
        songstatsArtistId: "q7j20h54",
      },
    ],
    releaseDate: "2025-05-09",
    ...patch,
  };
}

describe("parseAndValidateNewReleaseForm songstats lock", () => {
  it("blocks save when ISRC is set without a songstats track id", () => {
    const result = parseAndValidateNewReleaseForm(
      validRaw({
        isrc: "GBUM72501895",
        songstatsTrackId: null,
      }),
    );
    expect(result.valid).toBe(false);
    expect(result.fieldErrors.isrc).toBe(ISRC_RECHECK_ERROR);
  });

  it("warns when a typed release date differs from the fetched date and still validates", () => {
    const result = parseAndValidateNewReleaseForm(
      validRaw({
        isrc: "GBUM72501895",
        songstatsTrackId: "8hnvgbxd",
        songstatsArtistId: "q7j20h54",
        mlCapturedAt: "2026-09-22T00:00:00.000Z",
        fetchedReleaseDate: "2025-05-09",
        releaseDate: "2025-06-09",
      }),
    );
    expect(result.valid).toBe(true);
    expect(
      result.warnings.some((item) =>
        item.includes("differs from the entered date"),
      ),
    ).toBe(true);
  });
});
