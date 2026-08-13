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
import {
  manualDraftsToCanonicalRows,
  emptyManualDraft,
} from "@/lib/ad-upload/manual-rows";
import { parseCsvBuffer } from "@/lib/ad-upload/parse-tabular";
import { heuristicColumnMappings } from "@/lib/ad-upload/propose-mapping";
import { toSpotifyRow } from "@/lib/ad-upload/upsert";
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

  // Write gate: spend + identity only — no gap when those are present.
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
  assert(gaps.length === 0, "no write-blocking gaps when spend+identity present");

  // Completeness gate: still needs attributed_streams for usable_for_modeling.
  const incomplete = applyGapFill(spotifyRows, "spotify", {});
  assert(!incomplete[0]!.usable_for_modeling, "not usable without streams");

  const filled = applyGapFill(spotifyRows, "spotify", {
    0: [
      {
        type: "manual",
        field: "attributed_streams",
        value: 2650,
      },
    ],
  });
  assert(filled[0]!.usable_for_modeling, "usable after streams filled");
  assert(filled[0]!.attributed_streams === 2650, "streams applied");

  // UTF-16 LE tab-delimited Meta-style export
  const utf16 = Buffer.from(
    "\ufeffAmount spent\tImpressions\tLink clicks\n12.50\t1000\t40\n",
    "utf16le",
  );
  const parsed = parseCsvBuffer(utf16);
  assert(parsed.headers.includes("Amount spent"), "utf16 header decoded");
  assert(parsed.headers.includes("Link clicks"), "utf16 clicks header");
  assert(parsed.rows.length === 1, "utf16 one data row");
  assert(parsed.rows[0]![0] === "12.50", "utf16 spend cell");
  assert(
    parsed.warnings.some((w) => /tab-delimited/i.test(w)),
    "tab delimiter warning",
  );

  const linkfireHeaders = heuristicColumnMappings([
    "Amount spent",
    "Linkfire visits",
    "Spotify clicks",
  ]);
  assert(linkfireHeaders["Linkfire visits"] === "linkfire_visits", "lf visits");
  assert(
    linkfireHeaders["Spotify clicks"] === "linkfire_spotify_clicks",
    "lf spotify clicks",
  );

  // Manual entry → same canonical / gap-fill / upsert payload path.
  const manualMeta = manualDraftsToCanonicalRows({
    platform: "meta",
    drafts: [
      {
        ...emptyManualDraft(),
        campaign_name: "Traffic A",
        spend: "250",
        impressions: "10000",
        clicks: "400",
        streams: "1800",
        linkfire_spotify_clicks: "220",
      },
    ],
    artist: "Artist",
    releaseKey: "track a",
    objective: "traffic",
  });
  const metaFilled = applyGapFill(manualMeta, "meta", {});
  assert(metaFilled[0]!.spend === 250, "manual meta spend");
  assert(metaFilled[0]!.attributed_streams === 1800, "manual meta streams");
  assert(metaFilled[0]!.linkfire_spotify_clicks === 220, "manual lf clicks");
  assert(metaFilled[0]!.usable_for_modeling, "manual meta usable with clicks");

  const manualSpotify = manualDraftsToCanonicalRows({
    platform: "spotify",
    drafts: [
      {
        ...emptyManualDraft(),
        campaign_name: "Marquee A",
        format: "marquee",
        spend: "100",
        reach: "50000",
        clicks: "1200",
        converted_listeners: "400",
        est_attributed_streams: "500",
        saves: "80",
        start_date: "2026-08-01",
        end_date: "2026-08-07",
      },
    ],
    artist: "LSDREAM",
    releaseKey: "track",
  });
  assert(
    manualSpotify[0]!.attributed_streams === 500,
    "est_attributed_streams → canonical attributed_streams",
  );
  assert(manualSpotify[0]!.reach === 50000, "manual spotify reach");
  assert(manualSpotify[0]!.saves === 80, "manual spotify saves");
  assert(manualSpotify[0]!.start_date === "2026-08-01", "manual start_date");
  assert(manualSpotify[0]!.end_date === "2026-08-07", "manual end_date");
  const spotifyFilled = applyGapFill(manualSpotify, "spotify", {});
  assert(spotifyFilled[0]!.usable_for_modeling, "complete spotify usable");
  const write = toSpotifyRow(spotifyFilled[0]!, "Manual entry");
  assert(!write.error, "manual spotify writeable with spend+format");
  assert(
    Number(write.row!.est_attributed_streams) === 500,
    "manual write uses est_attributed_streams DB column",
  );
  assert(Number(write.row!.saves) === 80, "manual write includes saves");
  assert(write.row!.start_date === "2026-08-01", "write start_date column");
  assert(write.row!.end_date === "2026-08-07", "write end_date column");
  assert(
    write.row!.est_attributed_streams != null &&
      write.row!.streams_per_listener == null,
    "attributed streams not derived from streams_per_listener",
  );
  assert(write.row!.format === "marquee", "format preserved for uid,format key");

  console.log("PASS: ad-upload mapping + gap-fill");
}

main();

