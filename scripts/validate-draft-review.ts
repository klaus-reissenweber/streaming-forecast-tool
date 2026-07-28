/**
 * Validate Phase 2b draft review against a live draft id (default: 883cdd33…).
 *
 *   npx tsx --env-file=.env.local scripts/validate-draft-review.ts [draftId]
 */

import { loadActiveModel } from "../lib/load-active-model";
import { loadDraftModelById } from "../lib/load-draft-model";
import {
  buildDraftReview,
  parseRawGuardrails,
} from "../lib/model/draft-review";

const DEFAULT_DRAFT = "883cdd33-857d-43fe-8c4c-98205ce7b70e";

async function main() {
  const draftId = process.argv[2] ?? DEFAULT_DRAFT;
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

  console.log(
    JSON.stringify(
      {
        draftId,
        status: draft.status,
        activeId: active.id,
        allHardPassed: review.allHardPassed,
        hard: review.hard.map((c) => ({
          id: c.id,
          passed: c.passed,
          value: c.value,
          detail: c.detail ?? null,
        })),
        soft: review.soft.map((c) => ({
          id: c.id,
          passed: c.passed,
          value: c.value,
          detail: c.detail ?? null,
        })),
        diffIdentical:
          review.diff.dow.every((r) => Math.abs(r.delta) < 1e-9) &&
          review.diff.editorialKernel.every((r) => Math.abs(r.delta) < 1e-9),
        curves: review.curves.map((c) => ({
          label: c.label,
          draftWk1Sum: c.draftWk1Sum,
          activeWk1Sum: c.activeWk1Sum,
        })),
      },
      null,
      2,
    ),
  );

  const beats = review.hard.find((c) => c.id === "new_beats_live");
  const sample = review.soft.find((c) => c.id === "insufficient_sample");
  if (beats?.passed) {
    throw new Error("Expected new_beats_live to FAIL (no improvement)");
  }
  if (sample?.passed) {
    throw new Error("Expected insufficient_sample soft FAIL");
  }
  if (review.allHardPassed) {
    throw new Error("Expected allHardPassed=false (Activate blocked)");
  }
  console.log("OK: Activate blocked; soft insufficient_sample; diff+preview ready");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
