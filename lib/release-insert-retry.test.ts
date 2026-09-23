import { describe, expect, it } from "vitest";
import {
  PROTECTED_SONGSTATS_RELEASE_COLUMNS,
  SONGSTATS_SCHEMA_REQUIRED_ERROR,
  rowForPgrst204Retry,
} from "./release-insert-retry";

function sampleRow() {
  return {
    track_name: "Your Loving",
    artist_name: "Duke Dumont",
    meta_traffic_spend_planned: 0,
    meta_awareness_spend_planned: 0,
    spotify_marquee_spend_planned: 0,
    spotify_showcase_spend_planned: 0,
    isrc: "GBUM72501895",
    songstats_track_id: "8hnvgbxd",
    songstats_artist_id: "q7j20h54",
    inputs_version: 2,
    ml_captured_at: "2026-09-22T00:00:00.000Z",
    followers_at_release: 878646,
    popularity_at_release: 70,
    label: "EMI",
    forecast_artist_source: "track_primary",
  };
}

describe("rowForPgrst204Retry", () => {
  it("fails instead of dropping Songstats columns", () => {
    const result = rowForPgrst204Retry(sampleRow(), {
      code: "PGRST204",
      message:
        "Could not find the 'inputs_version' column of 'releases' in the schema cache",
    });
    expect(result).toEqual({
      ok: false,
      error: SONGSTATS_SCHEMA_REQUIRED_ERROR,
    });
  });

  it("retries without ad-spend columns and keeps every protected Songstats column", () => {
    const row = sampleRow();
    const result = rowForPgrst204Retry(row, {
      code: "PGRST204",
      message:
        "Could not find the 'meta_traffic_spend_planned' column of 'releases' in the schema cache",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.row.meta_traffic_spend_planned).toBeUndefined();
    expect(result.row.meta_awareness_spend_planned).toBeUndefined();
    for (const column of PROTECTED_SONGSTATS_RELEASE_COLUMNS) {
      expect(result.row).toHaveProperty(column, row[column]);
    }
  });
});
