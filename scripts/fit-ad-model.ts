/**
 * Fit ad_model from ad_* campaign tables.
 *
 *   npx tsx --env-file=.env.local --env-file=retrain/.env.local \
 *     scripts/fit-ad-model.ts
 *
 * Flags:
 *   --dry-run     fit + print only (do not write)
 *   --emit-json   print only { ok, ad_model, sample_sizes, ... } as JSON
 *                 (used by retrain --write-draft; no active-row write)
 *   (default)     merge into the active model_coefficients.payload
 *
 * Prefer --write-draft retrain for promoting a new ad_model via approve.
 */
import {
  computeAdAttributedTotals,
  type AdSpendPlan,
} from "@/lib/ad-forecast";
import {
  adModelToPayload,
  fitAdModel,
  type AdGenre,
} from "@/lib/model/ad-model";
import { loadAdFitInputs } from "@/lib/model/load-ad-fit-inputs";
import { clearActiveModelCache } from "@/lib/load-active-model";
import { createServiceClient } from "@/lib/supabase/service";
import type { Genre } from "@/lib/forecast";

/** Artists printed for Meta SPL-scaling review (genre scaling visibility). */
const META_REVIEW_ARTISTS: Array<{ artist: string; genre: Genre }> = [
  { artist: "LSDREAM", genre: "melodic-bass" },
  { artist: "Elderbrook", genre: "downtempo" },
  { artist: "KSHMR", genre: "big-room" },
];
const META_REVIEW_SPEND = 1000;

const DRY_RUN = process.argv.includes("--dry-run");
const EMIT_JSON = process.argv.includes("--emit-json");

function fmt(n: number, digits = 4): string {
  return n.toFixed(digits);
}

function printReview(detail: ReturnType<typeof fitAdModel>): void {
  const { model, artistRaw, metaReview } = detail;

  console.log("\n=== Spotify CPL (median spend/converted_listeners) ===");
  console.log(
    `  marquee:  ${fmt(model.spotifyCpl.marquee)}  (n=${model.sampleSizes.cplMarquee}; seed ~0.49)`,
  );
  console.log(
    `  showcase: ${fmt(model.spotifyCpl.showcase)}  (n=${model.sampleSizes.cplShowcase}; seed ~0.35)`,
  );

  console.log("\n=== Genre SPL priors (median SPL; shrink target) ===");
  const genres = Object.keys(model.spotifySplByGenre).sort();
  if (genres.length === 0) {
    console.log("  (none — all artists use global fallback)");
  } else {
    for (const genre of genres) {
      const v = model.spotifySplByGenre[genre as AdGenre];
      if (v != null) console.log(`  ${genre.padEnd(14)} ${fmt(v)}`);
    }
  }
  console.log(
    `  global fallback     ${fmt(model.spotifySplGlobal)}  (target ~2.65)`,
  );
  console.log(`  shrinkage k         ${model.spotifySplShrinkageK}`);

  console.log("\n=== Shrunk per-artist SPL ===");
  console.log(
    "  artist                 genre            n   raw      prior    shrunk",
  );
  for (const row of artistRaw) {
    console.log(
      `  ${row.artist.padEnd(22)} ${(row.genre ?? "—").padEnd(14)} ${String(row.n).padStart(3)}  ${fmt(row.rawSpl)}  ${fmt(row.prior)}  ${fmt(row.shrunkSpl)}`,
    );
  }

  console.log("\n=== Meta funnel (confidence: estimate) — traffic objective only ===");
  console.log(
    "  NOTE: linkfire_spotify_clicks / linkfire_visits are NEVER pooled into",
  );
  console.log(
    "  cpc, spotify_click_share, or any fitted constant (configs differ).",
  );
  console.log(
    "  NOTE: Spotify saves / streams_per_listener / reach / clicks are",
  );
  console.log(
    "  per-campaign report metrics only — not pooled into global CPL/SPL",
  );
  console.log(
    "  (SPL stays est_attributed_streams ÷ converted_listeners).",
  );
  console.log(
    `  cpc:                           ${fmt(model.metaFunnel.cpc)}  (n=${model.sampleSizes.metaCpc}; = median of spend_usd/link_clicks)`,
  );
  console.log(
    `  spotify_click_share:           ${fmt(model.metaFunnel.spotifyClickShare)}  (n=${model.sampleSizes.metaSpotifyClickShare}; multi-service pages only; default 0.45)`,
  );
  console.log(
    `  streams_per_spotify_click_base:${fmt(model.metaFunnel.streamsPerSpotifyClickBase)}  (fixed constant; effective = base × spl/spl_global)`,
  );
  console.log(`  confidence:                    ${model.metaFunnel.confidence}`);
  console.log(
    `  excluded non-traffic rows:     ${metaReview.excludedNonTraffic}`,
  );
  if (metaReview.excludedAutoRouters.length > 0) {
    console.log(
      `  excluded auto-routers:         ${metaReview.excludedAutoRouters.join(", ")}`,
    );
  }

  console.log("\n=== Meta awareness (confidence: estimate) — DB impressions/reach ===");
  console.log(
    `  cpm:                           ${fmt(model.metaAwareness.cpm)}  (n=${model.sampleSizes.metaAwareness}; median spend/imps×1000)`,
  );
  console.log(
    `  cost_per_reach:                ${fmt(model.metaAwareness.costPerReach, 6)}  (n=${metaReview.awarenessCostPerReachValues.length}; median spend/reach)`,
  );
  console.log(`  confidence:                    ${model.metaAwareness.confidence}`);

  console.log(
    `\n=== Meta SPL-scaling review ($${META_REVIEW_SPEND} Meta spend) ===`,
  );
  console.log(
    "  artist            spl     src      effective_s/click  meta_cps  meta_streams",
  );
  for (const { artist, genre } of META_REVIEW_ARTISTS) {
    const plan: AdSpendPlan = {
      artistName: artist,
      genre,
      marqueeSpend: 0,
      showcaseSpend: 0,
      metaTrafficSpend: META_REVIEW_SPEND,
      metaAwarenessSpend: 0,
      campaignStartOffsetDays: 0,
      metaDurationDays: 14,
    };
    const totals = computeAdAttributedTotals(plan, model);
    const cps =
      totals.metaCostPerStream == null
        ? "—"
        : fmt(totals.metaCostPerStream);
    console.log(
      `  ${artist.padEnd(16)} ${fmt(totals.splUsed)}  ${totals.splSource.padEnd(7)} ${fmt(totals.metaStreamsPerSpotifyClickEffective).padStart(18)}  ${cps.padStart(8)}  ${Math.round(totals.meta).toLocaleString("en-US")}`,
    );
  }

  console.log(
    `\nUsable Spotify campaigns: ${model.sampleSizes.spotifyUsable}`,
  );
}

