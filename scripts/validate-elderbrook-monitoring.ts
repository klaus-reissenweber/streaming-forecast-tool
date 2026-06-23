import {
  ELDERBROOK_D1_D7,
  ELDERBROOK_LOCKED_SAVES,
  ELDERBROOK_LOCKED_STREAMS,
  ELDERBROOK_MONTHLY_LISTENERS,
} from "@/lib/fixtures/elderbrook-monitoring";
import { computeFlags } from "@/lib/flags";
import { computeHealthSummary, computeMonitoringSummary } from "@/lib/monitoring";
import type { DailyDataPoint, ReleaseRecord } from "@/lib/map-release-row";

const LOCKED_STREAMS = ELDERBROOK_LOCKED_STREAMS;

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
  const actuals = rows.reduce<
    Partial<Record<number, number>>
  >((acc, row) => {
    acc[row.day_number] = row.streams;
    return acc;
  }, {});

  const health = computeHealthSummary(
    { streamsByDay: actuals },
    LOCKED_STREAMS,
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
  deltaPctMin: 2,
  deltaPctMax: 5,
});

assertHealthCase(scaleStreams(ELDERBROOK_D1_D7, 1.3), {
  label: "Synthetic outperforming (×1.3 streams)",
  status: "outperforming",
  deltaPctMin: 32,
  deltaPctMax: 36,
});

assertHealthCase(scaleStreams(ELDERBROOK_D1_D7, 0.7), {
  label: "Synthetic lagging (×0.7 streams)",
  status: "lagging",
  deltaPctMin: -30,
  deltaPctMax: -26,
});

console.log("\nAll health cases passed.");

const elderbrookRelease: ReleaseRecord = {
  id: "ae749c93-fa94-4bb5-b6d9-1845e961b8cd",
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
  locked_forecast_streams: LOCKED_STREAMS,
  locked_forecast_saves: ELDERBROOK_LOCKED_SAVES,
  model_version_used: "fixture",
  status: "active",
  created_at: "2026-01-01T00:00:00.000Z",
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
);

const flags = computeFlags({
  release: elderbrookRelease,
  inputs: elderbrookInputs,
  dailyData: ELDERBROOK_D1_D7,
  locked,
  monitoring,
  tier: "established",
});

console.log("\n=== Elderbrook flags ===");
for (const flag of flags) {
  console.log(`  [${flag.type}] ${flag.id}: ${flag.title}`);
}

const flagIds = new Set(flags.map((f) => f.id));
const requiredFlags = [
  "save-rate-low",
  "save-velocity-drop",
  "d1-editorial-spike",
];
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

console.log("\nElderbrook flags validation passed.");
console.log("  save-rate-low: yes (4.4% vs house 9–16%)");
console.log("  save-velocity-drop: yes (D6–D7 vs D4–D5 decline)");
console.log("  d1-editorial-spike: yes (12.5× D1 vs curve)");
console.log("  save-velocity-low: correctly absent (20,487 > 15,230 floor)");
