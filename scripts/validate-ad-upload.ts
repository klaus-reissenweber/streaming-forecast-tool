/**
 * Unit checks for ad-upload mapping + gap-fill (no DB).
 *
 *   npx tsx scripts/validate-ad-upload.ts
 */

import { applyMapping } from "@/lib/ad-upload/apply-mapping";
import type { ParsedTable } from "@/lib/ad-upload/canonical";
import {
  applyGapFill,
  computeGapNeeds,
} from "@/lib/ad-upload/gap-fill";
import { heuristicColumnMappings } from "@/lib/ad-upload/propose-mapping";
import { SEED_AD_MODEL } from "@/lib/model/ad-model";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

function main(): void {
  const headers = [
    "Amount spent",
    "Impressions",
    "Reach",
    "Link clicks",
    "Campaign name",
  ];
  const mappings = heuristicColumnMappings(headers);
  assert(mappings["Amount spent"] === "spend", "spend map");
  assert(mappings.Impressions === "impressions", "imps map");
  assert(mappings["Link clicks"] === "clicks", "clicks map");

  const table: ParsedTable = {
    headers,
    rows: [["100", "10000", "8000", "200", "Test Camp"]],
    sourceKind: "csv",
    warnings: [],
  };
  const rows = applyMapping(table, mappings, {
    partnerLabel: "Test Partner",
    platform: "meta",
    format: null,
    objective: "traffic",
    artist: "Artist",
    releaseKey: "test track",
  });
  assert(rows.length === 1, "one row");
  assert(rows[0]!.spend === 100, "spend");
  assert(rows[0]!.clicks === 200, "clicks");
  assert(rows[0]!.objective === "traffic", "objective constant");
  assert(rows[0]!.release_key === "test track", "release key constant");

  const spotifyTable: ParsedTable = {
    headers: ["spend", "converted_listeners"],
    rows: [["490", "1000"]],
    sourceKind: "csv",
    warnings: [],
  };
  const spotifyRows = applyMapping(
    spotifyTable,
    { spend: "spend", converted_listeners: "converted_listeners" },
    {
      partnerLabel: "Spotify Ads",
      platform: "spotify",
      format: "marquee",
      objective: null,
      artist: "LSDREAM",
      releaseKey: "track",
    },
  );
  const gaps = computeGapNeeds(
    spotifyRows,
    "spotify",
    SEED_AD_MODEL,
    "LSDREAM",
    "melodic-bass",
  );
  assert(gaps.length === 1, "gap for streams");
  assert(gaps[0]!.missing.includes("attributed_streams"), "need streams");
  assert(
    gaps[0]!.benchmarks.attributed_streams != null,
    "streams benchmark present",
  );

  const filled = applyGapFill(spotifyRows, "spotify", {
    0: [
      {
        type: "benchmark",
        field: "attributed_streams",
        value: gaps[0]!.benchmarks.attributed_streams!.value,
      },
    ],
  });
  assert(filled[0]!.usable_for_modeling, "usable after gap-fill");
  assert(
    filled[0]!.derived_fields.includes("attributed_streams"),
    "tagged derived",
  );

  console.log("PASS: ad-upload mapping + gap-fill");
}

main();
