import { describe, expect, it } from "vitest";
import {
  asBenchmarkSpotifySurface,
  asMetaAdSurface,
  asSpotifyAdSurface,
  classifyMetaSurfaceFromCtr,
  classifyMetaSurfaceFromResultIndicator,
  releaseFormatFromCampaignType,
  resolveMetaSurface,
} from "./ad-campaign-surface";

describe("classifyMetaSurfaceFromCtr", () => {
  it("returns null when impressions are missing or zero", () => {
    expect(classifyMetaSurfaceFromCtr(50, null)).toEqual({
      surface: null,
      source: null,
    });
    expect(classifyMetaSurfaceFromCtr(50, undefined)).toEqual({
      surface: null,
      source: null,
    });
    expect(classifyMetaSurfaceFromCtr(50, 0)).toEqual({
      surface: null,
      source: null,
    });
    expect(classifyMetaSurfaceFromCtr(50, -10)).toEqual({
      surface: null,
      source: null,
    });
  });

  it("treats missing link_clicks as zero and classifies low CTR as awareness", () => {
    expect(classifyMetaSurfaceFromCtr(null, 1000)).toEqual({
      surface: "meta_awareness",
      source: "ctr_rule",
    });
    expect(classifyMetaSurfaceFromCtr(9, 1000)).toEqual({
      surface: "meta_awareness",
      source: "ctr_rule",
    });
  });

  it("classifies CTR at or above 2 percent as traffic", () => {
    expect(classifyMetaSurfaceFromCtr(20, 1000)).toEqual({
      surface: "meta_traffic",
      source: "ctr_rule",
    });
    expect(classifyMetaSurfaceFromCtr(50, 1000)).toEqual({
      surface: "meta_traffic",
      source: "ctr_rule",
    });
  });

  it("leaves the 1 to 2 percent band unclassified", () => {
    expect(classifyMetaSurfaceFromCtr(10, 1000)).toEqual({
      surface: null,
      source: null,
    });
    expect(classifyMetaSurfaceFromCtr(19, 1000)).toEqual({
      surface: null,
      source: null,
    });
  });
});

describe("releaseFormatFromCampaignType", () => {
  it("maps SINGLE to single and ALBUM or EP to album", () => {
    expect(releaseFormatFromCampaignType("SINGLE")).toBe("single");
    expect(releaseFormatFromCampaignType("album")).toBe("album");
    expect(releaseFormatFromCampaignType("EP")).toBe("album");
    expect(releaseFormatFromCampaignType(" ep ")).toBe("album");
  });

  it("returns null when the campaign type is missing or unknown", () => {
    expect(releaseFormatFromCampaignType(null)).toBeNull();
    expect(releaseFormatFromCampaignType("")).toBeNull();
    expect(releaseFormatFromCampaignType("compilation")).toBeNull();
  });
});

describe("surface read helpers", () => {
  it("accepts stored Spotify products and prefixes the benchmark union", () => {
    expect(asSpotifyAdSurface("marquee")).toBe("marquee");
    expect(asSpotifyAdSurface("showcase")).toBe("showcase");
    expect(asSpotifyAdSurface("spotify_marquee")).toBeNull();
    expect(asBenchmarkSpotifySurface("marquee")).toBe("spotify_marquee");
    expect(asBenchmarkSpotifySurface("showcase")).toBe("spotify_showcase");
  });

  it("accepts only the two Meta surfaces", () => {
    expect(asMetaAdSurface("meta_awareness")).toBe("meta_awareness");
    expect(asMetaAdSurface("meta_traffic")).toBe("meta_traffic");
    expect(asMetaAdSurface("meta_lpv")).toBeNull();
  });
});

describe("classifyMetaSurfaceFromResultIndicator", () => {
  it("maps ThruPlay, reach, and video-view indicators to awareness", () => {
    expect(
      classifyMetaSurfaceFromResultIndicator(
        "video_thruplay_watched_actions",
      ),
    ).toEqual({ surface: "meta_awareness", source: "imported" });
    expect(classifyMetaSurfaceFromResultIndicator("reach")).toEqual({
      surface: "meta_awareness",
      source: "imported",
    });
    expect(classifyMetaSurfaceFromResultIndicator("video_view")).toEqual({
      surface: "meta_awareness",
      source: "imported",
    });
    expect(
      classifyMetaSurfaceFromResultIndicator("actions:video_view"),
    ).toEqual({ surface: "meta_awareness", source: "imported" });
  });

  it("maps link click and landing-page view to traffic", () => {
    expect(
      classifyMetaSurfaceFromResultIndicator("actions:link_click"),
    ).toEqual({ surface: "meta_traffic", source: "imported" });
    expect(
      classifyMetaSurfaceFromResultIndicator(
        "actions:omni_landing_page_view",
      ),
    ).toEqual({ surface: "meta_traffic", source: "imported" });
  });

  it("leaves blank, pixel, engagement, and profile-visit values unclassified", () => {
    expect(classifyMetaSurfaceFromResultIndicator(null)).toEqual({
      surface: null,
      source: null,
    });
    expect(classifyMetaSurfaceFromResultIndicator("")).toEqual({
      surface: null,
      source: null,
    });
    expect(
      classifyMetaSurfaceFromResultIndicator("actions:post_engagement"),
    ).toEqual({ surface: null, source: null });
    expect(
      classifyMetaSurfaceFromResultIndicator("profile_visit_view"),
    ).toEqual({ surface: null, source: null });
    expect(
      classifyMetaSurfaceFromResultIndicator(
        "actions:offsite_conversion.fb_pixel_view_content",
      ),
    ).toEqual({ surface: null, source: null });
    expect(
      classifyMetaSurfaceFromResultIndicator(
        "actions:visit_instagram_profile",
      ),
    ).toEqual({ surface: null, source: null });
  });
});

describe("resolveMetaSurface", () => {
  it("lets Result indicator win over a conflicting CTR class", () => {
    expect(
      resolveMetaSurface({
        resultIndicator: "actions:link_click",
        linkClicks: 3,
        impressions: 1000,
      }),
    ).toEqual({ surface: "meta_traffic", source: "imported" });
  });

  it("fills with the CTR rule when the indicator is blank or unmapped", () => {
    expect(
      resolveMetaSurface({
        resultIndicator: "",
        linkClicks: 3,
        impressions: 1000,
      }),
    ).toEqual({ surface: "meta_awareness", source: "ctr_rule" });
    expect(
      resolveMetaSurface({
        resultIndicator: "actions:post_engagement",
        linkClicks: 50,
        impressions: 1000,
      }),
    ).toEqual({ surface: "meta_traffic", source: "ctr_rule" });
  });

  it("stays null when both the indicator and CTR band are unclassified", () => {
    expect(
      resolveMetaSurface({
        resultIndicator: "profile_visit_view",
        linkClicks: 15,
        impressions: 1000,
      }),
    ).toEqual({ surface: null, source: null });
  });
});
