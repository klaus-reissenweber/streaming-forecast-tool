"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { saveReleaseArtists } from "@/app/release/[id]/actions";
import { MonthlyListenersField } from "@/components/new/MonthlyListenersField";
import { ToggleGroup } from "@/components/new/ToggleGroup";
import { formatCount, formatCompactNumber } from "@/lib/format";
import type { ReleaseStatus } from "@/lib/map-release-row";
import {
  ARTIST_ROLE_LABELS,
  ARTIST_ROLES,
  MAX_RELEASE_ARTISTS,
  sortReleaseArtists,
  type ArtistRole,
  type ReleaseArtist,
  type ReleaseArtistDraft,
} from "@/lib/release-artists";
import { validateReleaseRoster } from "@/lib/validate-release-roster";

const ROLE_OPTIONS = ARTIST_ROLES.map((role) => ({
  value: role,
  label: ARTIST_ROLE_LABELS[role],
}));

const TEXT_INPUT_CLASS =
  "rounded-instrument border border-border bg-surface px-3 py-2 text-body-sm text-foreground focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent";

const NUMERIC_INPUT_CLASS = `${TEXT_INPUT_CLASS} font-mono tabular-nums`;

type RosterFormRow = ReleaseArtistDraft & { key: string };

function draftsFromArtists(artists: readonly ReleaseArtist[]): RosterFormRow[] {
  const sorted = sortReleaseArtists(artists);
  if (sorted.length === 0) {
    return [
      {
        key: "new-primary",
        name: "",
        monthlyListeners: "",
        role: "primary",
      },
    ];
  }
  return sorted.map((artist) => ({
    key: artist.id,
    name: artist.artist_name,
    monthlyListeners:
      artist.monthly_listeners == null ? "" : String(artist.monthly_listeners),
    role: artist.role,
  }));
}

