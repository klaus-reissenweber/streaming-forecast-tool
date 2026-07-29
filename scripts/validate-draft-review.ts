/**
 * Validate Phase 2b draft review / new_beats_live margin.
 *
 *   npx tsx --env-file=.env.local scripts/validate-draft-review.ts
 */

import { FORWARD_BIAS_MIN_IMPROVEMENT } from "../lib/constants";
import { loadActiveModel } from "../lib/load-active-model";
import { loadDraftModelById } from "../lib/load-draft-model";
import {
  beatsLiveBias,
  buildDraftReview,
  parseRawGuardrails,
} from "../lib/model/draft-review";

const NO_IMPROVEMENT_DRAFTS = [
  "449be5a8-17a8-4fb2-8e43-0d6816052631",
  "883cdd33-857d-43fe-8c4c-98205ce7b70e",
] as const;

async function assertDraftFailsNewBeats(draftId: string) {
  const [draft, active] = await Promise.all([
    loadDraftModelById(draftId),
    loadActiveModel(),
  ]);
  if (!draft) {
    throw new Error(`Draft not found: ${draftId}`);
  }
  const review = buildDraftReview(
    {
      ...draft,
      rawGuardrails: parseRawGuardrails(draft.rawMetadata),
    },
    active,
  );
  const beats = review.hard.find((c) => c.id === "new_beats_live");
  console.log(
    JSON.stringify(
      {
        draftId: draftId.slice(0, 8),
        new_beats_live: {
          passed: beats?.passed,
          value: beats?.value,
          detail: beats?.detail ?? null,
        },
      },
      null,
      2,
    ),
  );
  if (beats?.passed) {
    throw new Error(`${draftId.slice(0, 8)}: expected new_beats_live FAIL`);
  }
}

function assertRetrain2StylePasses() {
  // Retrain #2 shape: new −11% vs live +28.9% on all/clean.
  const cases = [
    { live: 0.289, neu: -0.11 },
    { live: 0.289, neu: -0.11 },
  ];
  for (const { live, neu } of cases) {
    const ok = beatsLiveBias(neu, live);
    const delta = Math.abs(live) - Math.abs(neu);
    console.log(
      `retrain#2-style: live=${live} new=${neu} Δ|bias|=${delta.toFixed(3)} min=${FORWARD_BIAS_MIN_IMPROVEMENT} → ${ok ? "PASS" : "FAIL"}`,
    );
    if (!ok) {
      throw new Error("Expected retrain#2-style improvement to PASS");
    }
  }
  // Float-noise no-op must FAIL.
  if (beatsLiveBias(-0.03504316482215536, -0.035043164822157157)) {
    throw new Error("Expected float-noise no-op to FAIL");
  }
  console.log("float-noise no-op → FAIL (ok)");
}

async function main() {
  for (const draftId of NO_IMPROVEMENT_DRAFTS) {
    await assertDraftFailsNewBeats(draftId);
  }
  assertRetrain2StylePasses();
  console.log(
    `OK: both no-op drafts fail new_beats_live; retrain#2 margin passes (min=${FORWARD_BIAS_MIN_IMPROVEMENT})`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
