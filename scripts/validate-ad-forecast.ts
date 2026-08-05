/**
 * Offline smoke for additive ad daily layer math.
 *   npx tsx scripts/validate-ad-forecast.ts
 */
import {
  allocateDailyStreams,
  buildAdDailyLayer,
  computeAdAwarenessDisplay,
  computeAdAttributedTotals,
  computeAdMetaFunnelDisplay,
  DEFAULT_MARQUEE_DURATION_DAYS,
  DEFAULT_SHOWCASE_DURATION_DAYS,
} from "@/lib/ad-forecast";
import { SEED_AD_MODEL, type AdModel } from "@/lib/model/ad-model";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

const adModel: AdModel = {
  ...SEED_AD_MODEL,
  spotifyCpl: { marquee: 0.5, showcase: 0.35 },
  spotifySplByArtist: { Elderbrook: 4.0 },
  spotifySplByGenre: { downtempo: 4.5 },
  spotifySplGlobal: 2.66,
  metaFunnel: {
    cpc: 0.4,
    spotifyClickShare: 0.5,
    streamsPerSpotifyClickBase: 1.2,
    confidence: "estimate",
  },
};

const totals = computeAdAttributedTotals(
  {
    artistName: "Elderbrook",
    genre: "downtempo",
    marqueeSpend: 500,
    showcaseSpend: 700,
    metaTrafficSpend: 400,
    metaAwarenessSpend: 250,
    campaignStartOffsetDays: 0,
    metaDurationDays: 14,
  },
  adModel,
);

// marquee: (500/0.5)*4 = 4000; showcase: (700/0.35)*4 = 8000
// effective s/click = 1.2 * (4/2.66); meta = (400/0.4)*0.5*effective
const expectedEffective = 1.2 * (4 / 2.66);
const expectedMeta = (400 / 0.4) * 0.5 * expectedEffective;
assert(Math.abs(totals.spotifyMarquee - 4000) < 1e-6, "marquee streams");
assert(Math.abs(totals.spotifyShowcase - 8000) < 1e-6, "showcase streams");
assert(
  Math.abs(totals.metaStreamsPerSpotifyClickEffective - expectedEffective) < 1e-9,
  "meta effective s/click",
);
assert(Math.abs(totals.meta - expectedMeta) < 1e-6, "meta streams");
assert(totals.metaAwarenessSpend === 250, "awareness spend tracked");
assert(totals.splSource === "artist", "spl source artist");
assert(
  totals.metaCostPerStream != null &&
    Math.abs(totals.metaCostPerStream - 400 / expectedMeta) < 1e-9,
  "meta cost per stream",
);

// Awareness-only → zero attributed Meta streams.
const awarenessOnly = computeAdAttributedTotals(
  {
    artistName: "Elderbrook",
    genre: "downtempo",
    marqueeSpend: 0,
    showcaseSpend: 0,
    metaTrafficSpend: 0,
    metaAwarenessSpend: 1000,
    campaignStartOffsetDays: 0,
    metaDurationDays: 14,
  },
  adModel,
);
assert(awarenessOnly.meta === 0, "awareness → 0 attributed streams");
assert(awarenessOnly.metaAwarenessSpend === 1000, "awareness spend retained");
assert(awarenessOnly.grandTotal === 0, "awareness not in attributed total");

const awarenessUi = computeAdAwarenessDisplay(1000, {
  ...adModel,
  metaAwareness: { cpm: 3.7, costPerReach: 0.0053, confidence: "estimate" },
});
assert(Math.abs(awarenessUi.projectedImpressions - (1000 / 3.7) * 1000) < 1e-6, "awareness imps");
assert(Math.abs(awarenessUi.projectedReach - 1000 / 0.0053) < 1e-6, "awareness reach");

