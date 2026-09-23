"use client";

import { useEffect, useRef, useState } from "react";
import {
  lookupSongstatsTrackById,
  lookupSongstatsTrackByIsrc,
  pickSongstatsArtist,
  searchSongstatsArtists,
  searchSongstatsTracks,
} from "@/app/new/songstats-actions";
import type { ArtistSearchHit, TrackInfo, TrackSearchResult } from "@/lib/songstats/client";
import {
  clearResolvedAfterIsrcEdit,
  forecastArtistSourceFor,
  isrcFromTrackCandidate,
  isValidIsrc,
  remixWarning,
} from "@/lib/songstats/create-form";
import type { NewReleaseFormRawValues } from "@/lib/validate-new-release";

const TEXT_INPUT_CLASS =
  "rounded-instrument border border-border bg-surface px-3 py-2 text-body-sm text-foreground focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent";

const READONLY_CLASS =
  "rounded-instrument border border-border bg-canvas-subtle px-3 py-2 font-mono text-body-sm tabular-nums text-foreground";

function formatCaptured(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString();
}

export function SongstatsLockFields({
  values,
  setValues,
  disabled,
  onMessage,
}: {
  values: NewReleaseFormRawValues;
  setValues: (
    updater: (current: NewReleaseFormRawValues) => NewReleaseFormRawValues,
  ) => void;
  disabled: boolean;
  onMessage: (message: string | null) => void;
}) {
  const [artistHits, setArtistHits] = useState<ArtistSearchHit[]>([]);
  const [artistOpen, setArtistOpen] = useState(false);
  const [artistPending, setArtistPending] = useState(false);
  const [trackHits, setTrackHits] = useState<TrackSearchResult[]>([]);
  const [trackPending, setTrackPending] = useState(false);
  const [chooseArtists, setChooseArtists] = useState<TrackInfo["artists"]>([]);
  const [remixText, setRemixText] = useState<string | null>(null);
  const [needsRecheck, setNeedsRecheck] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const query = values.artistName.trim();

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    if (query.length < 3 || values.songstatsArtistId) {
      setArtistHits([]);
      return;
    }
    debounce.current = setTimeout(() => {
      void searchSongstatsArtists(query).then((result) => {
        if (!result.success) {
          onMessage(result.error);
          setValues((current) => ({ ...current, songstatsFallback: true }));
          return;
        }
        setArtistHits(result.hits);
        setArtistOpen(true);
      });
    }, 400);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [query, values.songstatsArtistId, onMessage, setValues]);

  function applyArtistStats(
    hit: { songstatsArtistId: string; name: string },
    stats: {
      monthlyListeners: number;
      followers: number;
      popularity: number;
      capturedAt: string;
    },
    source: NewReleaseFormRawValues["forecastArtistSource"],
  ) {
    setValues((current) => {
      const artists = [...current.artists];
      const first = artists[0] ?? {
        name: hit.name,
        monthlyListeners: stats.monthlyListeners,
        role: "primary" as const,
        songstatsArtistId: hit.songstatsArtistId,
      };
      artists[0] = {
        ...first,
        name: hit.name,
        monthlyListeners: stats.monthlyListeners,
        role: first.role || "primary",
        songstatsArtistId: hit.songstatsArtistId,
      };
      return {
        ...current,
        artistName: hit.name,
        artists,
        monthlyListeners: stats.monthlyListeners,
        songstatsArtistId: hit.songstatsArtistId,
        followers: stats.followers,
        popularity: stats.popularity,
        mlCapturedAt: stats.capturedAt,
        mlOverridden: false,
        songstatsFallback: false,
        forecastArtistSource: source ?? current.forecastArtistSource,
      };
    });
  }

  async function pickArtist(
    hit: { songstatsArtistId: string; name: string },
    source: NewReleaseFormRawValues["forecastArtistSource"],
  ) {
    setArtistPending(true);
    onMessage(null);
    const result = await pickSongstatsArtist(hit.songstatsArtistId);
    setArtistPending(false);
    setArtistOpen(false);
    if (!result.success) {
      onMessage(result.error);
      setValues((current) => ({ ...current, songstatsFallback: true }));
      return;
    }
    applyArtistStats(hit, result.stats, source);
  }

  async function applyTrack(track: TrackInfo) {
    const pickedId = values.songstatsArtistId ?? null;
    const warning = remixWarning(
      pickedId,
      track.artists.map((row) => row.songstatsArtistId),
    );
    setValues((current) => ({
      ...current,
      trackName: track.title,
      isrc: track.isrc,
      songstatsTrackId: track.songstatsTrackId,
      label: track.label,
      genres: track.genres,
      fetchedReleaseDate: track.releaseDate,
      isFeature: track.artists.length > 1,
      releaseDate: current.releaseDate || track.releaseDate,
    }));
    if (warning) {
      setRemixText(warning);
      setChooseArtists(track.artists);
      return;
    }
    setRemixText(null);
    if (track.artists.length === 1) {
      setChooseArtists([]);
      await pickArtist(track.artists[0]!, "track_primary");
      return;
    }
    setChooseArtists(track.artists);
  }

  async function onIsrcBlur(nextIsrc?: string) {
    const isrc = (nextIsrc ?? values.isrc ?? "").trim();
    if (!isrc || !isValidIsrc(isrc)) return;
    setArtistPending(true);
    onMessage(null);
    const result = await lookupSongstatsTrackByIsrc(isrc);
    setArtistPending(false);
    if (!result.success) {
      onMessage(result.error);
      setValues((current) => ({ ...current, songstatsFallback: true }));
      return;
    }
    await applyTrack(result.track);
    setNeedsRecheck(false);
  }

  async function findTrack() {
    const q = `${values.artistName} ${values.trackName}`.trim();
    if (q.length < 3) return;
    setTrackPending(true);
    onMessage(null);
    const result = await searchSongstatsTracks(q);
    setTrackPending(false);
    if (!result.success) {
      onMessage(result.error);
      return;
    }
    setTrackHits(result.hits);
  }

  async function pickTrack(hit: TrackSearchResult) {
    setTrackHits([]);
    onMessage(null);
    const fromCandidate = isrcFromTrackCandidate(hit.isrcs, "");
    if (fromCandidate) {
      setValues((current) => ({ ...current, isrc: fromCandidate }));
      await onIsrcBlur(fromCandidate);
      return;
    }
    setTrackPending(true);
    const result = await lookupSongstatsTrackById(hit.songstatsTrackId);
    setTrackPending(false);
    if (!result.success) {
      onMessage(result.error);
      setValues((current) => ({ ...current, songstatsFallback: true }));
      return;
    }
    setValues((current) => ({ ...current, isrc: result.track.isrc }));
    await onIsrcBlur(result.track.isrc);
  }

  const captured = formatCaptured(values.mlCapturedAt);
  const readOnlyMl = Boolean(values.mlCapturedAt) && !values.mlOverridden;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="text-body-sm font-medium text-foreground">ISRC</span>
          <input
            className={TEXT_INPUT_CLASS}
            value={values.isrc ?? ""}
            onChange={(event) => {
              const next = event.target.value;
              setValues((current) => {
                if (!current.songstatsTrackId) {
                  return { ...current, isrc: next };
                }
                return clearResolvedAfterIsrcEdit(current, next);
              });
              setNeedsRecheck((was) => {
                if (!next.trim()) return false;
                if (values.songstatsTrackId) return true;
                return was;
              });
            }}
            onBlur={() => {
              void onIsrcBlur();
            }}
            disabled={disabled || artistPending}
            placeholder="Primary path — 12 characters"
          />
          {needsRecheck ? (
            <span className="text-caption text-semantic-warning">Re-check</span>
          ) : null}
        </label>
        <div className="flex flex-col justify-end gap-1">
          <button
            type="button"
            onClick={() => {
              void findTrack();
            }}
            disabled={disabled || trackPending}
            className="rounded-instrument border border-border bg-surface px-3 py-2 text-body-sm font-medium text-foreground hover:border-accent disabled:opacity-50"
          >
            {trackPending ? "Searching…" : "Find track"}
          </button>
          <span className="text-caption text-secondary">
            Free search by artist and title when there is no ISRC yet.
          </span>
        </div>
      </div>

      {trackHits.length > 0 ? (
        <ul className="rounded-instrument border border-border bg-surface">
          {trackHits.map((hit) => (
            <li key={hit.songstatsTrackId}>
              <button
                type="button"
                className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left hover:bg-accent-tint"
                onClick={() => {
                  void pickTrack(hit);
                }}
              >
                <span className="text-body-sm text-foreground">{hit.title}</span>
                <span className="text-caption text-secondary">
                  {hit.artists.map((row) => row.name).join(", ")} ·{" "}
                  {hit.releaseDate}
                  {hit.isrcs[0] ? ` · ${hit.isrcs[0]}` : ""}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <label className="relative flex flex-col gap-1">
        <span className="text-body-sm font-medium text-foreground">
          Artist search
        </span>
        <input
          className={TEXT_INPUT_CLASS}
          value={values.artistName}
          onChange={(event) => {
            const name = event.target.value;
            setValues((current) => {
              const artists = [...current.artists];
              const first = artists[0];
              if (first) {
                artists[0] = { ...first, name, songstatsArtistId: null };
              }
              return {
                ...current,
                artistName: name,
                artists,
                songstatsArtistId: null,
              };
            });
            setArtistOpen(true);
          }}
          disabled={disabled}
          placeholder="Secondary path — type at least 3 characters"
        />
        {artistOpen && artistHits.length > 0 ? (
          <ul className="absolute top-full z-10 mt-1 w-full rounded-instrument border border-border bg-surface">
            {artistHits.map((hit) => (
              <li key={hit.songstatsArtistId}>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-accent-tint"
                  onClick={() => {
                    void pickArtist(hit, "picked");
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={hit.avatarUrl}
                    alt=""
                    width={28}
                    height={28}
                    className="h-7 w-7 rounded-instrument object-cover"
                  />
                  <span className="text-body-sm text-foreground">{hit.name}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <span className="text-caption text-secondary">
          Search is free. Picking an artist loads listeners and bills one object.
        </span>
      </label>

      {chooseArtists.length > 1 || remixText ? (
        <div className="rounded-instrument border border-semantic-warning/30 bg-semantic-warning-bg p-3">
          {remixText ? (
            <p className="text-body-sm text-semantic-warning">{remixText}</p>
          ) : (
            <p className="text-body-sm text-foreground">
              Which audience should drive the forecast?
            </p>
          )}
          <div className="mt-2 flex flex-col gap-1">
            {chooseArtists.map((artist, index) => (
              <button
                key={artist.songstatsArtistId}
                type="button"
                className="rounded-instrument border border-border bg-surface px-3 py-1.5 text-left text-body-sm hover:border-accent"
                onClick={() => {
                  setRemixText(null);
                  void pickArtist(
                    artist,
                    forecastArtistSourceFor({
                      keptPickedArtist: false,
                      chosenTrackArtistIndex: index,
                    }),
                  );
                  setChooseArtists([]);
                }}
              >
                {artist.name}
                {index === 0 ? " · primary on the track" : ""}
              </button>
            ))}
            {remixText && values.songstatsArtistId ? (
              <button
                type="button"
                className="text-left text-body-sm text-accent-readable hover:underline"
                onClick={() => {
                  setRemixText(null);
                  setChooseArtists([]);
                  setValues((current) => ({
                    ...current,
                    forecastArtistSource: "picked",
                  }));
                }}
              >
                Keep the current artist
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1">
          <span className="text-body-sm font-medium text-foreground">
            Monthly listeners
          </span>
          <input
            className={readOnlyMl ? READONLY_CLASS : TEXT_INPUT_CLASS}
            readOnly={readOnlyMl}
            value={
              values.artists[0]?.monthlyListeners ?? values.monthlyListeners ?? ""
            }
            onChange={(event) => {
              const monthlyListeners = event.target.value;
              setValues((current) => {
                const artists = [...current.artists];
                if (artists[0]) {
                  artists[0] = { ...artists[0], monthlyListeners };
                }
                return { ...current, artists, monthlyListeners };
              });
            }}
            disabled={disabled || (readOnlyMl && !values.mlOverridden)}
          />
          {captured ? (
            <span className="text-caption text-secondary">
              captured {captured}
            </span>
          ) : null}
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-body-sm font-medium text-foreground">
            Followers
          </span>
          <input
            className={READONLY_CLASS}
            readOnly
            value={values.followers ?? ""}
            disabled={disabled}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-body-sm font-medium text-foreground">
            Popularity
          </span>
          <input
            className={READONLY_CLASS}
            readOnly
            value={values.popularity ?? ""}
            disabled={disabled}
          />
        </label>
      </div>

      <div className="flex flex-col gap-2">
        <label className="flex items-center gap-2 text-body-sm text-foreground">
          <input
            type="checkbox"
            checked={Boolean(values.mlOverridden)}
            onChange={(event) =>
              setValues((current) => ({
                ...current,
                mlOverridden: event.target.checked,
                songstatsFallback: event.target.checked
                  ? current.songstatsFallback
                  : current.songstatsFallback,
              }))
            }
            disabled={disabled}
          />
          Override monthly listeners
        </label>
        {values.mlOverridden ? (
          <label className="flex flex-col gap-1">
            <span className="text-body-sm font-medium text-foreground">
              Override reason
            </span>
            <input
              className={TEXT_INPUT_CLASS}
              value={values.mlOverrideReason ?? ""}
              onChange={(event) =>
                setValues((current) => ({
                  ...current,
                  mlOverrideReason: event.target.value,
                }))
              }
              disabled={disabled}
            />
          </label>
        ) : null}
      </div>

      {values.label || (values.genres && values.genres.length > 0) ? (
        <p className="text-caption text-secondary">
          {values.label ? `Label ${values.label}` : ""}
          {values.label && values.genres && values.genres.length > 0 ? " · " : ""}
          {values.genres && values.genres.length > 0
            ? values.genres.join(", ")
            : ""}
        </p>
      ) : null}

      {artistPending ? (
        <p className="text-caption text-secondary">Loading Songstats…</p>
      ) : null}
    </div>
  );
}
