/**
 * End-to-end parity: forecast + curve outputs from the DB active model must
 * equal outputs from the constants.ts fallback, across weekdays and tiers.
 *
 * Run: npx tsx scripts/validate-active-model-e2e-parity.ts
 * Requires SUPABASE_SERVICE_ROLE_KEY (+ NEXT_PUBLIC_SUPABASE_URL).
 */

import {
  algoPositioningBand,
  artistTierFromMonthlyListeners,
  composeStreamCurvePct,
  computeLockedForecast,
  expectedStreamsOnDay,
  type AdRates,
  type ForecastCoefficients,
  type RegressionModel,
  type ReleaseForecastInputs,
  type ReleaseType,
} from "@/lib/forecast";
import {
  clearActiveModelCache,
  loadActiveModel,
} from "@/lib/load-active-model";
import {
  buildFallbackActiveModel,
  type ActiveModel,
} from "@/lib/model/active-model";
import { formatActiveModelSource } from "@/lib/model/forecast-model";

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
      house: 0,
      dubstep: 0,
      "melodic-bass": 0,
      downtempo: 0,
      "big-room": 0,
    },
  },
};

const STUB_AD_RATES: AdRates = {
  spotify_rates: {
    single: {
      marquee: { developing: 0.04, mid: 0.22, established: 0.2 },
      showcase: { developing: 0.04, mid: 0.22, established: 0.2 },
    },
    ep: {
      marquee: { developing: 0.04, mid: 0.22, established: 0.2 },
      showcase: { developing: 0.04, mid: 0.22, established: 0.2 },
    },
    album: {
      marquee: { developing: 0.04, mid: 0.22, established: 0.2 },
      showcase: { developing: 0.04, mid: 0.22, established: 0.2 },
    },
  },
};

/** One ISO date per weekday in a single week (Mon…Sun). */
const WEEKDAY_RELEASE_DATES = [
  "2026-05-25", // Mon
  "2026-05-26", // Tue
  "2026-05-27", // Wed
  "2026-05-28", // Thu
  "2026-05-29", // Fri
  "2026-05-30", // Sat
  "2026-05-31", // Sun
] as const;

const TIER_MLS = [
  { label: "developing", ml: 100_000 },
  { label: "mid", ml: 750_000 },
  { label: "established", ml: 3_000_000 },
] as const;

const RELEASE_TYPES: ReleaseType[] = [
  "single",
  "focus_track",
  "album_track",
  "alternate_version",
];

function baseInputs(
  monthlyListeners: number,
  releaseType: ReleaseType = "single",
): ReleaseForecastInputs {
  return {
    monthlyListeners,
    isFeature: false,
    editorialTier: 2,
    genre: "house",
    releaseType,
    spotifyFormat: "marquee",
    metaSpendPlanned: 500,
    metaObjective: "traffic",
    spotifySpendPlanned: 200,
  };
}

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function assertEqual(path: string, expected: unknown, actual: unknown): void {
  if (!deepEqual(expected, actual)) {
    throw new Error(
      `Mismatch at ${path}\n  constants: ${JSON.stringify(expected)}\n  db:        ${JSON.stringify(actual)}`,
    );
  }
}

function runParitySuite(dbModel: ActiveModel, constantsModel: ActiveModel): number {
  let checks = 0;

  for (const releaseDate of WEEKDAY_RELEASE_DATES) {
    const curveDb = composeStreamCurvePct(dbModel, { releaseDate });
    const curveConst = composeStreamCurvePct(constantsModel, { releaseDate });
    assertEqual(`composeStreamCurvePct(${releaseDate})`, curveConst, curveDb);
    checks += 1;

    for (const day of [1, 2, 7, 14, 28] as const) {
      const expDb = expectedStreamsOnDay(dbModel, 100_000, day, { releaseDate });
      const expConst = expectedStreamsOnDay(constantsModel, 100_000, day, {
        releaseDate,
      });
      assertEqual(
        `expectedStreamsOnDay(${releaseDate},d${day})`,
        expConst,
        expDb,
      );
      checks += 1;
    }
  }

  for (const { label, ml } of TIER_MLS) {
    const tierDb = artistTierFromMonthlyListeners(
      ml,
      dbModel.config.tierMlThresholds,
    );
    const tierConst = artistTierFromMonthlyListeners(
      ml,
      constantsModel.config.tierMlThresholds,
    );
    assertEqual(`artistTier(${label})`, tierConst, tierDb);
    assert(tierDb === label, `tier label for ml=${ml} expected ${label}, got ${tierDb}`);
    checks += 1;

    for (const saves of [1_000, 10_000, 50_000] as const) {
      const algoDb = algoPositioningBand(saves, tierDb, dbModel.saveCountBands);
      const algoConst = algoPositioningBand(
        saves,
        tierConst,
        constantsModel.saveCountBands,
      );
      assertEqual(`algoPositioning(${label},saves=${saves})`, algoConst, algoDb);
      checks += 1;
    }

    for (const releaseType of RELEASE_TYPES) {
      for (const releaseDate of [
        WEEKDAY_RELEASE_DATES[0],
        WEEKDAY_RELEASE_DATES[3],
        WEEKDAY_RELEASE_DATES[4],
      ] as const) {
        const inputs = baseInputs(ml, releaseType);
        const lockedDb = computeLockedForecast(
          inputs,
          STUB_COEFFICIENTS,
          STUB_AD_RATES,
          dbModel,
          { releaseDate },
        );
        const lockedConst = computeLockedForecast(
          inputs,
          STUB_COEFFICIENTS,
          STUB_AD_RATES,
          constantsModel,
          { releaseDate },
        );
        assertEqual(
          `locked.streams(${label},${releaseType},${releaseDate})`,
          lockedConst.streams.week1Streams,
          lockedDb.streams.week1Streams,
        );
        assertEqual(
          `locked.saves(${label},${releaseType},${releaseDate})`,
          lockedConst.saves.week1Saves,
          lockedDb.saves.week1Saves,
        );
        assertEqual(
          `locked.curve(${label},${releaseType},${releaseDate})`,
          lockedConst.streamCurve.dailyPct,
          lockedDb.streamCurve.dailyPct,
        );
        assertEqual(
          `locked.algo(${label},${releaseType},${releaseDate})`,
          lockedConst.algoPositioning,
          lockedDb.algoPositioning,
        );
        checks += 4;
      }
    }
  }

  return checks;
}

async function main(): Promise<number> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
  }

  clearActiveModelCache();
  const dbModel = await loadActiveModel();
  const constantsModel = buildFallbackActiveModel();

  console.log(`DB model source: ${formatActiveModelSource(dbModel)}`);
  assert(
    dbModel.source === "db",
    `Expected DB model, got source=${dbModel.source} (would make e2e parity tautological)`,
  );

  const checks = runParitySuite(dbModel, constantsModel);
  console.log(
    `PASS: e2e forecast/curve parity — ${checks} assertions across 7 weekdays × 3 tiers`,
  );
  console.log("\nAll end-to-end parity checks passed.");
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
