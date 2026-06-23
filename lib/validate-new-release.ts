import {
  GENRES,
  META_OBJECTIVES,
  RELEASE_TYPES,
  SPOTIFY_FORMATS,
} from "@/lib/constants";
import type {
  EditorialTier,
  Genre,
  MetaObjective,
  ReleaseType,
  SpotifyFormat,
} from "@/lib/forecast";

/** Coerced, typed values used by validation and forecast mapping. */
export interface NewReleaseFormValues {
  trackName: string;
  artistName: string;
  genre: Genre | "";
  monthlyListeners: number;
  isFeature: boolean;
  editorialTier: EditorialTier;
  releaseDate: string;
  releaseType: ReleaseType;
  spotifyFormat: SpotifyFormat;
  metaSpendPlanned: number;
  metaObjective: MetaObjective;
  spotifySpendPlanned: number;
}

/**
 * Raw values from controlled inputs while typing.
 * Numeric fields may be empty strings — see `coerceNewReleaseFormValues`.
 */
export interface NewReleaseFormRawValues {
  trackName: string;
  artistName: string;
  genre: Genre | "";
  monthlyListeners: number | string;
  isFeature: boolean;
  editorialTier: EditorialTier | number | string;
  releaseDate: string;
  releaseType: ReleaseType;
  spotifyFormat: SpotifyFormat;
  metaSpendPlanned: number | string;
  metaObjective: MetaObjective;
  spotifySpendPlanned: number | string;
}

export type NewReleaseFieldKey = keyof NewReleaseFormValues;

export interface NewReleaseValidationResult {
  fieldErrors: Partial<Record<NewReleaseFieldKey, string>>;
  formErrors: string[];
  warnings: string[];
  valid: boolean;
}

export const DEFAULT_MONTHLY_LISTENERS = 500_000;

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
 * Does not validate business rules — call `validateNewReleaseForm` next.
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

  const metaSpend = coerceNumericInput(
    raw.metaSpendPlanned,
    0,
    "Meta spend",
  );
  if (!metaSpend.ok) {
    fieldErrors.metaSpendPlanned = metaSpend.error;
  }

  const spotifySpend = coerceNumericInput(
    raw.spotifySpendPlanned,
    0,
    "Spotify spend",
  );
  if (!spotifySpend.ok) {
    fieldErrors.spotifySpendPlanned = spotifySpend.error;
  }

  const values: NewReleaseFormValues = {
    trackName: raw.trackName,
    artistName: raw.artistName,
    genre: raw.genre,
    monthlyListeners: ml.ok ? ml.value : DEFAULT_MONTHLY_LISTENERS,
    isFeature: raw.isFeature,
    editorialTier: coerceEditorialTier(raw.editorialTier),
    releaseDate: raw.releaseDate,
    releaseType: raw.releaseType,
    spotifyFormat: raw.spotifyFormat,
    metaSpendPlanned: metaSpend.ok ? metaSpend.value : 0,
    metaObjective: raw.metaObjective,
    spotifySpendPlanned: spotifySpend.ok ? spotifySpend.value : 0,
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
      "Monthly listeners exceeds JavaScript's safe integer range — value may round on save.",
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

  if (!SPOTIFY_FORMATS.includes(values.spotifyFormat)) {
    fieldErrors.spotifyFormat = "Pick a Spotify format.";
  }

  const metaSpendError = validateSpend(values.metaSpendPlanned, "Meta spend");
  if (metaSpendError) {
    fieldErrors.metaSpendPlanned = metaSpendError;
  }

  const spotifySpendError = validateSpend(
    values.spotifySpendPlanned,
    "Spotify spend",
  );
  if (spotifySpendError) {
    fieldErrors.spotifySpendPlanned = spotifySpendError;
  }

  if (!META_OBJECTIVES.includes(values.metaObjective)) {
    fieldErrors.metaObjective = "Pick a Meta objective.";
  }

  if (
    Number.isFinite(values.metaSpendPlanned) &&
    Number.isFinite(values.spotifySpendPlanned) &&
    values.metaSpendPlanned === 0 &&
    values.spotifySpendPlanned === 0
  ) {
    warnings.push(
      "No paid spend entered — forecast will be organic-only (no ad lift modeled).",
    );
  }

  const valid =
    Object.keys(fieldErrors).length === 0 && formErrors.length === 0;

  return { fieldErrors, formErrors, warnings, valid };
}

/** Coerce then validate — used by client preview and Server Action. */
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
