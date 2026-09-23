import { describe, expect, it } from "vitest";
import {
  clearResolvedAfterIsrcEdit,
  forecastArtistSourceFor,
  inputsVersionFor,
  ISRC_RECHECK_ERROR,
  isrcFromTrackCandidate,
  isrcRequiresRecheck,
  isValidIsrc,
  releaseDateWarning,
  remixWarning,
} from "./create-form";

describe("create-form helpers", () => {
  it("warns when release dates differ by more than 3 days", () => {
    expect(releaseDateWarning("2026-06-16", "2026-07-16")).toBe(
      "Songstats release date 2026-07-16 differs from the entered date 2026-06-16 by more than 3 days.",
    );
    expect(releaseDateWarning("2026-06-16", "2026-06-18")).toBeNull();
  });

  it("warns on remix when the picked artist is not on the track", () => {
    expect(remixWarning("aaaa", ["q7j20h54"])).toMatch(/not on this track/);
    expect(remixWarning("q7j20h54", ["q7j20h54"])).toBeNull();
  });

  it("records forecast_artist_source", () => {
    expect(
      forecastArtistSourceFor({
        keptPickedArtist: true,
        chosenTrackArtistIndex: 0,
      }),
    ).toBe("picked");
    expect(
      forecastArtistSourceFor({
        keptPickedArtist: false,
        chosenTrackArtistIndex: 0,
      }),
    ).toBe("track_primary");
    expect(
      forecastArtistSourceFor({
        keptPickedArtist: false,
        chosenTrackArtistIndex: 1,
      }),
    ).toBe("track_other");
  });

  it("sets inputs_version on fetched, overridden, and fallback paths", () => {
    expect(
      inputsVersionFor({ fetched: true, overridden: false, fallback: false }),
    ).toBe(2);
    expect(
      inputsVersionFor({ fetched: true, overridden: true, fallback: false }),
    ).toBe(1);
    expect(
      inputsVersionFor({ fetched: false, overridden: false, fallback: true }),
    ).toBe(1);
    expect(
      inputsVersionFor({ fetched: false, overridden: false, fallback: false }),
    ).toBe(1);
  });

  it("accepts a 12-character ISRC", () => {
    expect(isValidIsrc("GBUM72501895")).toBe(true);
    expect(isValidIsrc("short")).toBe(false);
  });

  it("clears the resolved track and artist when the ISRC is edited after lookup", () => {
    const cleared = clearResolvedAfterIsrcEdit(
      {
        isrc: "GBUM72501895",
        songstatsTrackId: "8hnvgbxd",
        label: "EMI",
        genres: ["Dance"],
        fetchedReleaseDate: "2025-05-09",
        songstatsArtistId: "q7j20h54",
        forecastArtistSource: "track_primary" as const,
        followers: 878646,
        popularity: 70,
        mlCapturedAt: "2026-09-22T00:00:00.000Z",
        monthlyListeners: 9894457,
        artists: [
          {
            name: "Duke Dumont",
            monthlyListeners: 9894457,
            role: "primary",
            songstatsArtistId: "q7j20h54",
          },
        ],
      },
      "GBUM7250189X",
    );
    expect(cleared).toMatchObject({
      isrc: "GBUM7250189X",
      songstatsTrackId: null,
      label: "",
      genres: [],
      fetchedReleaseDate: null,
      songstatsArtistId: null,
      forecastArtistSource: "",
      followers: "",
      popularity: "",
      mlCapturedAt: null,
      monthlyListeners: "",
    });
    expect(cleared.artists[0]).toMatchObject({
      name: "Duke Dumont",
      songstatsArtistId: null,
      monthlyListeners: "",
    });
  });

  it("requires a re-check when ISRC is set without a track id", () => {
    expect(isrcRequiresRecheck("GBUM72501895", null)).toBe(true);
    expect(isrcRequiresRecheck("GBUM72501895", "8hnvgbxd")).toBe(false);
    expect(isrcRequiresRecheck("", null)).toBe(false);
    expect(ISRC_RECHECK_ERROR).toMatch(/Re-check/);
  });

  it("prefers candidate ISRCs and falls back to getTrackInfo", () => {
    expect(isrcFromTrackCandidate(["GBUM72501895"], "OTHER0000001")).toBe(
      "GBUM72501895",
    );
    expect(isrcFromTrackCandidate([], "GBUM72501895")).toBe("GBUM72501895");
  });
});
