import {
  GENRES,
  RELEASE_TYPES,
} from "@/lib/constants";
import type {
  EditorialTier,
  Genre,
  MetaObjective,
  ReleaseType,
  SpotifyFormat,
} from "@/lib/forecast";
import { deriveMetaObjectiveFromSpends } from "@/lib/meta-objective";
import {
  MAX_RELEASE_ARTISTS,
  isArtistRole,
  type ArtistRole,
} from "@/lib/release-artists";

/** One credited artist on the create form (1–4). */
export interface NewReleaseArtistValues {
  name: string;
  /** Null when unknown (non-primary only). */
  monthlyListeners: number | null;
  role: ArtistRole | "";
}

/** Raw roster row while typing. Empty ML string = unknown. */
export interface NewReleaseArtistDraft {
  name: string;
  monthlyListeners: number | string;
  role: ArtistRole | "";
}

/** Coerced, typed values used by validation and forecast mapping. */
export interface NewReleaseFormValues {
  trackName: string;
  artistName: string;
  artists: NewReleaseArtistValues[];
  genre: Genre | "";
  monthlyListeners: number;
  isFeature: boolean;
  editorialTier: EditorialTier;
  releaseDate: string;
  releaseType: ReleaseType;
  /** Derived from which Spotify spend fields are set (legacy organic path). */
  spotifyFormat: SpotifyFormat;
  spotifyMarqueeSpendPlanned: number;
  spotifyShowcaseSpendPlanned: number;
  /** marquee + showcase (legacy total). */
  spotifySpendPlanned: number;
  /** Meta traffic spend — click→stream funnel. */
  metaTrafficSpendPlanned: number;
  /** Meta awareness spend — reach-only, zero attributed streams. */
  metaAwarenessSpendPlanned: number;
  /** traffic + awareness (legacy total). */
  metaSpendPlanned: number;
  metaObjective: MetaObjective;
}

/**
 * Raw values from controlled inputs while typing.
 * Numeric fields may be empty strings. See `coerceNewReleaseFormValues`.
 */
export interface NewReleaseFormRawValues {
  trackName: string;
  artistName: string;
  artists: NewReleaseArtistDraft[];
  genre: Genre | "";
  monthlyListeners: number | string;
  isFeature: boolean;
  editorialTier: EditorialTier | number | string;
  releaseDate: string;
  releaseType: ReleaseType;
  spotifyMarqueeSpendPlanned: number | string;
  spotifyShowcaseSpendPlanned: number | string;
  metaTrafficSpendPlanned: number | string;
  metaAwarenessSpendPlanned: number | string;
}

export type NewReleaseFieldKey = keyof NewReleaseFormValues;

export interface NewReleaseValidationResult {
  fieldErrors: Partial<Record<NewReleaseFieldKey, string>>;
  formErrors: string[];
  warnings: string[];
  valid: boolean;
}

export const DEFAULT_MONTHLY_LISTENERS = 500_000;

export const DEFAULT_RELEASE_ARTIST_DRAFT: NewReleaseArtistDraft = {
  name: "",
  monthlyListeners: DEFAULT_MONTHLY_LISTENERS,
  role: "primary",
};

export function defaultNewReleaseArtists(): NewReleaseArtistDraft[] {
  return [{ ...DEFAULT_RELEASE_ARTIST_DRAFT }];
}

const EDITORIAL_TIERS: EditorialTier[] = [0, 1, 2, 3];

const MIN_MONTHLY_LISTENERS = 1;
const MAX_MONTHLY_LISTENERS = 500_000_000;
const MAX_SPEND = 10_000_000;
const MAX_YEARS_FROM_TODAY = 2;

type CoerceNumericResult =
  | { ok: true; value: number }
  | { ok: false; error: string };

/**
 * Normalizes numeric form input before validation.
 * - Empty / whitespace-only → `emptyDefault` (no error)
 * - Non-numeric or negative → error
 */
function coerceNumericInput(
  raw: number | string | null | undefined,
  emptyDefault: number,
  fieldLabel: string,
): CoerceNumericResult {
  if (raw === null || raw === undefined) {
    return { ok: true, value: emptyDefault };
  }

  if (typeof raw === "number") {
    if (!Number.isFinite(raw)) {
      return { ok: false, error: `${fieldLabel} must be a number.` };
    }
    if (raw < 0) {
      return { ok: false, error: `${fieldLabel} cannot be negative.` };
    }
    return { ok: true, value: raw };
  }

  const trimmed = raw.trim();
  if (trimmed === "") {
    return { ok: true, value: emptyDefault };
  }

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) {
    return { ok: false, error: `${fieldLabel} must be a number.` };
  }
  if (parsed < 0) {
    return { ok: false, error: `${fieldLabel} cannot be negative.` };
  }

  return { ok: true, value: parsed };
}

