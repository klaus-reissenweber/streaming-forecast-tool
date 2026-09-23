import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { inserts } = vi.hoisted(() => ({
  inserts: [] as Array<{
    isrc: string;
    endpoint: string;
    source: string | null;
    http_status: number;
    payload: unknown;
  }>,
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    from: (table: string) => ({
      insert: async (row: (typeof inserts)[number]) => {
        expect(table).toBe("songstats_snapshots");
        inserts.push(row);
        return { error: null };
      },
    }),
  }),
}));

import {
  getAccountStatus,
  getArtistStats,
  getTrackHistory,
  getTrackInfo,
  getTrackSearch,
  getTrackStats,
  getTrackTotals,
  labelFromTrackInfo,
  parseAccountStatus,
  parseArtistSearch,
  parseArtistStats,
  parseResolvedTrackInfo,
  parseTrackEditorial,
  parseTrackHistory,
  parseTrackInfo,
  parseTrackSearch,
  parseTrackSearchResults,
  parseTrackTotals,
  searchArtists,
  searchTracks,
  spotifyIsrcFromTrackInfo,
} from "./client";

const PROBE = join(
  process.cwd(),
  "analysis/songstats-probe/GBUM72501895",
);
const ARTISTS = join(
  process.cwd(),
  "analysis/songstats-probe/artists",
);