const funnelUi = computeAdMetaFunnelDisplay(400, "Elderbrook", "downtempo", adModel);
assert(Math.abs(funnelUi.cpc - 0.4) < 1e-9, "UI CPC from adModel");
assert(Math.abs(funnelUi.projectedStreams - expectedMeta) < 1e-6, "UI meta streams");
assert(Math.abs(funnelUi.cplMarquee - 0.5) < 1e-9, "UI cpl marquee");
assert(Math.abs(funnelUi.cplShowcase - 0.35) < 1e-9, "UI cpl showcase");
assert(Math.abs(funnelUi.splUsed - 4) < 1e-9, "UI resolved SPL");

const marqueeDaily = allocateDailyStreams(4000, 1, DEFAULT_MARQUEE_DURATION_DAYS, "front-loaded");
assert(marqueeDaily.reduce((a, b) => a + b, 0) === 4000, "marquee daily sum");
assert(marqueeDaily[0]! > marqueeDaily[1]!, "marquee front-loaded days");
assert(marqueeDaily.slice(2).every((v) => v === 0), "marquee only 2 days");

const showcaseDaily = allocateDailyStreams(
  8000,
  1,
  DEFAULT_SHOWCASE_DURATION_DAYS,
  "even",
);
assert(showcaseDaily.reduce((a, b) => a + b, 0) === 8000, "showcase sum");
const showcaseActive = showcaseDaily.slice(0, 14);
const minS = Math.min(...showcaseActive);
const maxS = Math.max(...showcaseActive);
assert(maxS - minS <= 1, "showcase even (±1 from remainder)");
assert(showcaseDaily.slice(14).every((v) => v === 0), "showcase window only");

const layer = buildAdDailyLayer(
  {
    artistName: "Unknown Artist",
    genre: "house",
    marqueeSpend: 0,
    showcaseSpend: 0,
    metaTrafficSpend: 400,
    metaAwarenessSpend: 0,
    campaignStartOffsetDays: 3,
    metaDurationDays: 7,
  },
  adModel,
  100_000,
);
assert(layer.marqueeDaily.every((v) => v === 0), "no marquee");
assert(layer.showcaseDaily.every((v) => v === 0), "no showcase");
assert(layer.metaDaily[0] === 0 && layer.metaDaily[1] === 0 && layer.metaDaily[2] === 0, "offset");
assert(layer.metaDaily.slice(3, 10).reduce((a, b) => a + b, 0) === 600, "meta window");
assert(layer.week1WithAds === 100_000 + layer.week1AdTotal, "wk1 with ads");

const splitLayer = buildAdDailyLayer(
  {
    artistName: "Elderbrook",
    genre: "downtempo",
    marqueeSpend: 500,
    showcaseSpend: 700,
    metaTrafficSpend: 0,
    metaAwarenessSpend: 0,
    campaignStartOffsetDays: 0,
    metaDurationDays: 14,
  },
  adModel,
  50_000,
);
assert(
  Math.abs(splitLayer.totals.spotifyMarquee - 4000) < 1e-6,
  "marquee total independent",
);
assert(
  Math.abs(splitLayer.totals.spotifyShowcase - 8000) < 1e-6,
  "showcase total independent",
);
assert(
  Math.abs(splitLayer.week1AdMarquee - 4000) < 1e-6,
  "wk1 marquee (2d window fully in wk1)",
);
// Showcase is even over 14d → only D1–D7 land in wk1 (~half).
assert(
  splitLayer.week1AdShowcase > 3500 &&
    splitLayer.week1AdShowcase < 4500 &&
    Math.abs(
      splitLayer.showcaseDaily.reduce((a, b) => a + b, 0) - 8000,
    ) < 1e-6,
  "wk1 showcase is partial 14d window",
);
assert(
  splitLayer.marqueeDaily.some((v) => v > 0) &&
    splitLayer.showcaseDaily.some((v) => v > 0),
  "separate daily bands",
);
assert(
  !splitLayer.marqueeDaily.every(
    (v, i) => v === (splitLayer.showcaseDaily[i] ?? 0),
  ),
  "marquee ≠ showcase daily",
);

console.log("PASS: ad-forecast additive layer math");
