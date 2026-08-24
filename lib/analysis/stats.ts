/** Wilson score interval for a proportion. Preferred over normal approximation
 *  at small n, where the naive interval can run past 0 or 1. */
export function wilson(successes: number, n: number, z = 1.96): [number, number] {
  if (n <= 0) return [0, 1];
  const p = successes / n;
  const d = 1 + (z * z) / n;
  const centre = (p + (z * z) / (2 * n)) / d;
  const half = (z / d) * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return [Math.max(0, centre - half), Math.min(1, centre + half)];
}

export const mean = (xs: number[]): number =>
  xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN;

export function sd(xs: number[]): number {
  if (xs.length < 2) return NaN;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1));
}

export function median(xs: number[]): number {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length / 2;
  return s.length % 2 ? s[Math.floor(mid)] : (s[mid - 1] + s[mid]) / 2;
}

/** Two-sided 95% critical values. Falls back to the normal value at large df. */
const T95: Record<number, number> = {
  1: 12.706, 2: 4.303, 3: 3.182, 4: 2.776, 5: 2.571, 6: 2.447, 7: 2.365,
  8: 2.306, 9: 2.262, 10: 2.228, 12: 2.179, 15: 2.131, 20: 2.086,
  25: 2.060, 30: 2.042, 40: 2.021, 60: 2.000, 120: 1.980,
};
export function tCrit(df: number): number {
  if (df < 1) return NaN;
  if (T95[df]) return T95[df];
  const keys = Object.keys(T95).map(Number).sort((a, b) => a - b);
  const below = keys.filter((k) => k < df).pop();
  return below !== undefined && df > 120 ? 1.96 : T95[below ?? 1];
}

/** Exact two-sided binomial test against p = 0.5. Used for "do the misses
 *  run one way", where direction matters and magnitude does not. */
export function signTestP(successes: number, n: number): number {
  if (n === 0) return 1;
  const k = Math.max(successes, n - successes);
  let tail = 0;
  for (let i = k; i <= n; i++) tail += choose(n, i) * 0.5 ** n;
  return Math.min(1, 2 * tail);
}

function choose(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return r;
}
