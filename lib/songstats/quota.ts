import { getAccountStatus } from "./client";

export const DEFAULT_SONGSTATS_MONTHLY_OBJECT_CAP = 19;

const BILLABLE_ENDPOINTS = new Set([
  "artists/stats",
  "tracks/info",
  "tracks/stats",
  "tracks/historic_stats",
]);

export function isBillableEndpoint(endpoint: string): boolean {
  return BILLABLE_ENDPOINTS.has(endpoint);
}

export class SongstatsQuotaExceededError extends Error {
  readonly current: number;
  readonly cap: number;

  constructor(current: number, cap: number) {
    super(
      `Songstats monthly object cap reached (${current} of ${cap}). Search still works; typed monthly listeners will be used.`,
    );
    this.name = "SongstatsQuotaExceededError";
    this.current = current;
    this.cap = cap;
  }
}

export function monthlyObjectCap(
  env: NodeJS.ProcessEnv = process.env,
): number {
  const raw = env.SONGSTATS_MONTHLY_OBJECT_CAP;
  if (raw == null || raw.trim() === "") {
    return DEFAULT_SONGSTATS_MONTHLY_OBJECT_CAP;
  }
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 1) {
    return DEFAULT_SONGSTATS_MONTHLY_OBJECT_CAP;
  }
  return value;
}

/**
 * Refuses billable fetches (getArtistStats, getTrackInfo) at the cap.
 * Searches must not call this.
 */
export async function assertBillableAllowed(): Promise<void> {
  const status = await getAccountStatus();
  const cap = monthlyObjectCap();
  if (status.current_month_total_requested_objects >= cap) {
    throw new SongstatsQuotaExceededError(
      status.current_month_total_requested_objects,
      cap,
    );
  }
}
