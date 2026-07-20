/**
 * Daily data day-number convention (locked).
 *
 * - day_number = 1 means the release_date (track live on all platforms).
 * - The timezone sliver (streams/saves the calendar day *before* release_date)
 *   is folded into day 1. There is no day 0.
 * - Days run 1–28 from release_date. Do not invent a pre-release day column.
 */
export const DAILY_DATA_DAY1_CONVENTION =
  "Day 1 = release date. Fold the day-before timezone sliver into day 1 (no day 0)." as const;

export const DAILY_DATA_DAY0_REJECTED =
  "Day 0 is not allowed. Day 1 is the release date — fold any pre-release timezone sliver into day 1." as const;
