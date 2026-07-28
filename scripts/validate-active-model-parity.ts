/**
 * Parity: loadActiveModel / seed payload / fallback match lib/constants.ts.
 *
 * Run: npx tsx scripts/validate-active-model-parity.ts
 * Requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (same as runtime).
 */

import {
  buildFallbackActiveModel,
  collectConstantsParityMismatches,
  parseActiveModelPayload,
  type ActiveModel,
} from "@/lib/model/active-model";
import {
  clearActiveModelCache,
  loadActiveModel,
} from "@/lib/load-active-model";
import liveSeed from "@/seed/live-model-version.json";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function reportParity(label: string, model: ActiveModel): void {
  const mismatches = collectConstantsParityMismatches(model);
  if (mismatches.length > 0) {
    console.error(`FAIL: ${label}`);
    for (const m of mismatches) {
      console.error(`  ${m.path}`);
      console.error(`    expected: ${JSON.stringify(m.expected)}`);
      console.error(`    actual:   ${JSON.stringify(m.actual)}`);
    }
    throw new Error(`${label}: ${mismatches.length} constant parity mismatch(es)`);
  }
  console.log(`PASS: ${label} — all constants.ts parameters identical`);
}

async function main(): Promise<number> {
  // 1) Seed JSON parses and matches constants
  const fromSeed = {
    id: "seed",
    fittedAt: liveSeed.fitted_at,
    activatedAt: liveSeed.activated_at,
    source: "db" as const,
    ...parseActiveModelPayload(liveSeed.payload),
    metadata: null,
  };
  reportParity("seed/live-model-version.json payload", fromSeed);

  // 2) Fallback (constants-backed) matches constants
  const fallback = buildFallbackActiveModel();
  reportParity("buildFallbackActiveModel()", fallback);

  // 3) streams_d0 seed equals fallback (live promote coeffs)
  assert(
    JSON.stringify(fromSeed.streamsD0) === JSON.stringify(fallback.streamsD0),
    "seed streams_d0 !== fallback streams_d0",
  );
  console.log("PASS: streams_d0 seed ↔ fallback identical");

  // 4) Real runtime path: loadActiveModel via service-role client
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      "Missing SUPABASE_SERVICE_ROLE_KEY — required for loadActiveModel() parity",
    );
  }
  clearActiveModelCache();
  const fromRuntime = await loadActiveModel();
  assert(
    fromRuntime.source === "db",
    `loadActiveModel() source=${fromRuntime.source} (expected db; check seed + service role)`,
  );
  reportParity("loadActiveModel() [service-role]", fromRuntime);
  console.log(
    `DB row id=${fromRuntime.id} fitted_at=${fromRuntime.fittedAt} activated_at=${fromRuntime.activatedAt}`,
  );

  console.log("\nAll parity checks passed.");
  return 0;
}

main()
  .then((code) => {
    process.exit(code);
  })
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
