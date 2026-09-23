"use server";

import { requireAllowedUser } from "@/lib/auth/require-allowed-user";
import {
  getArtistStats,
  getTrackInfo,
  searchArtists,
  searchTracks,
  type ArtistSearchHit,
  type ArtistStats,
  type TrackInfo,
  type TrackSearchResult,
} from "@/lib/songstats/client";
import { isValidIsrc } from "@/lib/songstats/create-form";
import {
  assertBillableAllowed,
  SongstatsQuotaExceededError,
} from "@/lib/songstats/quota";

export type SongstatsActionError = {
  success: false;
  error: string;
  quota: boolean;
  fallback: true;
};

export type SearchArtistsResult =
  | { success: true; hits: ArtistSearchHit[] }
  | SongstatsActionError;

export type PickArtistResult =
  | { success: true; stats: ArtistStats; fallback: false }
  | SongstatsActionError;

export type TrackLookupResult =
  | { success: true; track: TrackInfo; fallback: false }
  | SongstatsActionError;

export type SearchTracksResult =
  | { success: true; hits: TrackSearchResult[] }
  | SongstatsActionError;

function fail(
  error: unknown,
  fallbackMessage: string,
): SongstatsActionError {
  if (error instanceof SongstatsQuotaExceededError) {
    return {
      success: false,
      error: error.message,
      quota: true,
      fallback: true,
    };
  }
  return {
    success: false,
    error: error instanceof Error ? error.message : fallbackMessage,
    quota: false,
    fallback: true,
  };
}

async function requireUser(): Promise<SongstatsActionError | null> {
  const auth = await requireAllowedUser();
  if (!auth.ok) {
    return {
      success: false,
      error: auth.error,
      quota: false,
      fallback: true,
    };
  }
  return null;
}

export async function searchSongstatsArtists(
  q: string,
): Promise<SearchArtistsResult> {
  const denied = await requireUser();
  if (denied) return denied;
  const query = q.trim();
  if (query.length < 3) {
    return { success: true, hits: [] };
  }
  try {
    const hits = await searchArtists(query);
    return { success: true, hits };
  } catch (error) {
    return fail(error, "Artist search failed.");
  }
}

export async function pickSongstatsArtist(
  songstatsArtistId: string,
): Promise<PickArtistResult> {
  const denied = await requireUser();
  if (denied) return denied;
  const id = songstatsArtistId.trim();
  if (!id) {
    return {
      success: false,
      error: "Missing Songstats artist id.",
      quota: false,
      fallback: true,
    };
  }
  try {
    await assertBillableAllowed();
    const stats = await getArtistStats(id);
    return { success: true, stats, fallback: false };
  } catch (error) {
    return fail(error, "Could not load artist stats.");
  }
}

export async function lookupSongstatsTrackByIsrc(
  isrc: string,
): Promise<TrackLookupResult> {
  const denied = await requireUser();
  if (denied) return denied;
  const value = isrc.trim().toUpperCase();
  if (!isValidIsrc(value)) {
    return {
      success: false,
      error: "ISRC must be 12 letters or digits.",
      quota: false,
      fallback: true,
    };
  }
  try {
    await assertBillableAllowed();
    const track = await getTrackInfo(value, "isrc");
    return { success: true, track, fallback: false };
  } catch (error) {
    return fail(error, "Could not load track info.");
  }
}

export async function lookupSongstatsTrackById(
  songstatsTrackId: string,
): Promise<TrackLookupResult> {
  const denied = await requireUser();
  if (denied) return denied;
  const id = songstatsTrackId.trim();
  if (!id) {
    return {
      success: false,
      error: "Missing Songstats track id.",
      quota: false,
      fallback: true,
    };
  }
  try {
    await assertBillableAllowed();
    const track = await getTrackInfo(id, "songstats_track_id");
    return { success: true, track, fallback: false };
  } catch (error) {
    return fail(error, "Could not load track info.");
  }
}

export async function searchSongstatsTracks(
  q: string,
): Promise<SearchTracksResult> {
  const denied = await requireUser();
  if (denied) return denied;
  const query = q.trim();
  if (query.length < 3) {
    return { success: true, hits: [] };
  }
  try {
    const hits = await searchTracks(query);
    return { success: true, hits };
  } catch (error) {
    return fail(error, "Track search failed.");
  }
}
