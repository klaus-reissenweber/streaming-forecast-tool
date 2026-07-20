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
  editorialDayNumber,
} from "@/lib/forecast";
import { parseDailyData } from "@/lib/parse-daily-data";
import { validateDailyDay } from "@/lib/validate-daily-day";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
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
const thu = composeStreamCurvePct({ releaseDate: "2026-05-28" });
const target = [6.37, 28.54, 13.54, 8.9, 13.58, 14.89, 14.19];
for (let i = 0; i < 7; i++) {
  assert(Math.abs(thu[i]! - target[i]!) <= 1.0, `d${i + 1} off`);
}
console.log("PASS: Thu compose within ±1pp");

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
