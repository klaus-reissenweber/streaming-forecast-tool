/**
 * Print the ad-model values the release UI actually reads via loadActiveModel().
 *   npx tsx --env-file=.env.local --env-file=retrain/.env.local scripts/print-ad-ui-params.ts
 */
import {
  adSpendPlanFromRelease,
  computeAdAttributedTotals,
  computeAdMetaFunnelDisplay,
} from "@/lib/ad-forecast";
import { clearActiveModelCache, loadActiveModel } from "@/lib/load-active-model";
import type { Genre } from "@/lib/forecast";

const TEST_ARTIST = process.argv[2] ?? "LSDREAM";
const TEST_GENRE = (process.argv[3] ?? "melodic-bass") as Genre;
const META_SPEND = Number(process.argv[4] ?? 1000);
const MARQUEE_SPEND = Number(process.argv[5] ?? 500);
const SHOWCASE_SPEND = Number(process.argv[6] ?? 700);

async function main() {
  clearActiveModelCache();
  const model = await loadActiveModel();
  const ad = model.adModel;

  const plan = adSpendPlanFromRelease({
    artist_name: TEST_ARTIST,
    genre: TEST_GENRE,
    spotify_format: "marquee",
    spotify_spend_planned: 0,
    meta_spend_planned: META_SPEND,
    meta_objective: "traffic",
    meta_traffic_spend_planned: META_SPEND,
    meta_awareness_spend_planned: 0,
    spotify_marquee_spend_planned: MARQUEE_SPEND,
    spotify_showcase_spend_planned: SHOWCASE_SPEND,
    campaign_start_offset_days: 0,
    campaign_duration_days: 14,
  });
  const totals = computeAdAttributedTotals(plan, ad);
  const funnel = computeAdMetaFunnelDisplay(
    META_SPEND,
    TEST_ARTIST,
    TEST_GENRE,
    ad,
  );

  console.log("=== UI ad params (loadActiveModel().adModel) ===");
  console.log(`  model source:     ${model.source}`);
  console.log(`  model id:         ${model.id ?? "—"}`);
  console.log(`  fitted at:        ${model.fittedAt}`);
  console.log(`  test artist:      ${TEST_ARTIST} (${TEST_GENRE})`);
  console.log("");
  console.log("  --- rates the MetaFunnelForecast / ad layer use ---");
  console.log(`  meta_funnel.cpc:              ${ad.metaFunnel.cpc.toFixed(4)}`);
  console.log(`  spotify_cpl.marquee:          ${ad.spotifyCpl.marquee.toFixed(4)}`);
  console.log(`  spotify_cpl.showcase:         ${ad.spotifyCpl.showcase.toFixed(4)}`);
  console.log(
    `  resolved SPL:                 ${totals.splUsed.toFixed(4)} (${totals.splSource})`,
  );
  console.log(`  spotify_spl_global:           ${ad.spotifySplGlobal.toFixed(4)}`);
  console.log(
    `  streams_per_spotify_click_eff:${totals.metaStreamsPerSpotifyClickEffective.toFixed(4)}`,
  );
  console.log("");
  console.log("  --- attributed totals (independent bands) ---");
  console.log(
    `  marquee streams:  ${Math.round(totals.spotifyMarquee).toLocaleString("en-US")}  (= ${MARQUEE_SPEND}/${ad.spotifyCpl.marquee.toFixed(4)} × ${totals.splUsed.toFixed(4)})`,
  );
  console.log(
    `  showcase streams: ${Math.round(totals.spotifyShowcase).toLocaleString("en-US")}  (= ${SHOWCASE_SPEND}/${ad.spotifyCpl.showcase.toFixed(4)} × ${totals.splUsed.toFixed(4)})`,
  );
  console.log(
    `  meta streams:     ${Math.round(totals.meta).toLocaleString("en-US")}  (UI funnel streams=${Math.round(funnel.projectedStreams).toLocaleString("en-US")})`,
  );
  console.log(
    `  UI CPC displayed: ${funnel.cpc.toFixed(4)}  (must match meta_funnel.cpc above, not 0.10)`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
