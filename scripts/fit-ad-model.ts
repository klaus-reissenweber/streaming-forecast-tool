/**
 * Fit ad_model from ad_* campaign tables, print review tables, and merge into
 * the active model_coefficients.payload (additive — organic fields unchanged).
 *
 *   npx tsx --env-file=.env.local --env-file=retrain/.env.local \
 *     scripts/fit-ad-model.ts
 *
 * Flags:
 *   --dry-run   fit + print only (do not write payload)
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  computeAdAttributedTotals,
  type AdSpendPlan,
} from "@/lib/ad-forecast";
import { coerceMetaObjective } from "@/lib/meta-objective";
import {
  adModelToPayload,
  fitAdModel,
  isLinkfireAutoRouter,
  normalizeArtistKey,
  type AdFormat,
  type AdGenre,
  type MetaAwarenessFitRow,
  type MetaCampaignFitRow,
  type SpotifyCampaignFitRow,
} from "@/lib/model/ad-model";
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
const SEED_DIR = path.join(process.cwd(), "seed", "ad");
const LINKFIRE_SERVICES_CSV = path.join(SEED_DIR, "linkfire-services.csv");
const LINKFIRE_SUMMARY_CSV = path.join(SEED_DIR, "linkfire-summary.csv");
const MASTER_RELEASE_CAMPAIGNS_CSV = path.join(
  SEED_DIR,
  "master-release-campaigns.csv",
);

type CsvRow = Record<string, string>;

function fmt(n: number, digits = 4): string {
  return n.toFixed(digits);
}

function parseCsv(text: string): CsvRow[] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];
    if (inQuotes) {
      if (ch === '"' && next === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ",") {
      row.push(field);
      field = "";
      continue;
    }
    if (ch === "\n" || (ch === "\r" && next === "\n")) {
      if (ch === "\r") i++;
      row.push(field);
      field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
      continue;
    }
    if (ch === "\r") {
      row.push(field);
      field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
      continue;
    }
    field += ch;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  if (rows.length === 0) return [];
  const headers = rows[0].map((h) => h.trim());
  return rows.slice(1).map((cells) => {
    const out: CsvRow = {};
    for (let i = 0; i < headers.length; i++) {
      out[headers[i]] = (cells[i] ?? "").trim();
    }
    return out;
  });
}

function num(raw: string | undefined): number | null {
  if (raw == null || raw === "") return null;
  const n = Number(raw.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function normLabel(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Per release_key: (Spotify + Spotify Pre-Release CT) / summary total CT.
 * Prefers Linkfire platform rows; falls back to Create Music Group.
 */
