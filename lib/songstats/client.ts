import { createServiceClient } from "@/lib/supabase/service";

const BASE = "https://api.songstats.com/enterprise/v1";

export type TrackHistoryRow = {
  date: string;
  streams_total: number;
  popularity_current: number;
  daily_streams: number | null;
};

export type TrackEditorial = {
  source: string;
  playlists_editorial_current: number;
  playlists_editorial_total: number;
};

export type TrackTotals = {
  streamsTotal: number;
  popularity: number;
  source: "spotify";
  fetchedAt: string;
};

export type TrackSearchArtist = {
  name: string;
  songstats_artist_id: string;
};

export type TrackSearchLabel = {
  name: string;
  songstats_label_id: string;
};

export type TrackSearchHit = {
  songstats_track_id: string;
  title: string;
  artists: TrackSearchArtist[];
  release_date: string;
  labels: TrackSearchLabel[];
};

export type AccountStatus = {
  current_month_total_requested_objects: number;
};

export type ArtistSearchHit = {
  songstatsArtistId: string;
  name: string;
  avatarUrl: string;
  siteUrl: string;
};

export type ArtistStats = {
  monthlyListeners: number;
  followers: number;
  popularity: number;
  capturedAt: string;
};

export type TrackSearchResult = {
  songstatsTrackId: string;
  title: string;
  artists: Array<{ songstatsArtistId: string; name: string }>;
  releaseDate: string;
  isrcs: string[];
};

export type TrackInfo = {
  title: string;
  releaseDate: string;
  label: string;
  genres: string[];
  songstatsTrackId: string;
  isrc: string;
  artists: Array<{ songstatsArtistId: string; name: string }>;
};

function fail(path: string): never {
  throw new Error(path);
}

function asRecord(value: unknown, path: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail(path);
  }
  return value as Record<string, unknown>;
}

function asArray(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) fail(path);
  return value;
}

function asNumber(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) fail(path);
  return value;
}

function asString(value: unknown, path: string): string {
  if (typeof value !== "string") fail(path);
  return value;
}

function selectStatsEntry(
  body: unknown,
  source: string,
): { index: number; entry: Record<string, unknown> } {
  const root = asRecord(body, "body");
  const stats = asArray(root.stats, "body.stats");
  for (let i = 0; i < stats.length; i++) {
    const entry = asRecord(stats[i], `body.stats[${i}]`);
    const entrySource = asString(entry.source, `body.stats[${i}].source`);
    if (entrySource === source) {
      return { index: i, entry };
    }
  }
  fail(`body.stats[source=${source}]`);
}

export function parseTrackInfo(body: unknown): Record<string, unknown> {
  const root = asRecord(body, "body");
  return asRecord(root.track_info, "body.track_info");
}

export function parseTrackSearch(body: unknown): TrackSearchHit[] {
  const root = asRecord(body, "body");
  const results = asArray(root.results, "body.results");
  const hits: TrackSearchHit[] = [];
  for (let i = 0; i < results.length; i++) {
    const row = asRecord(results[i], `body.results[${i}]`);
    const artistsRaw = asArray(row.artists, `body.results[${i}].artists`);
    const labelsRaw = asArray(row.labels, `body.results[${i}].labels`);
    const artists: TrackSearchArtist[] = [];
    for (let j = 0; j < artistsRaw.length; j++) {
      const artist = asRecord(artistsRaw[j], `body.results[${i}].artists[${j}]`);
      artists.push({
        name: asString(artist.name, `body.results[${i}].artists[${j}].name`),
        songstats_artist_id: asString(
          artist.songstats_artist_id,
          `body.results[${i}].artists[${j}].songstats_artist_id`,
        ),
      });
    }
    const labels: TrackSearchLabel[] = [];
    for (let j = 0; j < labelsRaw.length; j++) {
      const label = asRecord(labelsRaw[j], `body.results[${i}].labels[${j}]`);
      labels.push({
        name: asString(label.name, `body.results[${i}].labels[${j}].name`),
        songstats_label_id: asString(
          label.songstats_label_id,
          `body.results[${i}].labels[${j}].songstats_label_id`,
        ),
      });
    }
    hits.push({
      songstats_track_id: asString(
        row.songstats_track_id,
        `body.results[${i}].songstats_track_id`,
      ),
      title: asString(row.title, `body.results[${i}].title`),
      artists,
      release_date: asString(row.release_date, `body.results[${i}].release_date`),
      labels,
    });
  }
  return hits;
}

