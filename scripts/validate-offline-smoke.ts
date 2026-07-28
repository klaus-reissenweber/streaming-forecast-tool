/**
 * Offline smoke: empty active + archive dashboards, Elderbrook fixture parity,
 * weekday curve compose, day-0 import rejection. No live DB.
 */
import {
  buildArchiveViewModel,
  isRetrainProgressEligible,
} from "@/lib/build-archive-view-model";
import { buildDashboardViewModel } from "@/lib/build-dashboard-view-model";
import { computeWeek1Actuals } from "@/lib/compute-week1-actuals";
import {
  ELDERBROOK_D1_D7,
  ELDERBROOK_RELEASE_ID,
  ELDERBROOK_WK1_SAVES,
  ELDERBROOK_WK1_STREAMS,
} from "@/lib/fixtures/elderbrook-monitoring";
import {
  RELEASE_TYPE_MAGNITUDE_MULTIPLIER,
  RETRAIN_LAST_AT,
  RETRAIN_THRESHOLD,
  STREAM_CURVE_BASELINE,
  STREAM_CURVE_TREND,
  STREAM_EDITORIAL_KERNEL,
} from "@/lib/constants";
import {
  composeStreamCurvePct,
  computeLockedForecast,
  editorialDayNumber,
  type AdRates,
  type ForecastCoefficients,
  type ReleaseForecastInputs,
  type RegressionModel,
} from "@/lib/forecast";
import { resolveLastRetrainAt } from "@/lib/load-last-retrain-at";
import { buildFallbackActiveModel } from "@/lib/model/active-model";
import { parseDailyData } from "@/lib/parse-daily-data";
import { validateDailyDay } from "@/lib/validate-daily-day";

const MODEL = buildFallbackActiveModel();

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
const emptyDash = buildDashboardViewModel([], new Map(), MODEL);
assert(emptyDash.rows.length === 0, "dashboard rows should be empty");
assert(emptyDash.summary.totalActive === 0, "totalActive should be 0");
assert(emptyDash.summary.totalFlags === 0, "totalFlags should be 0");
assert(
  emptyDash.summary.recentFlags.length === 0,
  "recentFlags should be empty",
);
console.log("PASS: empty dashboard view model");

const emptyArchive = buildArchiveViewModel([], new Map(), MODEL);
assert(emptyArchive.rows.length === 0, "archive rows should be empty");
assert(emptyArchive.summary.totalClosed === 0, "totalClosed should be 0");
assert(
  emptyArchive.summary.retrainEligible === 0,
  "retrainEligible should be 0",
);
assert(
  emptyArchive.summary.retrainProgressCount === 0,
  "retrainProgressCount should be 0",
);

console.log("\n=== retrain progress cutoff ===");
assert(RETRAIN_THRESHOLD === 10, "RETRAIN_THRESHOLD default");
assert(
  resolveLastRetrainAt(null) === RETRAIN_LAST_AT,
  "null fitted_at → marker",
);
assert(
  resolveLastRetrainAt("2020-01-01T00:00:00.000Z") === RETRAIN_LAST_AT,
  "older fitted_at → marker wins",
);
assert(
  resolveLastRetrainAt("2099-01-01T00:00:00.000Z") ===
    "2099-01-01T00:00:00.000Z",
  "newer fitted_at wins",
);
assert(
  isRetrainProgressEligible(
    { wk1Complete: true, closedAt: "2026-08-01T00:00:00.000Z" },
    RETRAIN_LAST_AT,
  ),
  "post-cutoff complete close counts",
);
assert(
  !isRetrainProgressEligible(
    { wk1Complete: true, closedAt: "2026-01-01T00:00:00.000Z" },
    RETRAIN_LAST_AT,
  ),
  "pre-cutoff close excluded",
);
// View model passes closed_at through parseNullableTimestamp unchanged — Supabase
// timestamptz often looks like "YYYY-MM-DD HH:MM:SS+00", not ISO with T/Z.
const postgresSameDayAfter =
  "2026-07-27 21:54:04+00"; /* after RETRAIN_LAST_AT same calendar day */
