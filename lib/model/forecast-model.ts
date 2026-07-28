/**
 * Runtime forecast-model slice used by pure forecast/monitoring/flags math.
 * Structurally satisfied by ActiveModel; kept free of forecast.ts imports
 * to avoid circular dependencies.
 */

export type DowKey = "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun";

export type ForecastModel = {
  trend: {
    median: readonly number[];
    p25: readonly number[];
    p75: readonly number[];
  };
  dow: Record<DowKey, number>;
  editorialKernel: readonly number[];
  releaseTypeMagnitudeMultipliers: Record<
    | "single"
    | "lead_single"
    | "focus_track"
    | "album_track"
    | "alternate_version",
    number
  >;
  saveRateBands: Record<
    "dubstep" | "house" | "melodic-bass" | "downtempo" | "big-room",
    { lo: number; hi: number }
  >;
  saveCountBands: Record<
    "developing" | "mid" | "established",
    { p25: number; p50: number; p75: number; p90: number }
  >;
  config: {
    tierMlThresholds: { mid: number; established: number };
  };
};

/** ISO weekday Mon=1 … Sun=7 → DOW multiplier (index 0 unused). */
export function dowMultiplierByIso(
  dow: ForecastModel["dow"],
): readonly number[] {
  return [
    Number.NaN,
    dow.Mon,
    dow.Tue,
    dow.Wed,
    dow.Thu,
    dow.Fri,
    dow.Sat,
    dow.Sun,
  ];
}

export type ActiveModelSourceInfo = {
  source: "db" | "fallback";
  id: string | null;
  fittedAt: string;
};

/** Human-readable source tag for logs / debug UI. */
export function formatActiveModelSource(model: ActiveModelSourceInfo): string {
  if (model.source === "fallback") {
    return "fallback";
  }
  const idShort = model.id ? model.id.slice(0, 8) : "unknown";
  return `db:${idShort} fitted_at=${model.fittedAt}`;
}

/** Server log line — call once per request after loadActiveModel(). */
export function logActiveModelSource(
  model: ActiveModelSourceInfo,
  context: string,
): void {
  console.info(`[active-model] ${context}: ${formatActiveModelSource(model)}`);
}