function primaryMonthlyListeners(
  drafts: readonly RosterFormRow[],
): number | null {
  const primary = drafts.find((row) => row.role === "primary");
  if (!primary) {
    return null;
  }
  const raw = primary.monthlyListeners;
  if (raw === "" || raw == null) {
    return null;
  }
  const parsed = typeof raw === "number" ? raw : Number(String(raw).trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function ForecastUsedNote({
  forecastUsedMonthlyListeners,
  currentPrimaryMl,
}: {
  forecastUsedMonthlyListeners: number;
  currentPrimaryMl: number | null;
}) {
  if (
    currentPrimaryMl != null &&
    currentPrimaryMl === forecastUsedMonthlyListeners
  ) {
    return null;
  }
  return (
    <p className="mt-2 text-caption text-muted">
      Forecast used {formatCount(forecastUsedMonthlyListeners)}.
    </p>
  );
}

export function ReleaseArtistRoster({
  releaseId,
  artists,
  forecastUsedMonthlyListeners,
  status,
}: {
  releaseId: string;
  artists: readonly ReleaseArtist[];
  forecastUsedMonthlyListeners: number;
  status: ReleaseStatus;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [drafts, setDrafts] = useState<RosterFormRow[]>(() =>
    draftsFromArtists(artists),
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const savedPrimaryMl =
    artists.find((row) => row.role === "primary")?.monthly_listeners ?? null;
  const draftPrimaryMl = primaryMonthlyListeners(drafts);
  const preview = useMemo(() => validateReleaseRoster(drafts), [drafts]);

  function beginEdit() {
    setDrafts(draftsFromArtists(artists));
    setError(null);
    setEditing(true);
  }

  function cancelEdit() {
    setDrafts(draftsFromArtists(artists));
    setError(null);
    setEditing(false);
  }

  function setRow(index: number, patch: Partial<ReleaseArtistDraft>) {
    setDrafts((current) =>
      current.map((row, rowIndex) => {
        if (rowIndex !== index) {
          if (patch.role === "primary" && row.role === "primary") {
            return { ...row, role: "" };
          }
          return row;
        }
        return { ...row, ...patch };
      }),
    );
    setError(null);
  }

  function addRow() {
    setDrafts((current) => {
      if (current.length >= MAX_RELEASE_ARTISTS) {
        return current;
      }
      return [
        ...current,
        {
          key: `new-${Date.now()}`,
          name: "",
          monthlyListeners: "",
          role: "",
        },
      ];
    });
    setError(null);
  }

  function removeRow(index: number) {
    setDrafts((current) => {
      if (current.length <= 1) {
        return current;
      }
      return current.filter((_, rowIndex) => rowIndex !== index);
    });
    setError(null);
  }

  function moveRow(index: number, direction: -1 | 1) {
    setDrafts((current) => {
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= current.length) {
        return current;
      }
      const next = [...current];
      const [row] = next.splice(index, 1);
      next.splice(nextIndex, 0, row!);
      return next;
    });
    setError(null);
  }

  function onSave() {
    const validation = validateReleaseRoster(drafts);
    if (!validation.valid) {
      setError(validation.errors[0] ?? "Invalid artist roster.");
      return;
    }

    setError(null);
    startTransition(async () => {
      const payload: ReleaseArtistDraft[] = drafts.map(
        ({ name, monthlyListeners, role }) => ({
          name,
          monthlyListeners,
          role,
        }),
      );
      const result = await saveReleaseArtists(releaseId, payload);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setEditing(false);
      router.refresh();
    });
  }

  if (!editing) {
    return (
      <div className="mt-3">
        {artists.length === 0 ? (
          <p className="text-body-sm text-muted">No artists on this roster yet.</p>
        ) : (
          <ul className="divide-y divide-border-subtle rounded-instrument border border-border bg-canvas-subtle">
            {sortReleaseArtists(artists).map((artist) => (
              <li
                key={artist.id}
                className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-3 py-2 text-body-sm"
              >
                <span className="text-foreground">
                  {artist.artist_name}
                  <span className="text-muted">
                    {" "}
                    · {ARTIST_ROLE_LABELS[artist.role]}
                  </span>
                </span>
                <span className="font-mono tabular-nums text-secondary">
                  {artist.monthly_listeners == null
                    ? "ML unknown"
                    : `${formatCompactNumber(artist.monthly_listeners)} ML`}
                </span>
              </li>
            ))}
          </ul>
        )}
        <ForecastUsedNote
          forecastUsedMonthlyListeners={forecastUsedMonthlyListeners}
          currentPrimaryMl={savedPrimaryMl}
        />
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
          <button
            type="button"
            onClick={beginEdit}
            className="text-body-sm font-medium text-accent-readable hover:underline"
          >
            Edit roster
          </button>
          {status === "closed" ? (
            <span className="text-caption text-muted">
              Closed releases stay read-only except this roster.
            </span>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="mt-3 space-y-3">
      <p className="text-caption text-muted">
        Up to {MAX_RELEASE_ARTISTS}. Exactly one primary. Saving does not
        change the locked forecast or the display credit line.
      </p>

      {drafts.map((artist, index) => {
        const isPrimary = artist.role === "primary";
        return (
          <div
            key={artist.key}
            className="rounded-instrument border border-border bg-canvas-subtle p-3 sm:p-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-mono text-[11px] font-medium uppercase tracking-[0.06em] text-muted">
                Position {index + 1}
                {isPrimary ? " · primary" : ""}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => moveRow(index, -1)}
                  disabled={pending || index === 0}
                  className="text-caption text-secondary hover:text-foreground disabled:opacity-50"
                >
                  Up
                </button>
                <button
                  type="button"
                  onClick={() => moveRow(index, 1)}
                  disabled={pending || index === drafts.length - 1}
                  className="text-caption text-secondary hover:text-foreground disabled:opacity-50"
                >
                  Down
                </button>
                {drafts.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => removeRow(index)}
                    disabled={pending}
                    className="text-caption text-secondary hover:text-foreground disabled:opacity-50"
                  >
                    Remove
                  </button>
                ) : null}
              </div>
            </div>

            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1">
                <span className="text-body-sm font-medium text-foreground">
                  Name
                </span>
                <input
                  className={TEXT_INPUT_CLASS}
                  value={artist.name}
                  onChange={(event) =>
                    setRow(index, { name: event.target.value })
                  }
                  disabled={pending}
                />
              </label>
            </div>

            <div className="mt-3">
              <ToggleGroup
                name={`roster-role-${artist.key}`}
                label="Role"
                options={ROLE_OPTIONS}
                value={artist.role}
                onChange={(role) => setRow(index, { role })}
                disabled={pending}
              />
            </div>

            <div className="mt-3">
              {isPrimary ? (
                <MonthlyListenersField
                  inputId={`roster-ml-${artist.key}`}
                  label="Monthly listeners (primary)"
                  value={artist.monthlyListeners}
                  onChange={(monthlyListeners) =>
                    setRow(index, { monthlyListeners })
                  }
                  disabled={pending}
                />
              ) : (
                <label className="flex flex-col gap-1 sm:max-w-xs">
                  <span className="text-body-sm font-medium text-foreground">
                    Monthly listeners (optional)
                  </span>
                  <input
                    className={NUMERIC_INPUT_CLASS}
                    inputMode="numeric"
                    value={artist.monthlyListeners}
                    onChange={(event) =>
                      setRow(index, { monthlyListeners: event.target.value })
                    }
                    disabled={pending}
                    placeholder="Unknown"
                  />
                </label>
              )}
            </div>
          </div>
        );
      })}

      {drafts.length < MAX_RELEASE_ARTISTS ? (
        <button
          type="button"
          onClick={addRow}
          disabled={pending}
          className="text-body-sm font-medium text-accent-readable hover:underline disabled:opacity-50"
        >
          Add artist
        </button>
      ) : null}

      <ForecastUsedNote
        forecastUsedMonthlyListeners={forecastUsedMonthlyListeners}
        currentPrimaryMl={draftPrimaryMl}
      />

      {preview.valid ? null : (
        <div className="space-y-1">
          {preview.errors.map((item) => (
            <p
              key={item}
              className="text-caption text-semantic-negative"
              role="alert"
            >
              {item}
            </p>
          ))}
        </div>
      )}
      {error && preview.valid ? (
        <p className="text-body-sm text-semantic-negative" role="alert">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onSave}
          disabled={pending || !preview.valid}
          className={
            "rounded-instrument border px-3 py-1.5 text-body-sm font-medium " +
            (pending || !preview.valid
              ? "cursor-not-allowed border-border bg-bracket-bg text-muted"
              : "border-accent-border bg-accent-tint text-accent-readable hover:border-accent")
          }
        >
          {pending ? "Saving…" : "Save roster"}
        </button>
        <button
          type="button"
          onClick={cancelEdit}
          disabled={pending}
          className="rounded-instrument border border-border bg-surface px-3 py-1.5 text-body-sm font-medium text-secondary hover:text-foreground disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
