import { describe, it, expect } from "vitest";
import {
  benchmarkGenre,
  classify,
  findBenchmark,
  findFormatReference,
  marginVsBenchmark,
} from "./ad-benchmarks";
import { campaignFindings, channelComparisonFindings, metaFunnelFindings, type AdCampaign, type AdRelease } from "./ads";

const bassRelease: AdRelease = { genre: "dubstep" };

function meta(partial: Partial<AdCampaign> & Pick<AdCampaign, "metrics">): AdCampaign {
  return {
    platform: "meta",
    surface: "meta_traffic",
    previous: null,
    ...partial,
  };
}

describe("ad-benchmarks", () => {
  it("maps catalog genres onto bass or house, and leaves unknown genres null", () => {
    expect(benchmarkGenre("dubstep")).toBe("bass");
    expect(benchmarkGenre("melodic-bass")).toBe("bass");
    expect(benchmarkGenre("garage")).toBeNull();
  });

  it("classifies 24 percent below the bass traffic CPC excellent line", () => {
    const bench = findBenchmark("meta_traffic", "bass", "cpc")!;
    expect(bench.excellent).toBe(0.25);
    expect(classify(0.19, bench)).toBe("excellent");
    expect(marginVsBenchmark(0.19, bench)).toBeCloseTo(0.24, 10);
  });

  it("does not return an album conversion reference for a single", () => {
    const album = findFormatReference("spotify_showcase", "album", "conversion_rate")!;
    const single = findFormatReference("spotify_showcase", "single", "conversion_rate")!;
    expect(album.average).toBe(2);
    expect(single.average).not.toBe(album.average);
    expect(findFormatReference("spotify_showcase", "single", "cpc")).toBeNull();
  });
});

describe("campaignFindings", () => {
  it("names the Meta verdict and the margin", () => {
    const f = campaignFindings(
      meta({ metrics: [{ key: "cpc", value: 0.19 }] }),
      bassRelease,
    );
    expect(f[0]!.text).toBe(
      "Cost per click of $0.19 is excellent for a bass traffic campaign, 24 percent below the $0.25 threshold.",
    );
  });

  it("names the Spotify format average and never uses the album number for a single", () => {
    const album = campaignFindings(
      {
        platform: "spotify",
        surface: "spotify_showcase",
        metrics: [{ key: "conversion_rate", value: 3.26 }],
      },
      { genre: "house", format: "album" },
    );
    expect(album[0]!.text).toBe(
      "Conversion rate of 3.26 percent is 63 percent above the 2025 album benchmark of 2.00 percent.",
    );

    const single = campaignFindings(
      {
        platform: "spotify",
        surface: "spotify_showcase",
        metrics: [{ key: "conversion_rate", value: 3.26 }],
      },
      { genre: "house", format: "single" },
    );
    expect(single[0]!.text).toContain("single benchmark");
    expect(single[0]!.text).not.toContain("2.00");
    expect(single[0]!.text).not.toContain("album");
  });

  it("emits nothing for a metric with no reference, rather than a hedge", () => {
    const f = campaignFindings(
      meta({ metrics: [{ key: "cost_per_signup", value: 3.68 }] }),
      bassRelease,
    );
    expect(f).toEqual([]);
    expect(f.some((x) => /n\/a|unknown|could not|roughly|unavailable/i.test(x.text))).toBe(
      false,
    );
  });

  it("says the genre has no benchmark instead of guessing one", () => {
    const f = campaignFindings(
      meta({ metrics: [{ key: "cpc", value: 0.19 }] }),
      { genre: "garage" },
    );
    expect(f.map((x) => x.id)).toEqual(["genre"]);
    expect(f[0]!.text).toBe("garage has no benchmark.");
    expect(f[0]!.text).not.toContain("bass");
    expect(f[0]!.text).not.toContain("excellent");
  });

  it("skips Spotify benchmarks when the release format is missing", () => {
    const f = campaignFindings(
      {
        platform: "spotify",
        surface: "spotify_showcase",
        metrics: [{ key: "conversion_rate", value: 3.26 }],
      },
      { genre: "house", format: null },
    );
    expect(f).toEqual([]);
  });

  it("ignores YouTube and TikTok rows", () => {
    const metrics = [{ key: "cpc", value: 0.19 }];
    expect(
      campaignFindings(
        { platform: "youtube", surface: "youtube_trueview", metrics },
        bassRelease,
      ),
    ).toEqual([]);
    expect(
      campaignFindings(
        { platform: "tiktok", surface: "tiktok", metrics },
        bassRelease,
      ),
    ).toEqual([]);
  });

  it("names the best and worst market on the primary metric", () => {
    const f = campaignFindings(
      meta({
        metrics: [{ key: "cpc", value: 0.12 }],
        rows: [
          {
            market: "Chicago",
            metrics: [
              { key: "cpc", value: 0.12 },
              { key: "ctr", value: 6.48 },
            ],
          },
          {
            market: "Dallas",
            metrics: [
              { key: "cpc", value: 0.31 },
              { key: "ctr", value: 1.1 },
            ],
          },
        ],
      }),
      bassRelease,
    );
    const best = f.find((x) => x.id === "market-best")!;
    const worst = f.find((x) => x.id === "market-worst")!;
    expect(best.text).toBe(
      "Chicago led on both counts: 6.48 percent click-through rate at $0.12 per click.",
    );
    expect(worst.text).toBe("Dallas trailed at $0.31 per click.");
  });

  it("does not rank markets when there is only one row", () => {
    const f = campaignFindings(
      meta({
        metrics: [{ key: "cpc", value: 0.12 }],
        rows: [{ market: "Chicago", metrics: [{ key: "cpc", value: 0.12 }] }],
      }),
      bassRelease,
    );
    expect(f.some((x) => x.id.startsWith("market"))).toBe(false);
  });

  it("compares the same artist's previous campaign on the same surface", () => {
    const f = campaignFindings(
      meta({
        metrics: [{ key: "cost_per_signup", value: 3.68 }],
        previous: { metrics: [{ key: "cost_per_signup", value: 4.04 }] },
      }),
      bassRelease,
    );
    expect(f.find((x) => x.id === "previous:cost_per_signup")!.text).toBe(
      "Cost per signup fell from $4.04 to $3.68.",
    );
  });

  it("emits no Meta metric verdict when surface is missing", () => {
    const f = campaignFindings(
      meta({
        surface: null,
        metrics: [{ key: "cpc", value: 0.19 }],
      }),
      bassRelease,
    );
    expect(f.some((x) => x.id.startsWith("benchmark"))).toBe(false);
  });
});