function buildClickShareByReleaseKey(
  masterRows: CsvRow[],
  serviceRows: CsvRow[],
  summaryRows: CsvRow[],
): Map<string, number> {
  type SpotifyAgg = { spotifyClicks: number };
  const spotifyByArtistRelease = new Map<string, SpotifyAgg>();

  for (const r of serviceRows) {
    if ((r["Is aggregate row"] ?? "").toLowerCase() === "yes") continue;
    const service = (r.Service ?? "").trim().toLowerCase();
    if (service !== "spotify" && service !== "spotify pre release") continue;
    const key = `${normLabel(r.Artist ?? "")}|${normLabel(r["Release / Link"] ?? "")}`;
    const agg = spotifyByArtistRelease.get(key) ?? { spotifyClicks: 0 };
    agg.spotifyClicks += num(r["Click-throughs"]) ?? 0;
    spotifyByArtistRelease.set(key, agg);
  }

  function matchMaster(artist: string, release: string): string | null {
    const a = normLabel(artist);
    const rel = normLabel(release);
    let best: { rk: string; score: number } | null = null;
    for (const m of masterRows) {
      const ma = normLabel(m.artist ?? "");
      const mr = normLabel(m.release ?? "");
      const rk = m.release_key;
      if (!rk) continue;
      const releaseHit = rel === mr || rel.includes(mr) || mr.includes(rel);
      if (!releaseHit) continue;
      const artistHit =
        a === ma ||
        a.includes(ma.split(" ")[0] ?? "") ||
        ma.includes(a.split(" ")[0] ?? "");
      if (!artistHit) continue;
      // Prefer longer release-name overlap (keeps TSHA remix distinct).
      const score = (rel === mr ? 100 : 0) + mr.length + ma.length;
      if (!best || score > best.score) best = { rk, score };
    }
    return best?.rk ?? null;
  }

  type Cand = { share: number; platform: string };
  const candidates = new Map<string, Cand[]>();

  for (const s of summaryRows) {
    const artist = s.Artist ?? "";
    const release = s["Release / Link"] ?? "";
    const totalCt = num(s["Click-throughs"]);
    if (totalCt == null || totalCt <= 0) continue;

    const rk = matchMaster(artist, release);
    if (!rk) continue;

    const key = `${normLabel(artist)}|${normLabel(release)}`;
    let spotify = spotifyByArtistRelease.get(key)?.spotifyClicks ?? 0;
    if (spotify <= 0) {
      // Fallback: any services row with same release label.
      for (const [k, agg] of spotifyByArtistRelease) {
        if (k.endsWith(`|${normLabel(release)}`)) {
          spotify = agg.spotifyClicks;
          break;
        }
      }
    }
    if (spotify <= 0) continue;

    const list = candidates.get(rk) ?? [];
    list.push({
      share: spotify / totalCt,
      platform: s.Platform ?? "",
    });
    candidates.set(rk, list);
  }

  const out = new Map<string, number>();
  for (const [rk, list] of candidates) {
    const linkfire = list.filter((c) =>
      c.platform.toLowerCase().includes("linkfire"),
    );
    const chosen = (linkfire.length > 0 ? linkfire : list)[0];
    out.set(rk, chosen.share);
  }
  return out;
}

