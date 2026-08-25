import { describe, it, expect } from "vitest";
import type { AdReportMetricsSnapshot } from "./types";
import {
  RESULT_LABEL_DISPLAY,
  STREAMS_LABEL_DISPLAY,
  displayResultLabel,
  displayStreamsLabel,
  isEstimatedStreams,
  isUnavailableStreams,
  normalizeMetricsSnapshot,
  parseResultLabel,
  parseStreamsLabel,
} from "./labels";

describe("ad-report labels", () => {
  it("parses new enums and the two existing snapshot string shapes", () => {
    expect(parseStreamsLabel("estimated")).toBe("estimated");
    expect(parseStreamsLabel("estimate")).toBe("estimated");
    expect(parseStreamsLabel("measured")).toBe("measured");
    expect(parseStreamsLabel("unavailable")).toBe("unavailable");
    expect(parseStreamsLabel("n/a")).toBe("unavailable");
    expect(parseStreamsLabel(null)).toBeNull();

    expect(parseResultLabel("streams")).toBe("streams");
    expect(parseResultLabel("Streams")).toBe("streams");
    expect(parseResultLabel("spotify_clicks")).toBe("spotify_clicks");
    expect(parseResultLabel("Spotify clicks")).toBe("spotify_clicks");
    expect(parseResultLabel("impressions")).toBe("impressions");
    expect(parseResultLabel("Impressions")).toBe("impressions");
  });

  it("maps enums to display text", () => {
    expect(STREAMS_LABEL_DISPLAY.estimated).toBe("Estimated");
    expect(STREAMS_LABEL_DISPLAY.measured).toBe("Measured");
    expect(STREAMS_LABEL_DISPLAY.unavailable).toBe("Not available");
    expect(displayStreamsLabel("estimate")).toBe("Estimated");
    expect(displayStreamsLabel("n/a")).toBe("Not available");

    expect(RESULT_LABEL_DISPLAY.streams).toBe("Streams");
    expect(RESULT_LABEL_DISPLAY.spotify_clicks).toBe("Spotify clicks");
    expect(RESULT_LABEL_DISPLAY.impressions).toBe("Impressions");
    expect(displayResultLabel("Spotify clicks")).toBe("Spotify clicks");
    expect(displayResultLabel("streams")).toBe("Streams");
  });

  it("treats legacy estimate / n/a as estimated / unavailable", () => {
    expect(isEstimatedStreams("estimate")).toBe(true);
    expect(isEstimatedStreams("estimated")).toBe(true);
    expect(isEstimatedStreams("measured")).toBe(false);
    expect(isUnavailableStreams("n/a")).toBe(true);
    expect(isUnavailableStreams("unavailable")).toBe(true);
  });

  it("normalizes a stored snapshot in memory without requiring a row migration", () => {
    const snapshot = {
      channels: [
        { streamsLabel: "estimate" },
        { streamsLabel: "measured" },
        { streamsLabel: "n/a" },
      ],
      campaigns: [
        { streamsLabel: "estimate", resultLabel: "Streams" },
        { streamsLabel: "measured", resultLabel: "Spotify clicks" },
        { streamsLabel: null, resultLabel: "Impressions" },
      ],
    } as unknown as AdReportMetricsSnapshot;

    normalizeMetricsSnapshot(snapshot);

    expect(snapshot.channels.map((c) => c.streamsLabel)).toEqual([
      "estimated",
      "measured",
      "unavailable",
    ]);
    expect(snapshot.campaigns.map((c) => c.streamsLabel)).toEqual([
      "estimated",
      "measured",
      null,
    ]);
    expect(snapshot.campaigns.map((c) => c.resultLabel)).toEqual([
      "streams",
      "spotify_clicks",
      "impressions",
    ]);
  });
});
