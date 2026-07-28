/**
 * Load the active consolidated model version (Phase 1).
 * In-memory cache ~60s, keyed on activated_at. Falls back to lib/constants.ts
 * shapes when no active version row exists or the DB read fails.
 *
 * Not threaded into the forecast path yet.
 */

import {
  activeModelFromRow,
  buildFallbackActiveModel,
  type ActiveModel,
  type ActiveModelRow,
} from "@/lib/model/active-model";
import { createServiceClient } from "@/lib/supabase/service";

const CACHE_TTL_MS = 60_000;

type CacheEntry = {
  activatedAt: string | null;
  expiresAt: number;
  model: ActiveModel;
};

let cache: CacheEntry | null = null;

export function clearActiveModelCache(): void {
  cache = null;
}

function cacheIsFresh(entry: CacheEntry, now: number): boolean {
  return now < entry.expiresAt;
}

async function fetchActiveModelRow(): Promise<ActiveModelRow | null> {
  // Service role: model_coefficients is non-user config; RLS only grants
  // SELECT to authenticated, so anon / session-less server contexts would
  // otherwise see zero rows and silently fall back to constants.
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("model_coefficients")
    .select("id, fitted_at, activated_at, payload, metadata")
    .eq("status", "active")
    .not("payload", "is", null)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`model_coefficients active version: ${error.message}`);
  }
  if (!data?.payload) {
    return null;
  }

  return data as ActiveModelRow;
}

/**
 * Returns the active model version. Prefer DB; on miss/error use constants
 * fallback. Cache keyed on activated_at with a ~60s TTL.
 */
export async function loadActiveModel(): Promise<ActiveModel> {
  const now = Date.now();
  if (cache && cacheIsFresh(cache, now)) {
    return cache.model;
  }

  try {
    const row = await fetchActiveModelRow();
    const model = row ? activeModelFromRow(row) : buildFallbackActiveModel();
    // Keyed on activated_at: a promote with a new stamp always replaces cache.
    cache = {
      activatedAt: model.activatedAt,
      expiresAt: now + CACHE_TTL_MS,
      model,
    };
    return model;
  } catch {
    const fallback = buildFallbackActiveModel();
    cache = {
      activatedAt: fallback.activatedAt,
      expiresAt: now + CACHE_TTL_MS,
      model: fallback,
    };
    return fallback;
  }
}