function buildAutoRouterKeys(summaryRows: CsvRow[], masterRows: CsvRow[]): Set<string> {
  const keys = new Set<string>();
  for (const s of summaryRows) {
    const artist = s.Artist ?? "";
    const release = s["Release / Link"] ?? "";
    // Resolve release_key the same way as click-share.
    const a = normLabel(artist);
    const rel = normLabel(release);
    let rk: string | null = null;
    for (const m of masterRows) {
      const ma = normLabel(m.artist ?? "");
      const mr = normLabel(m.release ?? "");
      if (!m.release_key) continue;
      const releaseHit = rel === mr || rel.includes(mr) || mr.includes(rel);
      const artistHit =
        a === ma ||
        a.includes(ma.split(" ")[0] ?? "") ||
        ma.includes(a.split(" ")[0] ?? "");
      if (releaseHit && artistHit) {
        rk = m.release_key;
        break;
      }
    }
    if (
      isLinkfireAutoRouter({
        releaseKey: rk,
        ctrPct: num(s["CTR %"]),
        bounceRatePct: num(s["Bounce rate %"]),
        streams: num(s.Streams),
      })
    ) {
      if (rk) keys.add(rk);
    }
  }
  // Always include the named three even if summary match fails.
  for (const k of [
    "movement",
    "eyes cut deeper",
    "fall back to nothing",
  ]) {
    keys.add(k);
  }
  return keys;
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
    `  cpc:                           ${fmt(model.metaFunnel.cpc)}  (n=${model.sampleSizes.metaCpc}; = median of spend_usd/link_clicks)`,
  );
  console.log(
    `  spotify_click_share:           ${fmt(model.metaFunnel.spotifyClickShare)}  (n=${model.sampleSizes.metaSpotifyClickShare}; multi-service pages only; default 0.45)`,
  );
  console.log(
    `  streams_per_spotify_click_base:${fmt(model.metaFunnel.streamsPerSpotifyClickBase)}  (tunable global; effective = base × spl/spl_global)`,
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

  console.log(
    "\n=== Meta awareness (confidence: estimate) — master-release-campaigns.csv ===",
  );
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

function parseCsvNumber(raw: string | undefined): number | null {
  if (raw == null) return null;
  const cleaned = raw.trim().replace(/[$,]/g, "");
  if (cleaned === "" || cleaned === "—") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function loadAwarenessFitRows(): MetaAwarenessFitRow[] {
  const rows = parseCsv(readFileSync(MASTER_RELEASE_CAMPAIGNS_CSV, "utf8"));
  return rows.map((r) => ({
    spendUsd: parseCsvNumber(r["Amount spent"]),
    impressions: parseCsvNumber(r.Impressions),
    reach: parseCsvNumber(r.Reach),
  }));
}

async function loadFitInputs(): Promise<{
  spotify: SpotifyCampaignFitRow[];
  meta: MetaCampaignFitRow[];
  awareness: MetaAwarenessFitRow[];
  artistGenreByKey: Map<string, AdGenre>;
}> {
  const sb = createServiceClient();

  const { data: camps, error: campErr } = await sb
    .from("ad_spotify_campaigns")
    .select(
      "artist, format, spend_usd, converted_listeners, est_attributed_streams, usable_for_modeling",
    );
  if (campErr) throw new Error(`ad_spotify_campaigns: ${campErr.message}`);

  const { data: metaRows, error: metaErr } = await sb
    .from("ad_meta_campaigns")
    .select("release_key, objective, spend_usd, link_clicks");
  if (metaErr) throw new Error(`ad_meta_campaigns: ${metaErr.message}`);

  const { data: releases, error: relErr } = await sb
    .from("releases")
    .select("artist_name, genre");
  if (relErr) throw new Error(`releases: ${relErr.message}`);

  const masterRows = parseCsv(
    readFileSync(path.join(SEED_DIR, "model-release-master.csv"), "utf8"),
  );
  const serviceRows = parseCsv(readFileSync(LINKFIRE_SERVICES_CSV, "utf8"));
  const summaryRows = parseCsv(readFileSync(LINKFIRE_SUMMARY_CSV, "utf8"));

  const shareByKey = buildClickShareByReleaseKey(
    masterRows,
    serviceRows,
    summaryRows,
  );
  const autoRouterKeys = buildAutoRouterKeys(summaryRows, masterRows);

  const artistGenreByKey = new Map<string, AdGenre>();
  for (const r of releases ?? []) {
    const key = normalizeArtistKey(r.artist_name ?? "");
    const genre = r.genre as AdGenre;
    if (key && genre) artistGenreByKey.set(key, genre);
  }

  const spotify: SpotifyCampaignFitRow[] = (camps ?? []).map((r) => ({
    artist: String(r.artist),
    format: r.format as AdFormat,
    spendUsd: r.spend_usd == null ? null : Number(r.spend_usd),
    convertedListeners:
      r.converted_listeners == null ? null : Number(r.converted_listeners),
    estAttributedStreams:
      r.est_attributed_streams == null
        ? null
        : Number(r.est_attributed_streams),
    usableForModeling: Boolean(r.usable_for_modeling),
  }));

  const meta: MetaCampaignFitRow[] = (metaRows ?? []).map((r) => {
    const releaseKey = String(r.release_key);
    return {
      releaseKey,
      // Historical seed rows with null objective are link-click traffic campaigns.
      objective: coerceMetaObjective(r.objective, "traffic"),
      spendUsd: r.spend_usd == null ? null : Number(r.spend_usd),
      linkClicks: r.link_clicks == null ? null : Number(r.link_clicks),
      spotifyClickShare: shareByKey.get(releaseKey) ?? null,
      isAutoRouter: autoRouterKeys.has(releaseKey),
    };
  });

  return {
    spotify,
    meta,
    awareness: loadAwarenessFitRows(),
    artistGenreByKey,
  };
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
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL");
    return 1;
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("Missing SUPABASE_SERVICE_ROLE_KEY (use retrain/.env.local)");
    return 1;
  }

  const inputs = await loadFitInputs();
  const detail = fitAdModel(inputs);
  printReview(detail);

  const payloadFragment = adModelToPayload(detail.model);

  if (DRY_RUN) {
    console.log("\n(--dry-run) skipped writing ad_model into active payload");
    return 0;
  }

  const id = await writeAdModelToActivePayload(payloadFragment);
  console.log(
    `\nWrote ad_model into active model_coefficients id=${id} (organic fields unchanged).`,
  );
  console.log("Served via loadActiveModel().adModel after cache clear.");
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