export function parseAccountStatus(body: unknown): AccountStatus {
  const root = asRecord(body, "body");
  const status = asRecord(root.status, "body.status");
  return {
    current_month_total_requested_objects: asNumber(
      status.current_month_total_requested_objects,
      "body.status.current_month_total_requested_objects",
    ),
  };
}

export function spotifyIsrcFromTrackInfo(info: Record<string, unknown>): string {
  const links = asArray(info.links, "body.track_info.links");
  for (let i = 0; i < links.length; i++) {
    const link = asRecord(links[i], `body.track_info.links[${i}]`);
    const source = asString(link.source, `body.track_info.links[${i}].source`);
    if (source === "spotify") {
      return asString(link.isrc, `body.track_info.links[${i}].isrc`);
    }
  }
  fail("body.track_info.links[source=spotify].isrc");
}

export function labelFromTrackInfo(info: Record<string, unknown>): string {
  const labels = asArray(info.labels, "body.track_info.labels");
  if (labels.length === 0) fail("body.track_info.labels[0]");
  const first = asRecord(labels[0], "body.track_info.labels[0]");
  return asString(first.name, "body.track_info.labels[0].name");
}

export function parseArtistSearch(body: unknown): ArtistSearchHit[] {
  const root = asRecord(body, "body");
  const results = asArray(root.results, "body.results");
  const hits: ArtistSearchHit[] = [];
  for (let i = 0; i < results.length; i++) {
    const row = asRecord(results[i], `body.results[${i}]`);
    hits.push({
      songstatsArtistId: asString(
        row.songstats_artist_id,
        `body.results[${i}].songstats_artist_id`,
      ),
      name: asString(row.name, `body.results[${i}].name`),
      avatarUrl: asString(row.avatar, `body.results[${i}].avatar`),
      siteUrl: asString(row.site_url, `body.results[${i}].site_url`),
    });
  }
  return hits;
}

export function parseArtistStats(
  body: unknown,
  capturedAt: string,
): ArtistStats {
  const { index, entry } = selectStatsEntry(body, "spotify");
  const data = asRecord(entry.data, `body.stats[${index}].data`);
  return {
    monthlyListeners: asNumber(
      data.monthly_listeners_current,
      `body.stats[${index}].data.monthly_listeners_current`,
    ),
    followers: asNumber(
      data.followers_total,
      `body.stats[${index}].data.followers_total`,
    ),
    popularity: asNumber(
      data.popularity_current,
      `body.stats[${index}].data.popularity_current`,
    ),
    capturedAt,
  };
}

export function parseTrackSearchResults(body: unknown): TrackSearchResult[] {
  const hits = parseTrackSearch(body);
  const root = asRecord(body, "body");
  const results = asArray(root.results, "body.results");
  return hits.map((hit, i) => {
    const row = asRecord(results[i], `body.results[${i}]`);
    let isrcs: string[] = [];
    if (Object.prototype.hasOwnProperty.call(row, "isrcs")) {
      const raw = asArray(row.isrcs, `body.results[${i}].isrcs`);
      isrcs = raw.map((value, j) =>
        asString(value, `body.results[${i}].isrcs[${j}]`),
      );
    }
    return {
      songstatsTrackId: hit.songstats_track_id,
      title: hit.title,
      artists: hit.artists.map((artist) => ({
        songstatsArtistId: artist.songstats_artist_id,
        name: artist.name,
      })),
      releaseDate: hit.release_date,
      isrcs,
    };
  });
}