describe("channelComparisonFindings", () => {
  it("prefixes each channel verdict and names the cost-per-stream gap", () => {
    const f = channelComparisonFindings(
      [
        {
          id: "marquee",
          label: "Marquee",
          costPerStream: 0.12,
          campaign: {
            platform: "spotify",
            surface: "spotify_marquee",
            metrics: [{ key: "conversion_rate", value: 6.5 }],
          },
        },
        {
          id: "meta_traffic",
          label: "Meta Traffic",
          costPerStream: 0.41,
          campaign: meta({ metrics: [{ key: "cpc", value: 0.19 }] }),
        },
      ],
      { genre: "dubstep", format: "single" },
    );
    expect(f.find((x) => x.id === "marquee:benchmark:conversion_rate")!.text).toBe(
      "Marquee: Conversion rate of 6.50 percent matches the 2025 single benchmark of 6.50 percent.",
    );
    expect(f.find((x) => x.id === "meta_traffic:benchmark:cpc")!.text).toContain(
      "Meta Traffic:",
    );
    expect(f.find((x) => x.id === "cps-gap")!.text).toBe(
      "Marquee cost $0.12 per stream, 71 percent below Meta Traffic at $0.41.",
    );
  });

  it("emits no gap when only one channel has a cost per stream", () => {
    const f = channelComparisonFindings(
      [
        {
          id: "meta_traffic",
          label: "Meta Traffic",
          costPerStream: 0.41,
          campaign: meta({ metrics: [{ key: "cpc", value: 0.19 }] }),
        },
        {
          id: "meta_awareness",
          label: "Meta Awareness",
          costPerStream: null,
          campaign: {
            platform: "meta",
            surface: "meta_awareness",
            metrics: [],
          },
        },
      ],
      bassRelease,
    );
    expect(f.some((x) => x.id === "cps-gap")).toBe(false);
  });
});

describe("metaFunnelFindings", () => {
  it("names the predicted-vs-measured gap and what it implies for the funnel", () => {
    const f = metaFunnelFindings({
      predictedSpotifyClicks: 100,
      measuredSpotifyClicks: 435,
      clicksVariancePct: 335,
      cpc: 0.15,
      spotifyClickShare: 0.45,
    });
    expect(f[0]!.text).toBe(
      "Measured Spotify clicks of 435 came in 335 percent above the 100 the funnel predicted.",
    );
    expect(f[1]!.text).toBe(
      "A miss of that size means the model's cost per click of $0.15, its 45 percent Spotify click share, or both, understated delivery.",
    );
  });

  it("emits nothing when measured clicks are missing", () => {
    expect(
      metaFunnelFindings({
        predictedSpotifyClicks: 100,
        measuredSpotifyClicks: null,
        clicksVariancePct: null,
        cpc: 0.15,
        spotifyClickShare: 0.45,
      }),
    ).toEqual([]);
  });
});
