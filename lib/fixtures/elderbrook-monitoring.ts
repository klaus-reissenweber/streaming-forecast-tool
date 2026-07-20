import type { DailyDataPoint } from "@/lib/map-release-row";

/**
 * Offline Elderbrook golden fixture (day-1 = release_date convention;
 * timezone sliver folded into day 1). Synthetic UUID — not a DB row.
 * Asserts d1–d7 only (no fabricated d28). Used by validate scripts +
 * retrain parity; never looked up live.
 */
export const ELDERBROOK_RELEASE_ID =
  "00000000-0000-4000-8000-00000000e1de" as const;

/** Locked forecast at create time (unchanged by curve-shape re-render). */
export const ELDERBROOK_LOCKED_STREAMS = 450_251;
export const ELDERBROOK_LOCKED_SAVES = 30_269;
export const ELDERBROOK_MONTHLY_LISTENERS = 8_780_000;

/** Folded wk1 actuals (d1–d7): streams 453,483 / saves 20,138. */
export const ELDERBROOK_WK1_STREAMS = 453_483;
export const ELDERBROOK_WK1_SAVES = 20_138;

/**
 * Thursday release calibration shape (streams from §3 reference).
 * Saves: d1 = 4,379; d3 trimmed by 3 vs pre-wipe junk-row copy so wk1 = 20,138.
 */
export const ELDERBROOK_D1_D7: DailyDataPoint[] = [
  {
    id: "fixture-d1",
    release_id: ELDERBROOK_RELEASE_ID,
    day_number: 1,
    streams: 28_871,
    saves: 4_379,
    recorded_at: "2026-05-28T00:00:00.000Z",
  },
  {
    id: "fixture-d2",
    release_id: ELDERBROOK_RELEASE_ID,
    day_number: 2,
    streams: 129_399,
    saves: 6_300,
    recorded_at: "2026-05-29T00:00:00.000Z",
  },
  {
    id: "fixture-d3",
    release_id: ELDERBROOK_RELEASE_ID,
    day_number: 3,
    streams: 61_424,
    saves: 2_504,
    recorded_at: "2026-05-30T00:00:00.000Z",
  },
  {
    id: "fixture-d4",
    release_id: ELDERBROOK_RELEASE_ID,
    day_number: 4,
    streams: 40_339,
    saves: 1_660,
    recorded_at: "2026-05-31T00:00:00.000Z",
  },
  {
    id: "fixture-d5",
    release_id: ELDERBROOK_RELEASE_ID,
    day_number: 5,
    streams: 61_571,
    saves: 1_931,
    recorded_at: "2026-06-01T00:00:00.000Z",
  },
  {
    id: "fixture-d6",
    release_id: ELDERBROOK_RELEASE_ID,
    day_number: 6,
    streams: 67_520,
    saves: 1_752,
    recorded_at: "2026-06-02T00:00:00.000Z",
  },
  {
    id: "fixture-d7",
    release_id: ELDERBROOK_RELEASE_ID,
    day_number: 7,
    streams: 64_359,
    saves: 1_612,
    recorded_at: "2026-06-03T00:00:00.000Z",
  },
];
