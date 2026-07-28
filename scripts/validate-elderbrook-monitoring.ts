import {
  ELDERBROOK_D1_D7,
  ELDERBROOK_LOCKED_SAVES,
  ELDERBROOK_LOCKED_STREAMS,
  ELDERBROOK_MONTHLY_LISTENERS,
  ELDERBROOK_RELEASE_ID,
} from "@/lib/fixtures/elderbrook-monitoring";
import { computeFlags } from "@/lib/flags";
import { composeStreamCurvePct } from "@/lib/forecast";
import { buildFallbackActiveModel } from "@/lib/model/active-model";
import { computeHealthSummary, computeMonitoringSummary } from "@/lib/monitoring";
import type { DailyDataPoint, ReleaseRecord } from "@/lib/map-release-row";

const MODEL = buildFallbackActiveModel();
const LOCKED_STREAMS = ELDERBROOK_LOCKED_STREAMS;
/** Thursday release — matches closed Elderbrook calibration. */
const ELDERBROOK_RELEASE_DATE = "2026-05-28";
const THURSDAY_CURVE = composeStreamCurvePct(MODEL, {
  releaseDate: ELDERBROOK_RELEASE_DATE,
});

function scaleStreams(
  rows: DailyDataPoint[],
  factor: number,
): DailyDataPoint[] {
  return rows.map((row) => ({
    ...row,
    streams: Math.round(row.streams * factor),
  }));
}

interface HealthExpectation {
  label: string;
  status: "on-track" | "outperforming" | "lagging";
  deltaPctMin: number;
  deltaPctMax: number;
}

function assertHealthCase(
  rows: DailyDataPoint[],
  { label, status, deltaPctMin, deltaPctMax }: HealthExpectation,
): void {
  const actuals = rows.reduce<Partial<Record<number, number>>>((acc, row) => {
    acc[row.day_number] = row.streams;
    return acc;
  }, {});

  const health = computeHealthSummary(
    { streamsByDay: actuals },
    LOCKED_STREAMS,
    THURSDAY_CURVE,
  );

  const statusOk = health.status === status;
  const deltaOk =
    health.deltaPct >= deltaPctMin && health.deltaPct <= deltaPctMax;

  console.log(`\n=== ${label} ===`);
  console.log(
    JSON.stringify(
      {
        status: health.status,
        deltaPct: Number(health.deltaPct.toFixed(1)),
        projectedWk1: health.projectedWk1,
        lockedWk1: health.lockedWk1,
      },
      null,
      2,
    ),
  );

  if (!statusOk) {
    throw new Error(
      `${label}: expected status "${status}", got "${health.status}"`,
    );
  }
  if (!deltaOk) {
    throw new Error(
      `${label}: expected deltaPct in [${deltaPctMin}, ${deltaPctMax}], got ${health.deltaPct.toFixed(1)}`,
    );
  }

  console.log(`PASS: ${label}`);
}

console.log("Health classification validation (3 cases)");

assertHealthCase(ELDERBROOK_D1_D7, {
  label: "Elderbrook D1–D7 (real)",
  status: "on-track",
  deltaPctMin: -10,
  deltaPctMax: 10,
});

assertHealthCase(scaleStreams(ELDERBROOK_D1_D7, 1.3), {
  label: "Scaled +30% → outperforming",
  status: "outperforming",
  deltaPctMin: 10,
  deltaPctMax: 100,
});

assertHealthCase(scaleStreams(ELDERBROOK_D1_D7, 0.7), {
  label: "Scaled −30% → lagging",
  status: "lagging",
  deltaPctMin: -100,
  deltaPctMax: -10,
});

console.log("\nAll health cases passed.");

const elderbrookRelease: ReleaseRecord = {
  id: ELDERBROOK_RELEASE_ID,
  track_name: "Is It Over Now?",
  artist_name: "Elderbrook",
  genre: "house",
  monthly_listeners: ELDERBROOK_MONTHLY_LISTENERS,
  monthly_listeners_at_release: ELDERBROOK_MONTHLY_LISTENERS,
  is_feature: false,
  editorial_tier: 2,
  release_date: ELDERBROOK_RELEASE_DATE,
  release_type: "single",
  spotify_format: "marquee",
  meta_spend_planned: 0,
  meta_objective: "traffic",
  spotify_spend_planned: 0,
  locked_forecast_streams: LOCKED_STREAMS,
  locked_forecast_saves: ELDERBROOK_LOCKED_SAVES,
  model_version_used: "fixture",
  status: "active",
  created_at: "2026-05-28T00:00:00.000Z",
  closed_at: null,
};

const elderbrookInputs = {
  monthlyListeners: ELDERBROOK_MONTHLY_LISTENERS,
  isFeature: false,
  editorialTier: 2 as const,
  genre: "house" as const,
  releaseType: "single" as const,
  spotifyFormat: "marquee" as const,
  metaSpendPlanned: 0,
  metaObjective: "traffic" as const,
  spotifySpendPlanned: 0,
};

const locked = {
  streams: LOCKED_STREAMS,
  saves: ELDERBROOK_LOCKED_SAVES,
};

const monitoring = computeMonitoringSummary(
  elderbrookRelease,
  elderbrookInputs,
  ELDERBROOK_D1_D7,
  locked,
  MODEL,
);

const flags = computeFlags({
  release: elderbrookRelease,
  inputs: elderbrookInputs,
  dailyData: ELDERBROOK_D1_D7,
  locked,
  model: MODEL,
  monitoring,
  tier: "established",
});

console.log("\n=== Elderbrook flags ===");
for (const flag of flags) {
  console.log(`  [${flag.type}] ${flag.id}: ${flag.title}`);
}

const flagIds = new Set(flags.map((f) => f.id));
// d1-editorial-spike was calibrated to the old sliver-day curve (0.5% d1).
// Under day-1=release_date + Thursday editorial at d2, D1 ≈ curve expectation —
// spike flag should NOT fire. Keep other Elderbrook flag expectations.
const requiredFlags = ["save-rate-low", "save-velocity-drop"];
const missing = requiredFlags.filter((id) => !flagIds.has(id));
if (missing.length > 0) {
  throw new Error(
    `Elderbrook flags: expected ${missing.join(", ")} to fire, got: ${[...flagIds].join(", ")}`,
  );
}

if (flagIds.has("save-velocity-low")) {
  throw new Error(
    "Elderbrook: save-velocity-low should not fire (projected saves above p25×0.8 floor)",
  );
}

if (flagIds.has("d1-editorial-spike") || flagIds.has("d1-spike")) {
  throw new Error(
    "Elderbrook: d1 spike flags should not fire under weekday-aware curve (editorial is d2 for Thursday)",
  );
}

console.log("\nElderbrook flags validation passed.");
console.log("  save-rate-low: yes");
console.log("  save-velocity-drop: yes");
console.log("  d1-editorial-spike: correctly absent (weekday-aware d1)");
console.log("  save-velocity-low: correctly absent");
