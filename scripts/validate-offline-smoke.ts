/**
 * Offline smoke: empty active + archive dashboards, Elderbrook fixture parity,
 * weekday curve compose, day-0 import rejection. No live DB.
 */
import { buildArchiveViewModel } from "@/lib/build-archive-view-model";
import { buildDashboardViewModel } from "@/lib/build-dashboard-view-model";
import { computeWeek1Actuals } from "@/lib/compute-week1-actuals";
import {
  ELDERBROOK_D1_D7,
  ELDERBROOK_RELEASE_ID,
  ELDERBROOK_WK1_SAVES,
  ELDERBROOK_WK1_STREAMS,
} from "@/lib/fixtures/elderbrook-monitoring";
import {
  composeStreamCurvePct,
  computeLockedForecast,
  editorialDayNumber,
  type AdRates,
  type ForecastCoefficients,
  type ReleaseForecastInputs,
  type RegressionModel,
} from "@/lib/forecast";
import { parseDailyData } from "@/lib/parse-daily-data";
import { validateDailyDay } from "@/lib/validate-daily-day";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function stubRegression(interceptLog: number): RegressionModel {
  return {
    intercept: interceptLog,
    rmse: 0.1,
    r2: 0.9,
    log_ml: 0,
    feat: 0,
    ed_tier: 0,
    log_d1: 0,
    log_d2: 0,
    log_d3: 0,
    log_d4: 0,
    log_d5: 0,
    log_d6: 0,
    log_d7: 0,
  };
}

const STUB_COEFFICIENTS: ForecastCoefficients = {
  streams: {
    streams_d0: stubRegression(Math.log(100_000)),
    streams_d1: stubRegression(Math.log(100_000)),
    streams_d2: stubRegression(Math.log(100_000)),
    streams_d3: stubRegression(Math.log(100_000)),
    streams_d4: stubRegression(Math.log(100_000)),
    streams_d5: stubRegression(Math.log(100_000)),
    streams_d6: stubRegression(Math.log(100_000)),
    streams_d7: stubRegression(Math.log(100_000)),
  },
  saves: {
    intercept: Math.log(5_000),
    log_ml: 0,
    feat: 0,
    ed_tier: 0,
    rmse: 0.1,
    r2: 0.9,
    genre_offset: {
      dubstep: 0,
      house: 0,
      "melodic-bass": 0,
      downtempo: 0,
      "big-room": 0,
    },
  },
};

const STUB_AD_RATES: AdRates = {
  spotify_rates: {
    single: {
      marquee: { developing: 0.1, mid: 0.1, established: 0.1 },
      showcase: { developing: 0.1, mid: 0.1, established: 0.1 },
    },
    ep: {
      marquee: { developing: null, mid: null, established: null },
      showcase: { developing: null, mid: null, established: null },
    },
    album: {
      marquee: { developing: null, mid: null, established: null },
      showcase: { developing: null, mid: null, established: null },
    },
  },
};

function baseInputs(
  releaseType: ReleaseForecastInputs["releaseType"],
): ReleaseForecastInputs {
  return {
    monthlyListeners: 500_000,
    isFeature: false,
    editorialTier: 0,
    genre: "house",
    releaseType,
    spotifyFormat: "marquee",
    metaSpendPlanned: 0,
    metaObjective: "traffic",
    spotifySpendPlanned: 0,
  };
}

console.log("=== empty dashboard / archive ===");
const emptyDash = buildDashboardViewModel([], new Map());
assert(emptyDash.rows.length === 0, "dashboard rows should be empty");
assert(emptyDash.summary.totalActive === 0, "totalActive should be 0");
assert(emptyDash.summary.totalFlags === 0, "totalFlags should be 0");
assert(
  emptyDash.summary.recentFlags.length === 0,
  "recentFlags should be empty",
);
console.log("PASS: empty dashboard view model");

const emptyArchive = buildArchiveViewModel([], new Map());
assert(emptyArchive.rows.length === 0, "archive rows should be empty");
assert(emptyArchive.summary.totalClosed === 0, "totalClosed should be 0");
assert(
  emptyArchive.summary.retrainEligible === 0,
  "retrainEligible should be 0",
);
console.log("PASS: empty archive view model");

console.log("\n=== offline Elderbrook fixture (no live UUID) ===");
assert(
  ELDERBROOK_RELEASE_ID === "00000000-0000-4000-8000-00000000e1de",
  `unexpected fixture id ${ELDERBROOK_RELEASE_ID}`,
);
const wk1 = computeWeek1Actuals(ELDERBROOK_D1_D7);
assert(wk1.streams === ELDERBROOK_WK1_STREAMS, `streams ${wk1.streams}`);
assert(wk1.saves === ELDERBROOK_WK1_SAVES, `saves ${wk1.saves}`);
assert(ELDERBROOK_D1_D7.every((d) => d.day_number <= 7), "fixture d1–d7 only");
console.log(
  `PASS: fixture ${ELDERBROOK_RELEASE_ID} → ${wk1.streams} / ${wk1.saves}`,
);