export function parseResolvedTrackInfo(body: unknown): TrackInfo {
  const info = parseTrackInfo(body);
  const artistsRaw = asArray(info.artists, "body.track_info.artists");
  const artists: TrackInfo["artists"] = [];
  for (let i = 0; i < artistsRaw.length; i++) {
    const artist = asRecord(artistsRaw[i], `body.track_info.artists[${i}]`);
    artists.push({
      songstatsArtistId: asString(
        artist.songstats_artist_id,
        `body.track_info.artists[${i}].songstats_artist_id`,
      ),
      name: asString(artist.name, `body.track_info.artists[${i}].name`),
    });
  }
  const genresRaw = asArray(info.genres, "body.track_info.genres");
  const genres = genresRaw.map((value, i) =>
    asString(value, `body.track_info.genres[${i}]`),
  );
  return {
    title: asString(info.title, "body.track_info.title"),
    releaseDate: asString(info.release_date, "body.track_info.release_date"),
    label: labelFromTrackInfo(info),
    genres,
    songstatsTrackId: asString(
      info.songstats_track_id,
      "body.track_info.songstats_track_id",
    ),
    isrc: spotifyIsrcFromTrackInfo(info),
    artists,
  };
}

export function parseTrackEditorial(body: unknown): TrackEditorial[] {
  const root = asRecord(body, "body");
  const stats = asArray(root.stats, "body.stats");
  const rows: TrackEditorial[] = [];
  for (let i = 0; i < stats.length; i++) {
    const entry = asRecord(stats[i], `body.stats[${i}]`);
    const source = asString(entry.source, `body.stats[${i}].source`);
    const data = asRecord(entry.data, `body.stats[${i}].data`);
    if (
      !Object.prototype.hasOwnProperty.call(data, "playlists_editorial_current") &&
      !Object.prototype.hasOwnProperty.call(data, "playlists_editorial_total")
    ) {
      continue;
    }
    rows.push({
      source,
      playlists_editorial_current: asNumber(
        data.playlists_editorial_current,
        `body.stats[${i}].data.playlists_editorial_current`,
      ),
      playlists_editorial_total: asNumber(
        data.playlists_editorial_total,
        `body.stats[${i}].data.playlists_editorial_total`,
      ),
    });
  }
  return rows;
}

export function parseTrackTotals(
  body: unknown,
  source = "spotify",
): Omit<TrackTotals, "fetchedAt"> {
  const { index, entry } = selectStatsEntry(body, source);
  const data = asRecord(entry.data, `body.stats[${index}].data`);
  return {
    streamsTotal: asNumber(
      data.streams_total,
      `body.stats[${index}].data.streams_total`,
    ),
    popularity: asNumber(
      data.popularity_current,
      `body.stats[${index}].data.popularity_current`,
    ),
    source: "spotify",
  };
}

export function parseTrackHistory(
  body: unknown,
  source: string,
): TrackHistoryRow[] {
  const { index, entry } = selectStatsEntry(body, source);
  const data = asRecord(entry.data, `body.stats[${index}].data`);
  const history = asArray(data.history, `body.stats[${index}].data.history`);
  const rows: TrackHistoryRow[] = [];
  for (let j = 0; j < history.length; j++) {
    const row = asRecord(history[j], `body.stats[${index}].data.history[${j}]`);
    const streamsTotal = asNumber(
      row.streams_total,
      `body.stats[${index}].data.history[${j}].streams_total`,
    );
    const prev = rows[j - 1];
    rows.push({
      date: asString(row.date, `body.stats[${index}].data.history[${j}].date`),
      streams_total: streamsTotal,
      popularity_current: asNumber(
        row.popularity_current,
        `body.stats[${index}].data.history[${j}].popularity_current`,
      ),
      daily_streams: prev ? streamsTotal - prev.streams_total : null,
    });
  }
  return rows;
}