const postgresSameDayBefore = "2026-07-27 01:00:00+00";
assert(
  Number.isFinite(new Date(postgresSameDayAfter).getTime()),
  "Postgres closedAt shape must parse",
);
assert(
  !(postgresSameDayAfter > RETRAIN_LAST_AT),
  "sanity: string compare wrongly excludes same-day Postgres close",
);
assert(
  isRetrainProgressEligible(
    { wk1Complete: true, closedAt: postgresSameDayAfter },
    RETRAIN_LAST_AT,
  ),
  "same-day Postgres close after cutoff counts",
);
assert(
  !isRetrainProgressEligible(
    { wk1Complete: true, closedAt: postgresSameDayBefore },
    RETRAIN_LAST_AT,
  ),
  "same-day Postgres close before cutoff excluded",
);
assert(
  resolveLastRetrainAt("2026-07-27 21:54:04+00") === "2026-07-27 21:54:04+00",
  "Postgres fitted_at after marker wins via timestamp compare",
);
console.log("PASS: last-retrain resolve + progress eligibility");
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

// (a) Thursday compose = STREAM_CURVE_BASELINE (derived view) + wk1 = 100%.
// Catalog-fitted trend/kernel replaced the Elderbrook seed absolute targets.
const thu = composeStreamCurvePct(MODEL, { releaseDate: "2026-05-28" });
for (let i = 0; i < thu.length; i++) {
  const diff = Math.abs(thu[i]! - STREAM_CURVE_BASELINE.median[i]!);
  assert(
    diff <= 1e-9,
    `Thu compose d${i + 1} ≠ BASELINE.median (diff ${diff})`,
  );
}
const thuWk1 = thu.slice(0, 7).reduce((s, p) => s + p, 0);
assert(Math.abs(thuWk1 - 100) < 1e-6, `Thu wk1 sum ${thuWk1} ≠ 100`);
assert(
  STREAM_EDITORIAL_KERNEL[0]! > STREAM_EDITORIAL_KERNEL[1]! &&
    STREAM_EDITORIAL_KERNEL[1]! >= 0,
  "editorial kernel should be decreasing and non-negative",
);
assert(
  STREAM_CURVE_TREND.median.every((pct) => pct > 0),
  "trend median must have no zero/empty tail",
);
assert(
  thu[1]! > thu[0]!,
  "Thu d2 (editorial Friday) should exceed d1 after compose",
);
console.log(
  "PASS: Thu compose ≡ STREAM_CURVE_BASELINE; wk1=100; kernel/trend shape ok",
);

// (b) Friday: d1 editorial peak; Fridays high / Sundays low in the tail; wk1=100
const fri = composeStreamCurvePct(MODEL, { releaseDate: "2026-05-29" });
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
  MODEL,
  lockOpts,
);
const alternate = computeLockedForecast(
  baseInputs("alternate_version"),
  STUB_COEFFICIENTS,
  STUB_AD_RATES,
  MODEL,
  lockOpts,
);
const single = computeLockedForecast(
  baseInputs("single"),
  STUB_COEFFICIENTS,
  STUB_AD_RATES,
  MODEL,
  lockOpts,
);
const albumTrack = computeLockedForecast(
  baseInputs("album_track"),
  STUB_COEFFICIENTS,
  STUB_AD_RATES,
  MODEL,
  lockOpts,
);

// Magnitudes are retrain-synced — assert against live constants, not seed ratios.
const expectedRatio =
  RELEASE_TYPE_MAGNITUDE_MULTIPLIER.focus_track /
  RELEASE_TYPE_MAGNITUDE_MULTIPLIER.alternate_version;
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
const expectedAlbumRatio = RELEASE_TYPE_MAGNITUDE_MULTIPLIER.album_track;
const albumStreamsRatio =
  albumTrack.streams.week1Streams / single.streams.week1Streams;
assert(
  Math.abs(albumStreamsRatio - expectedAlbumRatio) < 0.01,
  `album:single streams ratio ${albumStreamsRatio} ≠ ${expectedAlbumRatio}`,
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
  `PASS: focus/alt ≈ ${RELEASE_TYPE_MAGNITUDE_MULTIPLIER.focus_track}:${RELEASE_TYPE_MAGNITUDE_MULTIPLIER.alternate_version}; album_track=${expectedAlbumRatio}×`,
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
