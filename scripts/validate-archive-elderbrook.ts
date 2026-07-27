import { buildArchiveViewModel } from "@/lib/build-archive-view-model";
import { computeWeek1Actuals } from "@/lib/compute-week1-actuals";
import {
  ELDERBROOK_D1_D7,
  ELDERBROOK_LOCKED_SAVES,
  ELDERBROOK_LOCKED_STREAMS,
  ELDERBROOK_MONTHLY_LISTENERS,
  ELDERBROOK_RELEASE_ID,
  ELDERBROOK_WK1_SAVES,
  ELDERBROOK_WK1_STREAMS,
} from "@/lib/fixtures/elderbrook-monitoring";
import type { ReleaseRecord } from "@/lib/map-release-row";

const ELDERBROOK_CLOSED: ReleaseRecord = {
  id: ELDERBROOK_RELEASE_ID,
  track_name: "Is It Over Now?",
  artist_name: "Elderbrook",
  genre: "house",
  monthly_listeners: ELDERBROOK_MONTHLY_LISTENERS,
  monthly_listeners_at_release: ELDERBROOK_MONTHLY_LISTENERS,
  is_feature: false,
  editorial_tier: 2,
  release_date: "2026-05-28",
  release_type: "single",
  spotify_format: "marquee",
  meta_spend_planned: 0,
  meta_objective: "traffic",
  spotify_spend_planned: 0,
  locked_forecast_streams: ELDERBROOK_LOCKED_STREAMS,
  locked_forecast_saves: ELDERBROOK_LOCKED_SAVES,
  model_version_used: "fixture",
  status: "closed",
  created_at: "2026-05-28T00:00:00.000Z",
  closed_at: "2026-06-23T12:00:00.000Z",
};

console.log("=== computeWeek1Actuals (Elderbrook D1–D7) ===");
const wk1 = computeWeek1Actuals(ELDERBROOK_D1_D7);
console.log(JSON.stringify(wk1, null, 2));

if (wk1.streams !== ELDERBROOK_WK1_STREAMS) {
  throw new Error(
    `Expected wk1 streams ${ELDERBROOK_WK1_STREAMS}, got ${wk1.streams}`,
  );
}
if (wk1.saves !== ELDERBROOK_WK1_SAVES) {
  throw new Error(
    `Expected wk1 saves ${ELDERBROOK_WK1_SAVES}, got ${wk1.saves}`,
  );
}
if (!wk1.isComplete) {
  throw new Error("Expected complete wk1 (7 stream days)");
}
console.log("PASS: computeWeek1Actuals");

console.log("\n=== buildArchiveViewModel (closed Elderbrook) ===");
const dailyDataByReleaseId = new Map([
  [ELDERBROOK_RELEASE_ID, ELDERBROOK_D1_D7],
]);
const archive = buildArchiveViewModel(
  [ELDERBROOK_CLOSED],
  dailyDataByReleaseId,
);

const row = archive.rows[0];
if (!row) {
  throw new Error("Expected one archive row");
}

console.log(
  JSON.stringify(
    {
      lockedStreams: row.lockedStreams,
      actualStreams: row.actualStreams,
      streamsDelta: row.streamsDelta,
      streamsDeltaPct: Number(row.streamsDeltaPct?.toFixed(1)),
      streamsDeltaTone: row.streamsDeltaTone,
      actualSaveRate: Number(row.actualSaveRate?.toFixed(1)),
      saveRateVsBand: row.saveRateVsBand,
      wk1Complete: row.wk1Complete,
      summary: archive.summary,
    },
    null,
    2,
  ),
);

if (row.actualStreams !== ELDERBROOK_WK1_STREAMS) {
  throw new Error(
    `Expected actualStreams ${ELDERBROOK_WK1_STREAMS}, got ${row.actualStreams}`,
  );
}
if (row.lockedStreams !== 450_251) {
  throw new Error(`Expected lockedStreams 450,251, got ${row.lockedStreams}`);
}

const deltaPct = row.streamsDeltaPct ?? 0;
// Folded wk1 453,483 vs locked 450,251 ≈ +0.72%
if (deltaPct < 0.5 || deltaPct > 1.0) {
  throw new Error(
    `Expected streamsDeltaPct ~+0.7% (0.5–1.0), got ${deltaPct.toFixed(2)}%`,
  );
}
if (row.streamsDeltaTone !== "on_track") {
  throw new Error(
    `Expected streamsDeltaTone on_track at +${deltaPct.toFixed(1)}%, got ${row.streamsDeltaTone}`,
  );
}
if (row.saveRateVsBand !== "within") {
  throw new Error(`Expected saveRateVsBand within, got ${row.saveRateVsBand}`);
}
if (archive.summary.retrainEligible !== 1) {
  throw new Error(
    `Expected retrainEligible 1, got ${archive.summary.retrainEligible}`,
  );
}
// Without lastRetrainAt, progress numerator stays 0 (fresh baseline).
if (archive.summary.retrainProgressCount !== 0) {
  throw new Error(
    `Expected retrainProgressCount 0 without cutoff, got ${archive.summary.retrainProgressCount}`,
  );
}
const afterBaseline = buildArchiveViewModel(
  [ELDERBROOK_CLOSED],
  new Map([[ELDERBROOK_CLOSED.id, [...ELDERBROOK_D1_D7]]]),
  { lastRetrainAt: "2020-01-01T00:00:00.000Z" },
);
if (afterBaseline.summary.retrainProgressCount !== 1) {
  throw new Error(
    `Expected retrainProgressCount 1 after old cutoff, got ${afterBaseline.summary.retrainProgressCount}`,
  );
}

console.log("\nPASS: Elderbrook archive row matches expected forecast vs actual.");

console.log("\n=== sortArchiveRows by streams_delta_pct_desc ===");
const lowPerformer: ReleaseRecord = {
  ...ELDERBROOK_CLOSED,
  id: "low-performer",
  track_name: "Under",
  locked_forecast_streams: 100_000,
};
const highPerformer: ReleaseRecord = {
  ...ELDERBROOK_CLOSED,
  id: "high-performer",
  track_name: "Over",
  locked_forecast_streams: 300_000,
};

const sorted = buildArchiveViewModel(
  [lowPerformer, ELDERBROOK_CLOSED, highPerformer],
  new Map([
    [
      "low-performer",
      ELDERBROOK_D1_D7.map((d) => ({ ...d, release_id: "low-performer" })),
    ],
    [ELDERBROOK_RELEASE_ID, ELDERBROOK_D1_D7],
    [
      "high-performer",
      ELDERBROOK_D1_D7.map((d) => ({ ...d, release_id: "high-performer" })),
    ],
  ]),
  { sort: "streams_delta_pct_desc" },
);

const order = sorted.rows.map((r) => r.trackName);
if (order[0] !== "Under" || order[2] !== "Is It Over Now?") {
  throw new Error(`Unexpected sort order: ${order.join(", ")}`);
}
console.log(`PASS: sort order = ${order.join(" > ")}`);
