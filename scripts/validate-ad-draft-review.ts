/**
 * Unit checks for ad_model approve diffs + soft guardrails.
 *
 *   npx tsx scripts/validate-ad-draft-review.ts
 */

import { SEED_AD_MODEL, type AdModel } from "@/lib/model/ad-model";
import {
  buildAdModelDiff,
  evaluateAdModelBands,
  evaluateAdModelLargeMove,
  evaluateAdModelSampleSize,
} from "@/lib/model/draft-review";
import type { ActiveModel } from "@/lib/model/active-model";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

function stubActive(ad: AdModel): ActiveModel {
  return { adModel: ad } as ActiveModel;
}

function main(): void {
  const active = {
    ...SEED_AD_MODEL,
    sampleSizes: {
      ...SEED_AD_MODEL.sampleSizes,
      cplMarquee: 20,
      cplShowcase: 20,
      metaCpc: 14,
      metaSpotifyClickShare: 10,
      metaAwareness: 168,
      spotifyUsable: 40,
      splArtists: 12,
    },
  };

  const draftOk: AdModel = {
    ...active,
    spotifyCpl: { marquee: 0.5, showcase: 0.36 },
    metaFunnel: { ...active.metaFunnel, cpc: 0.43 },
  };

  const diff = buildAdModelDiff(draftOk, active);
  assert(
    diff.some((r) => r.label === "spotify_cpl.marquee" && Math.abs(r.delta - 0.01) < 1e-9),
    "cpl.marquee delta",
  );
  assert(
    diff.some(
      (r) =>
        r.label === "meta_funnel.streams_per_spotify_click_base" &&
        r.draft === 1.0,
    ),
    "base stays 1.0 in diff",
  );

  const bands = evaluateAdModelBands(stubActive(draftOk));
  assert(bands.passed, `bands should pass: ${bands.value}`);

  const samples = evaluateAdModelSampleSize(stubActive(draftOk));
  assert(samples.passed, `samples should pass: ${samples.value}`);

  const thin: AdModel = {
    ...draftOk,
    sampleSizes: { ...draftOk.sampleSizes, cplMarquee: 2, metaCpc: 1 },
  };
  const thinCheck = evaluateAdModelSampleSize(stubActive(thin));
  assert(!thinCheck.passed, "thin samples should warn");
  assert(thinCheck.value.includes("lean on prior"), "thin detail");

  const badCpl: AdModel = {
    ...draftOk,
    spotifyCpl: { marquee: 9, showcase: 0.35 },
  };
  assert(!evaluateAdModelBands(stubActive(badCpl)).passed, "cpl out of band");

  const badSpl: AdModel = {
    ...draftOk,
    spotifySplGlobal: 0.5,
  };
  assert(!evaluateAdModelBands(stubActive(badSpl)).passed, "spl < 1");

  const moved: AdModel = {
    ...draftOk,
    metaFunnel: { ...draftOk.metaFunnel, cpc: draftOk.metaFunnel.cpc * 2 },
  };
  const moveDiff = buildAdModelDiff(moved, draftOk);
  const moveCheck = evaluateAdModelLargeMove(
    stubActive(moved),
    stubActive(draftOk),
    {
      dow: [],
      editorialKernel: [],
      trendMedian: [],
      trendP25: [],
      trendP75: [],
      releaseTypeMagnitude: [],
      saveRateBands: [],
      saveCountBands: [],
      adModel: moveDiff,
    },
  );
  assert(!moveCheck.passed, "large cpc move should warn");

  console.log("PASS: ad draft-review diffs + soft guardrails");
}

main();
