/**
 * Regression: mapping → gap-fill → write payload for a partner Spotify CSV.
 *
 * Repro shape:
 *  - rows 1–2: converted_listeners + attributed_streams from mapped columns
 *  - row 3: accepted benchmark for attributed_streams
 *  - row 4: skipped
 * Write must persist rows 1–3 and exclude row 4; display numbering stays 1-based
 * on source_row_index.
 *
 *   npx tsx scripts/validate-ad-upload-write-path.ts
 */

import { applyMapping } from "@/lib/ad-upload/apply-mapping";
import type { ParsedTable } from "@/lib/ad-upload/canonical";
import {
  applyGapFill,
  computeGapNeeds,
  normalizeGapDecisions,
} from "@/lib/ad-upload/gap-fill";
import { toSpotifyRow } from "@/lib/ad-upload/upsert";
import { SEED_AD_MODEL } from "@/lib/model/ad-model";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

function main(): void {
  const table: ParsedTable = {
    headers: [
      "Campaign",
      "Spend",
      "New Listeners",
      "Plays",
    ],
    rows: [
      ["Camp A", "100", "200", "500"],
      ["Camp B", "120", "220", "550"],
      ["Camp C", "140", "240", ""], // streams missing → benchmark
      ["Camp D", "160", "260", ""], // skip
    ],
    sourceKind: "csv",
    warnings: [],
  };

  const mapped = applyMapping(
    table,
    {
      Campaign: "campaign_name",
      Spend: "spend",
      "New Listeners": "converted_listeners",
      Plays: "attributed_streams",
    },
    {
      partnerLabel: "Partner X",
      platform: "spotify",
      format: "marquee",
      objective: null,
      artist: "Test Artist",
      releaseKey: "test release",
    },
  );

  assert(mapped[0]!.converted_listeners === 200, "row1 listeners mapped");
  assert(mapped[0]!.attributed_streams === 500, "row1 streams mapped");
  assert(mapped[1]!.attributed_streams === 550, "row2 streams mapped");
  assert(mapped[2]!.attributed_streams == null, "row3 streams empty");

  const gaps = computeGapNeeds(
    mapped,
    "spotify",
    SEED_AD_MODEL,
    "Test Artist",
    "house",
  );
  assert(gaps.length === 2, `expected 2 gaps, got ${gaps.length}`);
  assert(gaps[0]!.displayRow === 3 && gaps[0]!.rowIndex === 2, "gap row 3");
  assert(gaps[1]!.displayRow === 4 && gaps[1]!.rowIndex === 3, "gap row 4");
  assert(
    gaps[0]!.missing.includes("attributed_streams"),
    "row3 needs streams",
  );

  const bench = gaps[0]!.benchmarks.attributed_streams!.value;
  // Simulate Server Action JSON key stringification.
  const decisions = normalizeGapDecisions({
    "2": [{ type: "benchmark", field: "attributed_streams", value: bench }],
    "3": [{ type: "skip" }],
  });

  const resolved = applyGapFill(mapped, "spotify", decisions);
  assert(resolved[2]!.attributed_streams === bench, "benchmark merged");
  assert(
    resolved[2]!.derived_fields.includes("attributed_streams"),
    "derived tag",
  );
  assert(resolved[3]!.skipped === true, "row4 skipped");
  assert(resolved[0]!.usable_for_modeling, "row1 usable");
  assert(resolved[1]!.usable_for_modeling, "row2 usable");
  assert(resolved[2]!.usable_for_modeling, "row3 usable after benchmark");

  const writeable = [];
  const errors = [];
  for (const row of resolved) {
    if (row.skipped) continue;
    const mappedRow = toSpotifyRow(row, "Partner X");
    if (mappedRow.error) {
      errors.push(`Row ${row.source_row_index + 1}: ${mappedRow.error}`);
      continue;
    }
    writeable.push(mappedRow.row);
  }

  assert(errors.length === 0, `write errors: ${errors.join("; ")}`);
  assert(writeable.length === 3, `expected 3 writeable rows, got ${writeable.length}`);
  assert(
    writeable.every((r) => r && r.format === "marquee"),
    "format from file constant",
  );
  const w0 = writeable[0]!;
  const w2 = writeable[2]!;
  assert(
    Number(w0.converted_listeners) === 200 &&
      Number(w0.est_attributed_streams) === 500,
    "row1 mapped values reach write payload",
  );
  assert(
    Number(w2.est_attributed_streams) === bench,
    "row3 benchmark reaches write payload",
  );
  assert(
    !("attributed_streams" in w0) && "est_attributed_streams" in w0,
    "DB payload uses est_attributed_streams, not attributed_streams",
  );
  assert("spend_usd" in w0 && !("spend" in w0), "DB payload uses spend_usd");

  // DB-alias mapping target still lands on canonical → est_attributed_streams.
  const aliasMapped = applyMapping(
    {
      headers: ["est_attributed_streams", "spend_usd", "converted_listeners"],
      rows: [["900", "50", "100"]],
      sourceKind: "csv",
      warnings: [],
    },
    {
      est_attributed_streams: "est_attributed_streams" as unknown as "attributed_streams",
      spend_usd: "spend_usd" as unknown as "spend",
      converted_listeners: "converted_listeners",
    },
    {
      partnerLabel: "Alias",
      platform: "spotify",
      format: "marquee",
      objective: null,
      artist: "A",
      releaseKey: "r",
    },
  );
  assert(aliasMapped[0]!.attributed_streams === 900, "alias→canonical streams");
  assert(aliasMapped[0]!.spend === 50, "alias→canonical spend");
  const aliasWrite = toSpotifyRow(
    {
      ...aliasMapped[0]!,
      usable_for_modeling: true,
    },
    "Alias",
  );
  assert(!aliasWrite.error, "alias row writeable");
  assert(
    Number(aliasWrite.row!.est_attributed_streams) === 900,
    "alias streams written to est_attributed_streams",
  );

  console.log("PASS: ad-upload write path (mapping + gap-fill → upsert payload)");
}

main();