async function snapshot(row: {
  isrc: string;
  endpoint: string;
  source: string | null;
  http_status: number;
  payload: unknown;
}): Promise<void> {
  const { error } = await createServiceClient()
    .from("songstats_snapshots")
    .insert(row);
  if (error) {
    throw new Error(error.message);
  }
}

async function request(path: string, query: Record<string, string>): Promise<{
  httpStatus: number;
  payload: unknown;
}> {
  const apiKey = process.env.SONGSTATS_API_KEY;
  if (!apiKey) fail("SONGSTATS_API_KEY");
  const url = new URL(`${BASE}/${path}`);
  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, value);
  }
  const res = await fetch(url, { headers: { apikey: apiKey } });
  const text = await res.text();
  let payload: unknown = text;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }
  return { httpStatus: res.status, payload };
}

async function fetchAndSnapshot(args: {
  isrc: string;
  endpoint: string;
  source: string | null;
  query: Record<string, string>;
}): Promise<unknown> {
  const { httpStatus, payload } = await request(args.endpoint, args.query);
  await snapshot({
    isrc: args.isrc,
    endpoint: args.endpoint,
    source: args.source,
    http_status: httpStatus,
    payload,
  });
  return payload;
}

export async function getTrackInfo(
  identifier: string,
  via: "isrc" | "songstats_track_id" = "isrc",
): Promise<TrackInfo> {
  const payload = await fetchAndSnapshot({
    isrc: identifier,
    endpoint: "tracks/info",
    source: null,
    query: { [via]: identifier },
  });
  return parseResolvedTrackInfo(payload);
}

export async function searchArtists(q: string): Promise<ArtistSearchHit[]> {
  const payload = await fetchAndSnapshot({
    isrc: `artist-search:${q}`,
    endpoint: "artists/search",
    source: null,
    query: { q },
  });
  return parseArtistSearch(payload);
}

export async function getArtistStats(
  songstatsArtistId: string,
): Promise<ArtistStats> {
  const payload = await fetchAndSnapshot({
    isrc: songstatsArtistId,
    endpoint: "artists/stats",
    source: "spotify",
    query: { songstats_artist_id: songstatsArtistId },
  });
  return parseArtistStats(payload, new Date().toISOString());
}

export async function searchTracks(q: string): Promise<TrackSearchResult[]> {
  const payload = await fetchAndSnapshot({
    isrc: `search:${q}`,
    endpoint: "tracks/search",
    source: null,
    query: { q },
  });
  return parseTrackSearchResults(payload);
}

export async function getTrackSearch(q: string): Promise<TrackSearchHit[]> {
  const payload = await fetchAndSnapshot({
    isrc: `search:${q}`,
    endpoint: "tracks/search",
    source: null,
    query: { q },
  });
  return parseTrackSearch(payload);
}

export async function getAccountStatus(): Promise<AccountStatus> {
  const payload = await fetchAndSnapshot({
    isrc: "status",
    endpoint: "status",
    source: null,
    query: {},
  });
  return parseAccountStatus(payload);
}

export async function getTrackStats(isrc: string): Promise<TrackEditorial[]> {
  const payload = await fetchAndSnapshot({
    isrc,
    endpoint: "tracks/stats",
    source: null,
    query: { isrc },
  });
  return parseTrackEditorial(payload);
}

export async function getTrackTotals(isrc: string): Promise<TrackTotals> {
  const payload = await fetchAndSnapshot({
    isrc,
    endpoint: "tracks/stats",
    source: "spotify",
    query: { isrc },
  });
  const parsed = parseTrackTotals(payload, "spotify");
  return {
    ...parsed,
    fetchedAt: new Date().toISOString(),
  };
}

export async function getTrackHistory(
  isrc: string,
  source = "spotify",
): Promise<TrackHistoryRow[]> {
  const payload = await fetchAndSnapshot({
    isrc,
    endpoint: "tracks/historic_stats",
    source,
    query: { isrc, source },
  });
  return parseTrackHistory(payload, source);
}
