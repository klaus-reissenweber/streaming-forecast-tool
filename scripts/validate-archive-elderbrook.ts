import { buildArchiveViewModel } from "@/lib/build-archive-view-model";
import { computeWeek1Actuals } from "@/lib/compute-week1-actuals";
import {
  ELDERBROOK_D1_D7,
  ELDERBROOK_LOCKED_SAVES,
  ELDERBROOK_LOCKED_STREAMS,
  ELDERBROOK_MONTHLY_LISTENERS,
} from "@/lib/fixtures/elderbrook-monitoring";
import type { ReleaseRecord } from "@/lib/map-release-row";

const ELDERBROOK_RELEASE_ID = "ae749c93-fa94-4bb5-b6d9-1845e961b8cd";

const ELDERBROOK_CLOSED: ReleaseRecord = {
  id: ELDERBROOK_RELEASE_ID,
  track_name: "Is It Over Now?",
  artist_name: "Elderbrook",
  genre: "house",
  monthly_listeners: ELDERBROOK_MONTHLY_LISTENERS,
  is_feature: false,
  editorial_tier: 2,
  release_date: "2026-01-01",
  release_type: "single",
  spotify_format: "marquee",
  meta_spend_planned: 0,
  meta_objective: "traffic",
  spotify_spend_planned: 0,
  locked_forecast_streams: ELDERBROOK_LOCKED_STREAMS,
  locked_forecast_saves: ELDERBROOK_LOCKED_SAVES,
  model_version_used: "fixture",
  status: "closed",
  created_at: "2026-01-01T00:00:00.000Z",
  closed_at: "2026-06-23T12:00:00.000Z",
};

console.log("=== computeWeek1Actuals (Elderbrook D1–D7) ===");
const wk1 = computeWeek1Actuals(ELDERBROOK_D1_D7);
console.log(JSON.stringify(wk1, null, 2));

if (wk1.streams !== 452_848) {
  throw new Error(`Expected wk1 streams 452,848, got ${wk1.streams}`);
}
if (wk1.saves !== 19_954) {
  throw new Error(`Expected wk1 saves 19,954, got ${wk1.saves}`);
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

if (row.actualStreams !== 452_848) {
  throw new Error(`Expected actualStreams 452,848, got ${row.actualStreams}`);
}
if (row.lockedStreams !== 450_251) {
  throw new Error(`Expected lockedStreams 450,251, got ${row.lockedStreams}`);
}

const deltaPct = row.streamsDeltaPct ?? 0;
if (deltaPct < 0.3 || deltaPct > 0.8) {
  throw new Error(
    `Expected streamsDeltaPct ~+0.5% (0.3–0.8), got ${deltaPct.toFixed(2)}%`,
  );
}
if (row.streamsDeltaTone !== "on_track") {
  throw new Error(
    `Expected streamsDeltaTone on_track at +${deltaPct.toFixed(1)}%, got ${row.streamsDeltaTone}`,
  );
}
if (row.saveRateVsBand !== "below") {
  throw new Error(`Expected saveRateVsBand below, got ${row.saveRateVsBand}`);
}
if (archive.summary.retrainEligible !== 1) {
  throw new Error(
    `Expected retrainEligible 1, got ${archive.summary.retrainEligible}`,
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
