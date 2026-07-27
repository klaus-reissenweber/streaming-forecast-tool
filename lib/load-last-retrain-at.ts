import { RETRAIN_LAST_AT } from "@/lib/constants";
import { isTimestampAfter } from "@/lib/is-timestamp-after";
import { createClient } from "@/lib/supabase/server";

/**
 * Resolve the archive retrain-progress cutoff.
 *
 * Source of truth (later wins):
 * 1. max(fitted_at) among active model_coefficients rows (stamped on every
 *    promote; also seeded once via retrain.py --stamp-last-retrain)
 * 2. RETRAIN_LAST_AT constant (initial seed / fallback only)
 */
export function resolveLastRetrainAt(
  activeFittedAt: string | null | undefined,
  markerAt: string = RETRAIN_LAST_AT,
): string {
  if (!activeFittedAt) {
    return markerAt;
  }
  // fitted_at may be Postgres timestamptz; marker is ISO — compare as instants.
  return isTimestampAfter(activeFittedAt, markerAt) ? activeFittedAt : markerAt;
}

/** Load max active fitted_at from model_coefficients (null if none / error). */
export async function loadActiveModelFittedAt(): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("model_coefficients")
    .select("fitted_at")
    .eq("is_active", true)
    .order("fitted_at", { ascending: false })
    .limit(1);

  if (error) {
    throw new Error(`model_coefficients fitted_at: ${error.message}`);
  }

  const fittedAt = data?.[0]?.fitted_at;
  return typeof fittedAt === "string" && fittedAt.length > 0 ? fittedAt : null;
}

export async function loadLastRetrainAt(): Promise<string> {
  const activeFittedAt = await loadActiveModelFittedAt();
  return resolveLastRetrainAt(activeFittedAt);
}