function draftHasContent(draft: NewReleaseArtistDraft): boolean {
  const name = draft.name.trim();
  const ml =
    typeof draft.monthlyListeners === "string"
      ? draft.monthlyListeners.trim()
      : draft.monthlyListeners;
  const hasMl =
    ml !== "" && ml != null && !(typeof ml === "number" && !Number.isFinite(ml));
  return Boolean(name || draft.role || hasMl);
}

function coerceOptionalMl(
  raw: number | string | null | undefined,
): { value: number | null; error?: string } {
  if (raw === null || raw === undefined) {
    return { value: null };
  }
  if (typeof raw === "string" && raw.trim() === "") {
    return { value: null };
  }
  const result = coerceNumericInput(raw, 0, "Monthly listeners");
  if (!result.ok) {
    return { value: null, error: result.error };
  }
  return { value: result.value };
}

function coerceEditorialTier(
  raw: EditorialTier | number | string,
): EditorialTier {
  if (typeof raw === "number") {
    return raw as EditorialTier;
  }
  const parsed = Number(String(raw).trim());
  return parsed as EditorialTier;
}

/**
 * Step 1 of the form pipeline: coerce transient empty strings on numeric fields.
 * Does not validate business rules. Call `validateNewReleaseForm` next.
 */
export function coerceNewReleaseFormValues(
  raw: NewReleaseFormRawValues,
): { values: NewReleaseFormValues; fieldErrors: Partial<Record<NewReleaseFieldKey, string>> } {
  const fieldErrors: Partial<Record<NewReleaseFieldKey, string>> = {};

  const ml = coerceNumericInput(
    raw.monthlyListeners,
    DEFAULT_MONTHLY_LISTENERS,
    "Monthly listeners",
  );
  if (!ml.ok) {
    fieldErrors.monthlyListeners = ml.error;
  }

  const metaTraffic = coerceNumericInput(
    raw.metaTrafficSpendPlanned,
    0,
    "Meta traffic spend",
  );
  if (!metaTraffic.ok) {
    fieldErrors.metaTrafficSpendPlanned = metaTraffic.error;
  }

  const metaAwareness = coerceNumericInput(
    raw.metaAwarenessSpendPlanned,
    0,
    "Meta awareness spend",
  );
  if (!metaAwareness.ok) {
    fieldErrors.metaAwarenessSpendPlanned = metaAwareness.error;
  }

  const marqueeSpend = coerceNumericInput(
    raw.spotifyMarqueeSpendPlanned,
    0,
    "Spotify Marquee spend",
  );
  if (!marqueeSpend.ok) {
    fieldErrors.spotifyMarqueeSpendPlanned = marqueeSpend.error;
  }

  const showcaseSpend = coerceNumericInput(
    raw.spotifyShowcaseSpendPlanned,
    0,
    "Spotify Showcase spend",
  );
  if (!showcaseSpend.ok) {
    fieldErrors.spotifyShowcaseSpendPlanned = showcaseSpend.error;
  }

  const traffic = metaTraffic.ok ? metaTraffic.value : 0;
  const awareness = metaAwareness.ok ? metaAwareness.value : 0;
  const marquee = marqueeSpend.ok ? marqueeSpend.value : 0;
  const showcase = showcaseSpend.ok ? showcaseSpend.value : 0;
  const spotifyFormat: SpotifyFormat =
    showcase > 0 && marquee === 0 ? "showcase" : "marquee";

  const creditLine = raw.artistName;
  const artistDrafts =
    raw.artists && raw.artists.length > 0
      ? raw.artists.slice(0, MAX_RELEASE_ARTISTS)
      : defaultNewReleaseArtists();

  const artists: NewReleaseArtistValues[] = [];
  for (const draft of artistDrafts) {
    if (artists.length > 0 && !draftHasContent(draft)) {
      continue;
    }
    const isPrimary = draft.role === "primary";
    let monthlyListeners: number | null;
    if (isPrimary) {
      const rowMl = coerceNumericInput(
        draft.monthlyListeners,
        ml.ok ? ml.value : DEFAULT_MONTHLY_LISTENERS,
        "Monthly listeners",
      );
      if (!rowMl.ok) {
        fieldErrors.monthlyListeners = rowMl.error;
        monthlyListeners = DEFAULT_MONTHLY_LISTENERS;
      } else {
        monthlyListeners = rowMl.value;
      }
    } else {
      const optional = coerceOptionalMl(draft.monthlyListeners);
      if (optional.error) {
        fieldErrors.artists = optional.error;
      }
      monthlyListeners = optional.value;
    }
    artists.push({
      name: draft.name.trim(),
      monthlyListeners,
      role: isArtistRole(draft.role) ? draft.role : "",
    });
  }
  if (artists.length === 0) {
    artists.push({
      name: creditLine.trim(),
      monthlyListeners: ml.ok ? ml.value : DEFAULT_MONTHLY_LISTENERS,
      role: "primary",
    });
  }

  const primary = artists.find((row) => row.role === "primary");
  const primaryMl =
    primary?.monthlyListeners != null && Number.isFinite(primary.monthlyListeners)
      ? primary.monthlyListeners
      : ml.ok
        ? ml.value
        : DEFAULT_MONTHLY_LISTENERS;
  const artistName = creditLine.trim() || (primary?.name ?? "");

  const values: NewReleaseFormValues = {
    trackName: raw.trackName,
    artistName,
    artists,
    genre: raw.genre,
    monthlyListeners: primaryMl,
    isFeature: raw.isFeature,
    editorialTier: coerceEditorialTier(raw.editorialTier),
    releaseDate: raw.releaseDate,
    releaseType: raw.releaseType,
    spotifyFormat,
    spotifyMarqueeSpendPlanned: marquee,
    spotifyShowcaseSpendPlanned: showcase,
    spotifySpendPlanned: marquee + showcase,
    metaTrafficSpendPlanned: traffic,
    metaAwarenessSpendPlanned: awareness,
    metaSpendPlanned: traffic + awareness,
    metaObjective: deriveMetaObjectiveFromSpends(traffic, awareness),
  };

  return { values, fieldErrors };
}