console.log("\n=== weekday curve ===");
assert(editorialDayNumber("2026-05-28") === 2, "Thu → 2");
assert(editorialDayNumber("2026-05-27") === 3, "Wed → 3");
assert(editorialDayNumber("2026-07-01") === 3, "Wed string → 3");
assert(
  editorialDayNumber(new Date("2026-07-01")) === 3,
  "Wed Date → 3 (UTC-invariant)",
);
assert(
  editorialDayNumber("2026-07-01") ===
    editorialDayNumber(new Date("2026-07-01")),
  "string and Date agree",
);

// (a) Thursday release reproduces Elderbrook curve within ±0.1pp; wk1 = 100%
const thu = composeStreamCurvePct({ releaseDate: "2026-05-28" });
const elderbrookTarget = [6.37, 28.54, 13.54, 8.9, 13.58, 14.89, 14.19];
for (let i = 0; i < 7; i++) {
  const diff = Math.abs(thu[i]! - elderbrookTarget[i]!);
  assert(diff <= 0.1, `Thu d${i + 1} off by ${diff.toFixed(3)}pp (limit ±0.1)`);
}
const thuWk1 = thu.slice(0, 7).reduce((s, p) => s + p, 0);
assert(Math.abs(thuWk1 - 100) < 1e-6, `Thu wk1 sum ${thuWk1} ≠ 100`);
console.log("PASS: Thu compose within ±0.1pp (Elderbrook); wk1=100");

// (b) Friday: d1 editorial peak; Fridays high / Sundays low in the tail; wk1=100
const fri = composeStreamCurvePct({ releaseDate: "2026-05-29" });
const friMax = Math.max(...fri);
assert(fri.indexOf(friMax) === 0, `Fri peak should be d1, got d${fri.indexOf(friMax) + 1}`);
assert(fri[0]! > fri[1]!, "Fri d1 editorial peak > d2");
// Calendar Fridays d8/d15/d22 vs Sundays d10/d17/d24 in the same week
for (const [friDay, sunDay] of [
  [8, 10],
  [15, 17],
  [22, 24],
] as const) {
  assert(
    fri[friDay - 1]! > fri[sunDay - 1]!,
    `Fri d${friDay} (${fri[friDay - 1]!.toFixed(2)}) should exceed Sun d${sunDay} (${fri[sunDay - 1]!.toFixed(2)})`,
  );
}
const friWk1 = fri.slice(0, 7).reduce((s, p) => s + p, 0);
assert(Math.abs(friWk1 - 100) < 1e-6, `Fri wk1 sum ${friWk1} ≠ 100`);
console.log("PASS: Fri d1 peak + elevated Fridays / depressed Sundays; wk1=100");

console.log("\n=== release_type magnitude multiplier ===");
const lockOpts = { releaseDate: "2026-05-28" as const };
const focus = computeLockedForecast(
  baseInputs("focus_track"),
  STUB_COEFFICIENTS,
  STUB_AD_RATES,
  lockOpts,
);
const alternate = computeLockedForecast(
  baseInputs("alternate_version"),
  STUB_COEFFICIENTS,
  STUB_AD_RATES,
  lockOpts,
);
const single = computeLockedForecast(
  baseInputs("single"),
  STUB_COEFFICIENTS,
  STUB_AD_RATES,
  lockOpts,
);
const albumTrack = computeLockedForecast(
  baseInputs("album_track"),
  STUB_COEFFICIENTS,
  STUB_AD_RATES,
  lockOpts,
);

const expectedRatio = 1.03 / 0.87;
const streamsRatio =
  focus.streams.week1Streams / alternate.streams.week1Streams;
const savesRatio = focus.saves.week1Saves / alternate.saves.week1Saves;
assert(
  Math.abs(streamsRatio - expectedRatio) < 0.01,
  `focus:alt streams ratio ${streamsRatio} ≠ ${expectedRatio}`,
);
assert(
  Math.abs(savesRatio - expectedRatio) < 0.01,
  `focus:alt saves ratio ${savesRatio} ≠ ${expectedRatio}`,
);
assert(
  single.streams.week1Streams === albumTrack.streams.week1Streams,
  "single and album_track streams should match (both 1.0×)",
);
assert(
  single.saves.week1Saves === albumTrack.saves.week1Saves,
  "single and album_track saves should match (both 1.0×)",
);
assert(
  Math.abs(
    (focus.saves.impliedSaveRate ?? 0) - (alternate.saves.impliedSaveRate ?? 0),
  ) < 0.05,
  "save-rate should stay ~constant across magnitude",
);
assert(
  JSON.stringify(focus.streamCurve.dailyPct) ===
    JSON.stringify(alternate.streamCurve.dailyPct),
  "curve shape (dailyPct) must be unchanged by magnitude",
);
console.log(
  `PASS: focus/alt streams ${focus.streams.week1Streams}/${alternate.streams.week1Streams} ≈ 1.03:0.87; single=album_track=${single.streams.week1Streams}`,
);

console.log("\n=== day-0 import rejection ===");
const parsed = parseDailyData("0,100,10\n1,200,20", true);
assert(
  parsed.issues.some((issue) => issue.includes("Day 0")),
  `expected day-0 issue, got: ${parsed.issues.join("; ")}`,
);
const day0 = validateDailyDay(0, { streams: "100", saves: "10" });
assert(day0.action === "invalid", "day 0 should be invalid");
console.log("PASS: day 0 rejected in parse + validate");

console.log("\nAll offline smokes passed.");
