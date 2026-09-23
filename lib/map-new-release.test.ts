import { describe, expect, it } from "vitest";
import {
  DEFAULT_NEW_RELEASE_FORM_VALUES,
  toNewReleaseInsertRow,
} from "./map-new-release";
import { parseAndValidateNewReleaseForm } from "./validate-new-release";

describe("toNewReleaseInsertRow forecast_artist_source", () => {
  it("writes picked when a search-box artist is saved without an ISRC", () => {
    const parsed = parseAndValidateNewReleaseForm({
      ...DEFAULT_NEW_RELEASE_FORM_VALUES,
      trackName: "Untitled",
      artistName: "Duke Dumont",
      artists: [
        {
          name: "Duke Dumont",
          monthlyListeners: 9894457,
          role: "primary",
          songstatsArtistId: "q7j20h54",
        },
      ],
      releaseDate: "2026-09-22",
      isrc: "",
      songstatsTrackId: null,
      songstatsArtistId: "q7j20h54",
      forecastArtistSource: "picked",
      mlCapturedAt: "2026-09-22T00:00:00.000Z",
      followers: 878646,
      popularity: 70,
    });
    expect(parsed.valid).toBe(true);
    expect(parsed.values.forecastArtistSource).toBe("picked");
    const row = toNewReleaseInsertRow(parsed.values, {
      lockedForecastStreams: 1,
      lockedForecastSaves: 1,
      modelVersionId: "model",
    });
    expect(row.forecast_artist_source).toBe("picked");
    expect(row.isrc).toBeNull();
    expect(row.songstats_artist_id).toBe("q7j20h54");
  });
});