function readProbe(
  name: string,
  dir = PROBE,
): { status?: number; body: unknown } {
  return JSON.parse(readFileSync(join(dir, name), "utf8")) as {
    status?: number;
    body: unknown;
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("songstats parsers (saved GBUM72501895 files)", () => {
  const info = readProbe("tracks-info-isrc.json").body;
  const stats = readProbe("tracks-stats-resolved.json").body;
  const history = readProbe("tracks-historic-stats.json").body;
  const search = readProbe("tracks-search.json").body;
  const status = readProbe("status.json").body;

  it("reads track_info from body.track_info", () => {
    const track = parseTrackInfo(info);
    expect(track.songstats_track_id).toBe("8hnvgbxd");
    expect(track.title).toBe("Your Loving");
    expect(track.release_date).toBe("2025-05-09");
  });

  it("reads Spotify ISRC and first label from track_info", () => {
    const track = parseTrackInfo(info);
    expect(spotifyIsrcFromTrackInfo(track)).toBe("GBUM72501895");
    expect(labelFromTrackInfo(track)).toBe("EMI");
  });

  it("reads search hits from body.results", () => {
    expect(parseTrackSearch(search)).toEqual([
      {
        songstats_track_id: "8hnvgbxd",
        title: "Your Loving",
        artists: [
          { name: "Duke Dumont", songstats_artist_id: "q7j20h54" },
        ],
        release_date: "2025-05-09",
        labels: [
          { name: "EMI", songstats_label_id: "8eu0pqml" },
          { name: "EMI Music Group", songstats_label_id: "sb4prhnz" },
        ],
      },
    ]);
  });

  it("reads artist search from body.results", () => {
    const artistSearch = readProbe("search__duke-dumont.json", ARTISTS).body;
    expect(parseArtistSearch(artistSearch)).toEqual([
      {
        songstatsArtistId: "q7j20h54",
        name: "Duke Dumont",
        avatarUrl:
          "https://i.scdn.co/image/ab67616100005174c0791f9c2d17dfd58e301c91",
        siteUrl: "https://songstats.com/artist/q7j20h54/duke-dumont",
      },
    ]);
  });

  it("reads Spotify artist stats selected by source", () => {
    const artistStats = readProbe("stats__duke-dumont.json", ARTISTS).body;
    expect(parseArtistStats(artistStats, "2026-09-22T00:00:00.000Z")).toEqual({
      monthlyListeners: 9894457,
      followers: 878646,
      popularity: 70,
      capturedAt: "2026-09-22T00:00:00.000Z",
    });
  });

  it("reads track search paths from the saved file", () => {
    expect(parseTrackSearchResults(search)).toEqual([
      {
        songstatsTrackId: "8hnvgbxd",
        title: "Your Loving",
        artists: [
          { songstatsArtistId: "q7j20h54", name: "Duke Dumont" },
        ],
        releaseDate: "2025-05-09",
        isrcs: [],
      },
    ]);
  });

  it("resolves track info by the saved ISRC and id shapes", () => {
    expect(parseResolvedTrackInfo(info)).toMatchObject({
      title: "Your Loving",
      releaseDate: "2025-05-09",
      label: "EMI",
      songstatsTrackId: "8hnvgbxd",
      isrc: "GBUM72501895",
      artists: [{ songstatsArtistId: "q7j20h54", name: "Duke Dumont" }],
    });
    expect(parseResolvedTrackInfo(info).genres).toContain("Dance");
  });

  it("reads current_month_total_requested_objects from body.status", () => {
    expect(parseAccountStatus(status)).toEqual({
      current_month_total_requested_objects: 0,
    });
  });

  it("reads editorial keys selected by source", () => {
    expect(parseTrackEditorial(stats)).toEqual([
      { source: "spotify", playlists_editorial_current: 0, playlists_editorial_total: 20 },
      { source: "apple_music", playlists_editorial_current: 1, playlists_editorial_total: 10 },
      { source: "amazon", playlists_editorial_current: 0, playlists_editorial_total: 73 },
      { source: "deezer", playlists_editorial_current: 1, playlists_editorial_total: 8 },
      { source: "youtube", playlists_editorial_current: 3, playlists_editorial_total: 14 },
      { source: "tidal", playlists_editorial_current: 0, playlists_editorial_total: 0 },
      { source: "soundcloud", playlists_editorial_current: 0, playlists_editorial_total: 0 },
    ]);
  });

  it("reads history from the source entry, not index 0", () => {
    const rows = parseTrackHistory(history, "spotify");
    expect(rows).toHaveLength(503);
    expect(rows[0]).toEqual({
      date: "2025-05-08",
      streams_total: 0,
      popularity_current: 0,
      daily_streams: null,
    });
    expect(rows[1]).toEqual({
      date: "2025-05-09",
      streams_total: 0,
      popularity_current: 0,
      daily_streams: 0,
    });
    expect(rows[2]).toEqual({
      date: "2025-05-10",
      streams_total: 3069,
      popularity_current: 0,
      daily_streams: 3069,
    });
    expect(rows[502]).toMatchObject({
      date: "2026-09-22",
      streams_total: 3067097,
      popularity_current: 40,
      daily_streams: expect.any(Number),
    });
    expect(rows[502]!.daily_streams).toBe(
      rows[502]!.streams_total - rows[501]!.streams_total,
    );
  });

  it("selects history by source when spotify is not first", () => {
    const body = history as {
      stats: Array<{ source: string; data: { history: unknown[] } }>;
    };
    const reordered = {
      ...body,
      stats: [
        { source: "deezer", data: { history: [] } },
        body.stats[0],
      ],
    };
    const rows = parseTrackHistory(reordered, "spotify");
    expect(rows[0]?.date).toBe("2025-05-08");
    expect(rows).toHaveLength(503);
  });

  it("reads Spotify cumulative streams from body.stats[i].data.streams_total", () => {
    expect(parseTrackTotals(stats)).toEqual({
      streamsTotal: 3067097,
      popularity: 40,
      source: "spotify",
    });
  });

  it("selects totals by source when spotify is not first", () => {
    const body = stats as {
      stats: Array<{ source: string; data: Record<string, unknown> }>;
    };
    const reordered = {
      ...body,
      stats: [{ source: "deezer", data: { streams_total: 1 } }, body.stats[0]],
    };
    expect(parseTrackTotals(reordered).streamsTotal).toBe(3067097);
  });

  it("throws the failed path when the saved shape is missing", () => {
    expect(() => parseTrackInfo({ result: "error", message: "Track not found. " })).toThrow(
      "body.track_info",
    );
    expect(() => parseTrackHistory(history, "deezer")).toThrow(
      "body.stats[source=deezer]",
    );
    expect(() => parseTrackHistory({ stats: [{ source: "spotify" }] }, "spotify")).toThrow(
      "body.stats[0].data",
    );
    expect(() =>
      parseTrackEditorial({
        stats: [
          {
            source: "spotify",
            data: { playlists_editorial_current: 1 },
          },
        ],
      }),
    ).toThrow("body.stats[0].data.playlists_editorial_total");
    expect(() =>
      parseTrackTotals({
        stats: [{ source: "spotify", data: { popularity_current: 40 } }],
      }),
    ).toThrow("body.stats[0].data.streams_total");
    expect(() => parseTrackSearch({ result: "success" })).toThrow("body.results");
    expect(() => parseAccountStatus({ result: "success" })).toThrow("body.status");
    expect(() =>
      spotifyIsrcFromTrackInfo({ links: [{ source: "deezer", isrc: "X" }] }),
    ).toThrow("body.track_info.links[source=spotify].isrc");
  });

  it("chooses the Spotify ISRC when other sources carry a different ISRC", () => {
    expect(
      spotifyIsrcFromTrackInfo({
        links: [
          { source: "beatport", isrc: "GBUM72502520" },
          { source: "spotify", isrc: "GBUM72501895" },
          { source: "deezer", isrc: "OTHER0000001" },
        ],
      }),
    ).toBe("GBUM72501895");
  });
});

describe("songstats client snapshots before parse", () => {
  beforeEach(() => {
    inserts.length = 0;
    process.env.SONGSTATS_API_KEY = "test-key";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("inserts non-200 info before throwing body.track_info", async () => {
    const saved = readProbe("tracks-info-upc.json");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(saved.body, 404)));

    await expect(getTrackInfo("GBUM72501895")).rejects.toThrow("body.track_info");
    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toEqual({
      isrc: "GBUM72501895",
      endpoint: "tracks/info",
      source: null,
      http_status: 404,
      payload: saved.body,
    });
  });

  it("sends apikey and snapshots history before returning daily rows", async () => {
    const saved = readProbe("tracks-historic-stats.json");
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(saved.body, 200));
    vi.stubGlobal("fetch", fetchMock);

    const rows = await getTrackHistory("GBUM72501895");
    expect(rows[0]?.daily_streams).toBeNull();
    expect(rows[2]?.daily_streams).toBe(3069);

    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(String(url)).toBe(
      "https://api.songstats.com/enterprise/v1/tracks/historic_stats?isrc=GBUM72501895&source=spotify",
    );
    expect((init.headers as Record<string, string>).apikey).toBe("test-key");
    expect(inserts[0]).toMatchObject({
      isrc: "GBUM72501895",
      endpoint: "tracks/historic_stats",
      source: "spotify",
      http_status: 200,
      payload: saved.body,
    });
  });

  it("snapshots stats then returns Spotify totals from streams_total", async () => {
    const saved = readProbe("tracks-stats-resolved.json");
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(saved.body, 200));
    vi.stubGlobal("fetch", fetchMock);

    const totals = await getTrackTotals("GBUM72501895");
    expect(totals).toMatchObject({
      streamsTotal: 3067097,
      popularity: 40,
      source: "spotify",
    });
    expect(typeof totals.fetchedAt).toBe("string");
    expect(inserts[0]).toMatchObject({
      isrc: "GBUM72501895",
      endpoint: "tracks/stats",
      source: "spotify",
      http_status: 200,
      payload: saved.body,
    });
    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(String(url)).toBe(
      "https://api.songstats.com/enterprise/v1/tracks/stats?isrc=GBUM72501895",
    );
    expect((init.headers as Record<string, string>).apikey).toBe("test-key");
  });

  it("snapshots search then returns body.results hits", async () => {
    const saved = readProbe("tracks-search.json");
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(saved.body, 200));
    vi.stubGlobal("fetch", fetchMock);

    const hits = await getTrackSearch("GBUM72501895");
    expect(hits[0]?.songstats_track_id).toBe("8hnvgbxd");
    expect(inserts[0]).toMatchObject({
      isrc: "search:GBUM72501895",
      endpoint: "tracks/search",
      source: null,
      http_status: 200,
      payload: saved.body,
    });
    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(String(url)).toBe(
      "https://api.songstats.com/enterprise/v1/tracks/search?q=GBUM72501895",
    );
    expect((init.headers as Record<string, string>).apikey).toBe("test-key");
  });

  it("snapshots artists/search then returns hits", async () => {
    const saved = readProbe("search__duke-dumont.json", ARTISTS);
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(saved.body, 200));
    vi.stubGlobal("fetch", fetchMock);
    const hits = await searchArtists("Duke Dumont");
    expect(hits[0]?.songstatsArtistId).toBe("q7j20h54");
    expect(inserts[0]).toMatchObject({
      endpoint: "artists/search",
      http_status: 200,
      payload: saved.body,
    });
  });

  it("snapshots artists/stats then returns Spotify listeners", async () => {
    const saved = readProbe("stats__duke-dumont.json", ARTISTS);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(saved.body, 200)));
    const stats = await getArtistStats("q7j20h54");
    expect(stats.monthlyListeners).toBe(9894457);
    expect(inserts[0]).toMatchObject({
      endpoint: "artists/stats",
      source: "spotify",
      payload: saved.body,
    });
  });

  it("getTrackInfo accepts ISRC or songstats_track_id", async () => {
    const saved = readProbe("tracks-info-isrc.json");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(saved.body, 200)));
    await expect(getTrackInfo("GBUM72501895", "isrc")).resolves.toMatchObject({
      isrc: "GBUM72501895",
      songstatsTrackId: "8hnvgbxd",
    });
    inserts.length = 0;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(saved.body, 200)));
    await expect(getTrackInfo("8hnvgbxd", "songstats_track_id")).resolves.toMatchObject({
      title: "Your Loving",
      songstatsTrackId: "8hnvgbxd",
    });
  });

  it("snapshots tracks/search via searchTracks", async () => {
    const saved = readProbe("tracks-search.json");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(saved.body, 200)));
    const hits = await searchTracks("GBUM72501895");
    expect(hits[0]?.songstatsTrackId).toBe("8hnvgbxd");
    expect(hits[0]?.isrcs).toEqual([]);
  });

  it("snapshots status then returns the object count", async () => {
    const saved = readProbe("status.json");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(saved.body, 200)));

    await expect(getAccountStatus()).resolves.toEqual({
      current_month_total_requested_objects: 0,
    });
    expect(inserts[0]).toMatchObject({
      isrc: "status",
      endpoint: "status",
      source: null,
      http_status: 200,
      payload: saved.body,
    });
  });

  it("snapshots stats then returns editorial selected by source", async () => {
    const saved = readProbe("tracks-stats-resolved.json");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(saved.body, 200)));

    const editorial = await getTrackStats("GBUM72501895");
    expect(editorial.find((row) => row.source === "spotify")).toEqual({
      source: "spotify",
      playlists_editorial_current: 0,
      playlists_editorial_total: 20,
    });
    expect(inserts[0]).toMatchObject({
      endpoint: "tracks/stats",
      source: null,
      http_status: 200,
    });
  });
});
