import type { DailyDataPoint } from "@/lib/map-release-row";

/** Verified Elderbrook D1–D7 daily_data from Supabase (ae749c93…). */
export const ELDERBROOK_LOCKED_STREAMS = 450_251;
export const ELDERBROOK_LOCKED_SAVES = 30_269;
export const ELDERBROOK_MONTHLY_LISTENERS = 8_780_000;

export const ELDERBROOK_D1_D7: DailyDataPoint[] = [
  {
    id: "fixture-d1",
    release_id: "ae749c93-fa94-4bb5-b6d9-1845e961b8cd",
    day_number: 1,
    streams: 28_221,
    saves: 4_192,
    other_pct: null,
    recorded_at: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "fixture-d2",
    release_id: "ae749c93-fa94-4bb5-b6d9-1845e961b8cd",
    day_number: 2,
    streams: 129_399,
    saves: 6_300,
    other_pct: null,
    recorded_at: "2026-01-02T00:00:00.000Z",
  },
  {
    id: "fixture-d3",
    release_id: "ae749c93-fa94-4bb5-b6d9-1845e961b8cd",
    day_number: 3,
    streams: 61_439,
    saves: 2_507,
    other_pct: null,
    recorded_at: "2026-01-03T00:00:00.000Z",
  },
  {
    id: "fixture-d4",
    release_id: "ae749c93-fa94-4bb5-b6d9-1845e961b8cd",
    day_number: 4,
    streams: 40_339,
    saves: 1_660,
    other_pct: null,
    recorded_at: "2026-01-04T00:00:00.000Z",
  },
  {
    id: "fixture-d5",
    release_id: "ae749c93-fa94-4bb5-b6d9-1845e961b8cd",
    day_number: 5,
    streams: 61_571,
    saves: 1_931,
    other_pct: null,
    recorded_at: "2026-01-05T00:00:00.000Z",
  },
  {
    id: "fixture-d6",
    release_id: "ae749c93-fa94-4bb5-b6d9-1845e961b8cd",
    day_number: 6,
    streams: 67_520,
    saves: 1_752,
    other_pct: null,
    recorded_at: "2026-01-06T00:00:00.000Z",
  },
  {
    id: "fixture-d7",
    release_id: "ae749c93-fa94-4bb5-b6d9-1845e961b8cd",
    day_number: 7,
    streams: 64_359,
    saves: 1_612,
    other_pct: null,
    recorded_at: "2026-01-07T00:00:00.000Z",
  },
];
