export interface DailyDayInput {
  day_number: number;
  streams: number;
  saves: number;
  other_pct: number | null;
}

export interface DailyDayFieldInput {
  streams?: string | number | null;
  saves?: string | number | null;
  other_pct?: string | number | null;
}

export interface DailyDayFieldErrors {
  streams?: string;
  saves?: string;
  other_pct?: string;
  day_number?: string;
}

export type DailyDayValidationResult =
  | { action: "delete" }
  | { action: "upsert"; row: DailyDayInput }
  | { action: "invalid"; errors: string[]; fieldErrors: DailyDayFieldErrors };

export interface BulkDailyValidationResult {
  valid: true;
  rows: DailyDayInput[];
}

export interface BulkDailyValidationFailure {
  valid: false;
  errors: string[];
}

export type BulkDailyValidationOutcome =
  | BulkDailyValidationResult
  | BulkDailyValidationFailure;

function isBlank(value: string | number | null | undefined): boolean {
  if (value === null || value === undefined) {
    return true;
  }
  if (typeof value === "string" && value.trim() === "") {
    return true;
  }
  return false;
}

function parseNonNegativeInteger(
  value: string | number,
  fieldLabel: string,
): { ok: true; value: number } | { ok: false; message: string } {
  const trimmed = typeof value === "string" ? value.trim() : String(value);
  const parsed = Number(trimmed);

  if (!Number.isFinite(parsed) || parsed < 0 || !Number.isInteger(parsed)) {
    return {
      ok: false,
      message: `${fieldLabel} must be a whole number ≥ 0.`,
    };
  }

  return { ok: true, value: parsed };
}

function parseOptionalOtherPct(
  value: string | number | null | undefined,
): { ok: true; value: number | null } | { ok: false; message: string } {
  if (isBlank(value)) {
    return { ok: true, value: null };
  }

  const trimmed = typeof value === "string" ? value.trim() : String(value);
  const parsed = Number(trimmed);

  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
    return {
      ok: false,
      message: "Other % must be between 0 and 100 (or blank).",
    };
  }

  return { ok: true, value: parsed };
}

function validateDayNumber(dayNumber: number): string | null {
  if (!Number.isInteger(dayNumber) || dayNumber < 1 || dayNumber > 28) {
    return "Day must be a whole number from 1 to 28.";
  }
  return null;
}

/** Validates grid input for a single day. Empty streams+saves → delete; partial → invalid. */
export function validateDailyDay(
  dayNumber: number,
  fields: DailyDayFieldInput,
): DailyDayValidationResult {
  const fieldErrors: DailyDayFieldErrors = {};
  const errors: string[] = [];

  const dayError = validateDayNumber(dayNumber);
  if (dayError) {
    fieldErrors.day_number = dayError;
    errors.push(dayError);
    return { action: "invalid", errors, fieldErrors };
  }

  const streamsBlank = isBlank(fields.streams);
  const savesBlank = isBlank(fields.saves);

  if (streamsBlank && savesBlank) {
    return { action: "delete" };
  }

  if (streamsBlank !== savesBlank) {
    const message =
      "Enter both streams and saves for this day, or clear both to remove the row.";
    if (streamsBlank) {
      fieldErrors.streams = message;
    }
    if (savesBlank) {
      fieldErrors.saves = message;
    }
    errors.push(message);
    return { action: "invalid", errors, fieldErrors };
  }

  const streamsParsed = parseNonNegativeInteger(fields.streams!, "Streams");
  if (!streamsParsed.ok) {
    fieldErrors.streams = streamsParsed.message;
    errors.push(streamsParsed.message);
  }

  const savesParsed = parseNonNegativeInteger(fields.saves!, "Saves");
  if (!savesParsed.ok) {
    fieldErrors.saves = savesParsed.message;
    errors.push(savesParsed.message);
  }

  const otherParsed = parseOptionalOtherPct(fields.other_pct);
  if (!otherParsed.ok) {
    fieldErrors.other_pct = otherParsed.message;
    errors.push(otherParsed.message);
  }

  if (
    !streamsParsed.ok ||
    !savesParsed.ok ||
    !otherParsed.ok
  ) {
    return { action: "invalid", errors, fieldErrors };
  }

  return {
    action: "upsert",
    row: {
      day_number: dayNumber,
      streams: streamsParsed.value,
      saves: savesParsed.value,
      other_pct: otherParsed.value,
    },
  };
}

/** Validates parsed CSV rows before bulk upsert (server-side re-check). */
export function validateBulkDailyRows(
  rows: ReadonlyArray<DailyDayInput>,
): BulkDailyValidationOutcome {
  if (rows.length === 0) {
    return { valid: false, errors: ["Add at least one day of data."] };
  }

  const errors: string[] = [];
  const validated: DailyDayInput[] = [];

  for (const row of rows) {
    const result = validateDailyDay(row.day_number, {
      streams: row.streams,
      saves: row.saves,
      other_pct: row.other_pct,
    });

    if (result.action === "invalid") {
      errors.push(...result.errors);
      continue;
    }

    if (result.action === "delete") {
      errors.push(`Day ${row.day_number}: streams and saves are required.`);
      continue;
    }

    validated.push(result.row);
  }

  const seen = new Map<number, number>();
  for (const row of validated) {
    seen.set(row.day_number, (seen.get(row.day_number) ?? 0) + 1);
  }
  for (const [day, count] of seen.entries()) {
    if (count > 1) {
      errors.push(`Day ${day} appears more than once.`);
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  validated.sort((a, b) => a.day_number - b.day_number);
  return { valid: true, rows: validated };
}
