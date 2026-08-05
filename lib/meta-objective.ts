/**
 * Meta / paid-media objective taxonomy for the ad-spend layer.
 * Final buckets: awareness | traffic | streaming.
 * Legacy "reach" collapses into awareness.
 */

export const META_AD_OBJECTIVES = [
  "awareness",
  "traffic",
  "streaming",
] as const;

export type MetaAdObjective = (typeof META_AD_OBJECTIVES)[number];

/** Raw / legacy labels that may appear in DB or imports. */
export type MetaObjectiveRaw =
  | MetaAdObjective
  | "reach"
  | string
  | null
  | undefined;

/**
 * Normalize to the three-bucket taxonomy.
 * - reach → awareness
 * - unknown / empty → null (caller decides default)
 */
export function normalizeMetaObjective(
  raw: MetaObjectiveRaw,
): MetaAdObjective | null {
  if (raw == null) return null;
  const v = String(raw).trim().toLowerCase();
  if (v === "reach" || v === "awareness") return "awareness";
  if (v === "traffic") return "traffic";
  if (v === "streaming") return "streaming";
  return null;
}

/** Require a normalized objective; default when missing. */
export function coerceMetaObjective(
  raw: MetaObjectiveRaw,
  fallback: MetaAdObjective = "traffic",
): MetaAdObjective {
  return normalizeMetaObjective(raw) ?? fallback;
}

/**
 * Split a legacy single Meta spend by objective so awareness is never
 * silently run through the traffic click→stream funnel.
 */
export function splitMetaSpendByObjective(
  totalSpend: number,
  objective: MetaObjectiveRaw,
): { trafficSpend: number; awarenessSpend: number } {
  const spend = Math.max(0, Number.isFinite(totalSpend) ? totalSpend : 0);
  const obj = coerceMetaObjective(objective, "traffic");
  if (spend <= 0) return { trafficSpend: 0, awarenessSpend: 0 };
  if (obj === "traffic") return { trafficSpend: spend, awarenessSpend: 0 };
  if (obj === "awareness") return { trafficSpend: 0, awarenessSpend: spend };
  // streaming → Spotify SPL path; Meta attributed streams = 0
  return { trafficSpend: 0, awarenessSpend: 0 };
}

/** Derive stored meta_objective from split spends. */
export function deriveMetaObjectiveFromSpends(
  trafficSpend: number,
  awarenessSpend: number,
): MetaAdObjective {
  if (trafficSpend > 0) return "traffic";
  if (awarenessSpend > 0) return "awareness";
  return "streaming";
}
