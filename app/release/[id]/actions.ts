"use server";

import { revalidatePath } from "next/cache";
import { requireAllowedUser } from "@/lib/auth/require-allowed-user";
import {
  bulkUpsertDailyRows,
  deleteDailyDayRow,
  upsertDailyDayRow,
} from "@/lib/persist-daily-data";
import { replaceReleaseArtists } from "@/lib/persist-release-artists";
import { isValidReleaseId, loadRelease } from "@/lib/load-release";
import type { ReleaseArtistDraft } from "@/lib/release-artists";
import { releaseSaveErrorMessage } from "@/lib/release-save-error";
import { createClient } from "@/lib/supabase/server";
import type { DailyDayFieldInput, DailyDayInput } from "@/lib/validate-daily-day";
import {
  validateBulkDailyRows,
  validateDailyDay,
} from "@/lib/validate-daily-day";
import { validateReleaseRoster } from "@/lib/validate-release-roster";

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
        day_number?: string;
      };
      errors?: string[];
    };

export type CloseReleaseResult =
  | { success: true; action: "closed" | "already_closed" }
  | { success: false; error: string };

export type SaveReleaseArtistsResult =
  | { success: true }
  | { success: false; error: string; errors?: string[] };

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

/**
 * Closes a release: status='closed', closed_at=now().
 * Matches a manual Supabase Table Editor close so archive + retrain see the same shape.
 * Idempotent if already closed. Auth + allowlist asserted here (not via page alone).
 */
export async function closeRelease(
  releaseId: string,
): Promise<CloseReleaseResult> {
  const auth = await requireAllowedUser();
  if (!auth.ok) {
    return { success: false, error: auth.error };
  }

  if (!isValidReleaseId(releaseId)) {
    return { success: false, error: INVALID_RELEASE_ID };
  }

  const release = await loadRelease(releaseId);
  if (!release) {
    return { success: false, error: RELEASE_NOT_FOUND };
  }

  if (release.status === "closed") {
    return { success: true, action: "already_closed" };
  }

  const closedAt = new Date().toISOString();
  const { error } = await auth.supabase
    .from("releases")
    .update({
      status: "closed",
      closed_at: closedAt,
    })
    .eq("id", releaseId)
    .eq("status", "active");

  if (error) {
    return { success: false, error: releaseSaveErrorMessage(error) };
  }

  // Race: another closer may have won; treat current closed row as success.
  const refreshed = await loadRelease(releaseId);
  if (!refreshed || refreshed.status !== "closed") {
    return {
      success: false,
      error: "Could not close this release. Try again.",
    };
  }

  revalidatePath(`/release/${releaseId}`);
  revalidatePath("/");
  revalidatePath("/archive");

  return { success: true, action: "closed" };
}

/**
 * Replace the artist roster for an active OR closed release.
 * Narrow exception to closed read-only: writes `release_artists` only.
 * Does not update `releases` (credit line, frozen ML, locked forecast).
 */
export async function saveReleaseArtists(
  releaseId: string,
  drafts: ReleaseArtistDraft[],
): Promise<SaveReleaseArtistsResult> {
  const auth = await requireAllowedUser();
  if (!auth.ok) {
    return { success: false, error: auth.error };
  }

  if (!isValidReleaseId(releaseId)) {
    return { success: false, error: INVALID_RELEASE_ID };
  }

  const release = await loadRelease(releaseId);
  if (!release) {
    return { success: false, error: RELEASE_NOT_FOUND };
  }

  const validation = validateReleaseRoster(drafts);
  if (!validation.valid) {
    return {
      success: false,
      error: validation.errors[0] ?? "Invalid release artists.",
      errors: validation.errors,
    };
  }

  const { error } = await replaceReleaseArtists(
    auth.supabase,
    releaseId,
    validation.rows,
  );
  if (error) {
    return { success: false, error: releaseSaveErrorMessage(error) };
  }

  revalidatePath(`/release/${releaseId}`);
  revalidatePath("/");
  revalidatePath("/archive");

  return { success: true };
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
