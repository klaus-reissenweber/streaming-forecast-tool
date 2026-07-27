/** True when `a` parses as a later instant than `b` (Postgres + ISO safe). */
export function isTimestampAfter(a: string, b: string): boolean {
  const aMs = new Date(a).getTime();
  const bMs = new Date(b).getTime();
  if (!Number.isFinite(aMs) || !Number.isFinite(bMs)) {
    return false;
  }
  return aMs > bMs;
}