function isValidDateString(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

function parseReleaseDate(value: string): Date | null {
  if (!isValidDateString(value)) {
    return null;
  }
  return new Date(`${value}T00:00:00`);
}

function isWithinReasonableRange(date: Date): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const min = new Date(today);
  min.setFullYear(min.getFullYear() - MAX_YEARS_FROM_TODAY);

  const max = new Date(today);
  max.setFullYear(max.getFullYear() + MAX_YEARS_FROM_TODAY);

  return date >= min && date <= max;
}

function validateSpend(value: number, fieldLabel: string): string | undefined {
  if (!Number.isFinite(value)) {
    return `${fieldLabel} must be a number.`;
  }
  if (value < 0) {
    return `${fieldLabel} cannot be negative.`;
  }
  if (value > MAX_SPEND) {
    return `${fieldLabel} seems unreasonably high (max $${MAX_SPEND.toLocaleString()}).`;
  }
  return undefined;
}

/** Step 2: business-rule validation on coerced values. */
export function validateNewReleaseForm(
  values: NewReleaseFormValues,
): NewReleaseValidationResult {
  const fieldErrors: Partial<Record<NewReleaseFieldKey, string>> = {};
  const formErrors: string[] = [];
  const warnings: string[] = [];

  const trackName = values.trackName.trim();
  if (!trackName) {
    fieldErrors.trackName = "Track name is required.";
  }

  const artistName = values.artistName.trim();
  if (!artistName) {
    fieldErrors.artistName = "Artist name is required.";
  }

  const artists = values.artists;
  if (artists.length < 1) {
    fieldErrors.artists = "Add at least one artist with an explicit role.";
  } else if (artists.length > MAX_RELEASE_ARTISTS) {
    fieldErrors.artists = `At most ${MAX_RELEASE_ARTISTS} artists.`;
  } else {
    const primaryRows = artists.filter((row) => row.role === "primary");
    if (primaryRows.length !== 1) {
      fieldErrors.artists =
        "Exactly one artist must have the primary role (the forecast uses that artist's ML).";
    }
    for (let index = 0; index < artists.length; index += 1) {
      const row = artists[index]!;
      const label = `Artist ${index + 1}`;
      if (!row.name.trim()) {
        formErrors.push(`${label}: name is required.`);
      }
      if (!isArtistRole(row.role)) {
        formErrors.push(`${label}: pick an explicit role.`);
      }
      if (row.role !== "primary" && row.monthlyListeners != null) {
        const rowMl = row.monthlyListeners;
        if (!Number.isFinite(rowMl) || !Number.isInteger(rowMl) || rowMl < 1) {
          formErrors.push(
            `${label}: monthly listeners must be a whole number greater than 0, or left blank.`,
          );
        }
      }
    }
  }

  if (!values.genre || !GENRES.includes(values.genre)) {
    fieldErrors.genre = "Pick a genre.";
  }

  const ml = values.monthlyListeners;
  if (!Number.isFinite(ml) || !Number.isInteger(ml)) {
    fieldErrors.monthlyListeners = "Monthly listeners must be a whole number.";
  } else if (ml < MIN_MONTHLY_LISTENERS) {
    fieldErrors.monthlyListeners = "Monthly listeners must be greater than 0.";
  } else if (ml > MAX_MONTHLY_LISTENERS) {
    fieldErrors.monthlyListeners = `Monthly listeners cannot exceed ${MAX_MONTHLY_LISTENERS.toLocaleString()}.`;
  } else if (ml > Number.MAX_SAFE_INTEGER) {
    warnings.push(
      "Monthly listeners exceeds JavaScript's safe integer range. Value may round on save.",
    );
  }

  if (!EDITORIAL_TIERS.includes(values.editorialTier)) {
    fieldErrors.editorialTier = "Editorial tier must be 0–3.";
  }

  if (!values.releaseDate) {
    fieldErrors.releaseDate = "Release date is required.";
  } else {
    const releaseDate = parseReleaseDate(values.releaseDate);
    if (!releaseDate) {
      fieldErrors.releaseDate = "Release date must be a valid date (YYYY-MM-DD).";
    } else if (!isWithinReasonableRange(releaseDate)) {
      fieldErrors.releaseDate = `Release date must be within ${MAX_YEARS_FROM_TODAY} years of today.`;
    }
  }

  if (!RELEASE_TYPES.includes(values.releaseType)) {
    fieldErrors.releaseType = "Pick a release type.";
  }

  const marqueeError = validateSpend(
    values.spotifyMarqueeSpendPlanned,
    "Spotify Marquee spend",
  );
  if (marqueeError) {
    fieldErrors.spotifyMarqueeSpendPlanned = marqueeError;
  }

  const showcaseError = validateSpend(
    values.spotifyShowcaseSpendPlanned,
    "Spotify Showcase spend",
  );
  if (showcaseError) {
    fieldErrors.spotifyShowcaseSpendPlanned = showcaseError;
  }

  const metaTrafficError = validateSpend(
    values.metaTrafficSpendPlanned,
    "Meta traffic spend",
  );
  if (metaTrafficError) {
    fieldErrors.metaTrafficSpendPlanned = metaTrafficError;
  }

  const metaAwarenessError = validateSpend(
    values.metaAwarenessSpendPlanned,
    "Meta awareness spend",
  );
  if (metaAwarenessError) {
    fieldErrors.metaAwarenessSpendPlanned = metaAwarenessError;
  }

  if (
    Number.isFinite(values.metaSpendPlanned) &&
    Number.isFinite(values.spotifySpendPlanned) &&
    values.metaSpendPlanned === 0 &&
    values.spotifySpendPlanned === 0
  ) {
    warnings.push(
      "No paid spend entered. Forecast will be organic-only (no ad lift modeled).",
    );
  }

  const valid =
    Object.keys(fieldErrors).length === 0 && formErrors.length === 0;

  return { fieldErrors, formErrors, warnings, valid };
}

/** Coerce then validate. Used by client preview and Server Action. */
export function parseAndValidateNewReleaseForm(raw: NewReleaseFormRawValues): {
  values: NewReleaseFormValues;
  fieldErrors: Partial<Record<NewReleaseFieldKey, string>>;
  formErrors: string[];
  warnings: string[];
  valid: boolean;
} {
  const { values, fieldErrors: coerceErrors } = coerceNewReleaseFormValues(raw);
  const validation = validateNewReleaseForm(values);

  const fieldErrors = { ...coerceErrors, ...validation.fieldErrors };

  return {
    values,
    fieldErrors,
    formErrors: validation.formErrors,
    warnings: validation.warnings,
    valid:
      Object.keys(fieldErrors).length === 0 &&
      validation.formErrors.length === 0,
  };
}