async function writeAdModelToActivePayload(
  adModelPayload: Record<string, unknown>,
): Promise<string> {
  const sb = createServiceClient();
  const { data: row, error } = await sb
    .from("model_coefficients")
    .select("id, payload")
    .eq("status", "active")
    .not("payload", "is", null)
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`active model fetch: ${error.message}`);
  if (!row?.id || !row.payload || typeof row.payload !== "object") {
    throw new Error("No active model_coefficients payload row to update");
  }

  const nextPayload = {
    ...(row.payload as Record<string, unknown>),
    ad_model: adModelPayload,
  };

  const { error: updErr } = await sb
    .from("model_coefficients")
    .update({ payload: nextPayload })
    .eq("id", row.id);
  if (updErr) throw new Error(`active model update: ${updErr.message}`);

  clearActiveModelCache();
  return String(row.id);
}

async function main(): Promise<number> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL && !process.env.SUPABASE_URL) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL");
    return 1;
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("Missing SUPABASE_SERVICE_ROLE_KEY (use retrain/.env.local)");
    return 1;
  }
  // createServiceClient reads NEXT_PUBLIC_SUPABASE_URL; map SUPABASE_URL if needed.
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_URL) {
    process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.SUPABASE_URL;
  }

  const inputs = await loadAdFitInputs();
  const detail = fitAdModel(inputs);
  const payloadFragment = adModelToPayload(detail.model);

  if (EMIT_JSON) {
    process.stdout.write(
      `${JSON.stringify({
        ok: true,
        ad_model: payloadFragment,
        sample_sizes: detail.model.sampleSizes,
        excluded_auto_routers: detail.metaReview.excludedAutoRouters,
        excluded_non_traffic: detail.metaReview.excludedNonTraffic,
      })}\n`,
    );
    return 0;
  }

  printReview(detail);

  if (DRY_RUN) {
    console.log("\n(--dry-run) skipped writing ad_model into active payload");
    return 0;
  }

  const id = await writeAdModelToActivePayload(payloadFragment);
  console.log(
    `\nWrote ad_model into active model_coefficients id=${id} (organic fields unchanged).`,
  );
  console.log(
    "Note: prefer retrain --write-draft so ad_model promotes via approve.",
  );
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((err: unknown) => {
    if (EMIT_JSON) {
      process.stdout.write(
        `${JSON.stringify({
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        })}\n`,
      );
      process.exit(1);
    }
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
