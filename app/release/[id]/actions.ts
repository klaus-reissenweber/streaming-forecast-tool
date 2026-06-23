"use server";

import {
  bulkUpsertDailyRows,
  deleteDailyDayRow,
  upsertDailyDayRow,
} from "@/lib/persist-daily-data";
import { isValidReleaseId, loadRelease } from "@/lib/load-release";
import { releaseSaveErrorMessage } from "@/lib/release-save-error";
import { createClient } from "@/lib/supabase/server";
import type { DailyDayFieldInput, DailyDayInput } from "@/lib/validate-daily-day";
import {
  validateBulkDailyRows,
  validateDailyDay,
} from "@/lib/validate-daily-day";

export type DailyEntryActionResult =
  | {
      success: true;
      action: "upserted" | "deleted" | "bulk_upserted";
      dayNumber?: number;
      rowCount?: number;
    }
  | {
      success: false;
      error: string;
      fieldErrors?: {
        streams?: string;
        saves?: string;
        other_pct?: string;
        day_number?: string;
      };
      errors?: string[];
    };

const RELEASE_NOT_FOUND = "Release not found.";
const RELEASE_CLOSED =
  "This release is closed. Daily data cannot be edited here.";
const INVALID_RELEASE_ID = "Invalid release id.";

async function assertWritableRelease(releaseId: string) {
  if (!isValidReleaseId(releaseId)) {
    return { ok: false as const, result: failure(INVALID_RELEASE_ID) };
  }

  const release = await loadRelease(releaseId);
  if (!release) {
    return { ok: false as const, result: failure(RELEASE_NOT_FOUND) };
  }

  if (release.status === "closed") {
    return { ok: false as const, result: failure(RELEASE_CLOSED) };
  }

  return { ok: true as const, release };
}

function failure(
  error: string,
  extras?: Omit<Extract<DailyEntryActionResult, { success: false }>, "success" | "error">,
): DailyEntryActionResult {
  return { success: false, error, ...extras };
}

function mapPersistError(error: { message: string; code?: string | null }) {
  return releaseSaveErrorMessage(error);
}

export async function upsertDailyDay(
  releaseId: string,
  dayNumber: number,
  fields: DailyDayFieldInput,
): Promise<DailyEntryActionResult> {
  const access = await assertWritableRelease(releaseId);
  if (!access.ok) {
    return access.result;
  }

  const validation = validateDailyDay(dayNumber, fields);
  if (validation.action === "invalid") {
    return failure(validation.errors[0] ?? "Invalid daily data.", {
      fieldErrors: validation.fieldErrors,
      errors: validation.errors,
    });
  }

  const supabase = await createClient();

  if (validation.action === "delete") {
    const { error } = await deleteDailyDayRow(supabase, releaseId, dayNumber);
    if (error) {
      return failure(mapPersistError(error));
    }
    return { success: true, action: "deleted", dayNumber };
  }

  const { error } = await upsertDailyDayRow(
    supabase,
    releaseId,
    validation.row,
  );
  if (error) {
    return failure(mapPersistError(error));
  }

  return { success: true, action: "upserted", dayNumber };
}

export async function deleteDailyDay(
  releaseId: string,
  dayNumber: number,
): Promise<DailyEntryActionResult> {
  const access = await assertWritableRelease(releaseId);
  if (!access.ok) {
    return access.result;
  }

  if (!Number.isInteger(dayNumber) || dayNumber < 1 || dayNumber > 28) {
    return failure("Day must be a whole number from 1 to 28.", {
      fieldErrors: { day_number: "Day must be a whole number from 1 to 28." },
    });
  }

  const supabase = await createClient();
  const { error } = await deleteDailyDayRow(supabase, releaseId, dayNumber);
  if (error) {
    return failure(mapPersistError(error));
  }

  return { success: true, action: "deleted", dayNumber };
}

export async function bulkUpsertDailyData(
  releaseId: string,
  rows: DailyDayInput[],
): Promise<DailyEntryActionResult> {
  const access = await assertWritableRelease(releaseId);
  if (!access.ok) {
    return access.result;
  }

  const validation = validateBulkDailyRows(rows);
  if (!validation.valid) {
    return failure(validation.errors[0] ?? "Invalid daily data.", {
      errors: validation.errors,
    });
  }

  const supabase = await createClient();
  const { error, rowCount } = await bulkUpsertDailyRows(
    supabase,
    releaseId,
    validation.rows,
  );

  if (error) {
    return failure(mapPersistError(error));
  }

  return { success: true, action: "bulk_upserted", rowCount };
}
