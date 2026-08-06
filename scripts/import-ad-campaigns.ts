/**
 * Import ad campaign history into ad_spotify_campaigns + ad_meta_campaigns.
 *
 *   npx tsx --env-file=.env.local --env-file=retrain/.env.local \
 *     scripts/import-ad-campaigns.ts
 *
 * Reads seed/ad/*.csv. Idempotent: replaces all rows in both tables.
 * Requires SUPABASE_SERVICE_ROLE_KEY (writes bypass RLS).
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { createServiceClient } from "@/lib/supabase/service";

const SEED_DIR = path.join(process.cwd(), "seed", "ad");
const SPOTIFY_CSV = path.join(SEED_DIR, "model-spotify-campaigns.csv");
const MASTER_CSV = path.join(SEED_DIR, "model-release-master.csv");
const LINKFIRE_SERVICES_CSV = path.join(SEED_DIR, "linkfire-services.csv");
const LINKFIRE_SUMMARY_CSV = path.join(SEED_DIR, "linkfire-summary.csv");
const META_DELIVERY_CSV = path.join(SEED_DIR, "master-release-campaigns.csv");

const BATCH = 100;

type CsvRow = Record<string, string>;

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

function int(raw: string | undefined): number | null {
  const n = num(raw);
  return n == null ? null : Math.trunc(n);
}

function dateOrNull(raw: string | undefined): string | null {
  if (!raw) return null;
  // Accept YYYY-MM-DD only
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
}

function norm(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function formatFromCsv(raw: string): "marquee" | "showcase" | null {
  const v = raw.trim().toLowerCase();
  if (v === "marquee") return "marquee";
  if (v === "showcase") return "showcase";
  return null;
}

/**
 * Spotify + Spotify Pre-Release share as a 0–1 fraction, keyed by release_key.
 *
 * Denominator must be the release total (including Linkfire's "N Others"
 * aggregate). Prefer Linkfire's reported Share % (already vs release total);
 * fall back to click-through counts: spotify CT / (named + Others CT).
 * Never divide by the sum of named services alone — that inflates share.
 */
function buildSpotifyClickShareByReleaseKey(
  masterRows: CsvRow[],
  serviceRows: CsvRow[],
): Map<string, { share: number; endDate: string | null }> {
  type Agg = {
    spotifyClicks: number;
    /** Named/listed services only (excludes Others). */
    namedClicks: number;
    /** Linkfire "N Others" aggregate bucket click-throughs. */
    othersClicks: number;
    /** Sum of Spotify + Spotify Pre-Release Share % (0–100 scale). */
    spotifySharePct: number;
    endDate: string | null;
  };
  const byArtistRelease = new Map<string, Agg>();

  for (const r of serviceRows) {
    const service = (r.Service ?? "").trim().toLowerCase();
    if (!service) continue;
    const clicks = num(r["Click-throughs"]) ?? 0;
    const sharePct = num(r["Share %"]) ?? 0;
    const key = `${norm(r.Artist ?? "")}|${norm(r["Release / Link"] ?? "")}`;
    const agg = byArtistRelease.get(key) ?? {
      spotifyClicks: 0,
      namedClicks: 0,
      othersClicks: 0,
      spotifySharePct: 0,
      endDate: null,
    };

    // Others aggregate is part of the release total — keep its CT, skip as a "service".
    if (service.includes("others")) {
      agg.othersClicks += clicks;
      byArtistRelease.set(key, agg);
      continue;
    }
    if ((r["Is aggregate row"] ?? "").toLowerCase() === "yes") continue;

    agg.namedClicks += clicks;
    if (service === "spotify" || service === "spotify pre release") {
      agg.spotifyClicks += clicks;
      agg.spotifySharePct += sharePct;
    }
    const end = dateOrNull(r["Window end"]);
    if (end) agg.endDate = end;
    byArtistRelease.set(key, agg);
  }

  const out = new Map<string, { share: number; endDate: string | null }>();
  for (const m of masterRows) {
    const releaseKey = m.release_key;
    if (!releaseKey) continue;
    const artist = norm(m.artist ?? "");
    const release = norm(m.release ?? "");
    let best: Agg | null = null;
    for (const [key, agg] of byArtistRelease) {
      const [a, rel] = key.split("|");
      const releaseHit =
        rel === release || rel.includes(release) || release.includes(rel);
      if (!releaseHit) continue;
      const artistHit =
        a === artist ||
        a.includes(artist.split(" ")[0] ?? "") ||
        artist.includes(a.split(" ")[0] ?? "");
      if (!artistHit) continue;
      best = agg;
      break;
    }
    if (!best || best.spotifyClicks <= 0) continue;

    // Prefer Share % (vs release total). Else CT / (named + Others).
    let share: number | null = null;
    if (best.spotifySharePct > 0) {
      share = best.spotifySharePct / 100;
    } else {
      const totalClicks = best.namedClicks + best.othersClicks;
      if (totalClicks > 0) {
        share = best.spotifyClicks / totalClicks;
      }
    }
    if (share == null || !(share > 0)) continue;

    out.set(releaseKey, {
      share,
      endDate: best.endDate,
    });
  }
  return out;
}

function mapSpotifyRow(r: CsvRow): Record<string, unknown> | null {
  const format = formatFromCsv(r.platform_format ?? "");
  if (!format) {
    console.warn(`skip spotify row: bad format ${JSON.stringify(r.platform_format)}`);
    return null;
  }
  if (!r.campaign_uid || !r.artist || !r.release_key) {
    console.warn("skip spotify row: missing campaign_uid/artist/release_key");
    return null;
  }
  const usableRaw = (r.usable_for_modeling ?? "").toLowerCase();
  return {
    artist: r.artist,
    release_key: r.release_key,
    campaign_uid: r.campaign_uid,
    format,
    release_type: r.release_type || null,
    country: r.country || null,
    segment_targeting: r.segment_targeting || null,
    spend_usd: num(r.spend_usd),
    reach: num(r.reach),
    clicks: num(r.clicks),
    converted_listeners: num(r.converted_listeners),
    active_streams_per_listener: num(r.active_streams_per_listener),
    est_attributed_streams: num(r.est_attributed_streams),
    conversion_rate_pct: num(r.conversion_rate_pct),
    release_date: dateOrNull(r.release_date),
    start_date: dateOrNull(r.start_date),
    end_date: dateOrNull(r.end_date),
    days_release_to_campaign: int(r.days_release_to_campaign),
    campaign_days: int(r.campaign_days),
    usable_for_modeling: usableRaw === "" || usableRaw === "yes" || usableRaw === "true",
    exclusion_reason: r.exclusion_reason || null,
  };
}

function hasMetaOrLinkfire(r: CsvRow): boolean {
  const sources = r.sources_present ?? "";
  if (sources.includes("Meta") || sources.includes("Linkfire")) return true;
  if (r.meta_spend_usd !== "" || r.meta_link_clicks !== "") return true;
  if (r.linkfire_visits !== "" || r.linkfire_clickthroughs !== "") return true;
  return false;
}

type LinkfireSummary = {
  ctrPct: number | null;
  streams: number | null;
};

/** Match Linkfire summary CTR/streams onto release_key via artist+release labels. */
function buildLinkfireSummaryByReleaseKey(
  masterRows: CsvRow[],
  summaryRows: CsvRow[],
): Map<string, LinkfireSummary> {
  const out = new Map<string, LinkfireSummary>();
  for (const s of summaryRows) {
    const artist = norm(s.Artist ?? "");
    const release = norm(s["Release / Link"] ?? "");
    if (!artist || !release) continue;
    let rk: string | null = null;
    for (const m of masterRows) {
      if (!m.release_key) continue;
      const ma = norm(m.artist ?? "");
      const mr = norm(m.release ?? "");
      const releaseHit =
        release === mr || release.includes(mr) || mr.includes(release);
      const artistHit =
        artist === ma ||
        artist.includes(ma.split(" ")[0] ?? "") ||
        ma.includes(artist.split(" ")[0] ?? "");
      if (releaseHit && artistHit) {
        rk = m.release_key;
        break;
      }
    }
    if (!rk) continue;
    out.set(rk, {
      ctrPct: num(s["CTR %"]),
      streams: num(s.Streams),
    });
  }
  return out;
}

function slugPart(raw: string): string {
  return raw
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

/**
 * Ads Manager export rows → awareness objective with impressions/reach.
 * release_key is a stable synthetic key (unique constraint).
 */
function mapAwarenessDeliveryRows(rows: CsvRow[]): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]!;
    const spend = num(r["Amount spent"]);
    const impressions = num(r.Impressions);
    const reach = num(r.Reach);
    if (
      spend == null ||
      spend <= 0 ||
      impressions == null ||
      impressions <= 0 ||
      reach == null ||
      reach <= 0
    ) {
      continue;
    }
    const start = dateOrNull(r["Reporting starts"]);
    const end = dateOrNull(r["Reporting ends"] ?? r.Ends);
    const name = (r["Campaign name"] ?? "").trim();
    let releaseKey = `awareness:${slugPart(name) || "campaign"}:${start ?? "na"}:${i}`;
    while (seen.has(releaseKey)) {
      releaseKey = `${releaseKey}+`;
    }
    seen.add(releaseKey);
    out.push({
      release_key: releaseKey,
      campaign_uid: releaseKey,
      campaign_name: name || null,
      objective: "awareness",
      spend_usd: spend,
      link_clicks: num(r["Link clicks"]),
      landing_page_views: num(r["Landing page views"]),
      cpc: num(r["CPC (link click)"]),
      linkfire_visits: null,
      linkfire_clickthroughs: null,
      spotify_click_share: null,
      impressions,
      reach,
      linkfire_ctr_pct: null,
      linkfire_streams: null,
      start_date: start,
      end_date: end,
    });
  }
  return out;
}

function mapMetaRow(
  r: CsvRow,
  shareLookup: Map<string, { share: number; endDate: string | null }>,
  summaryLookup: Map<string, LinkfireSummary>,
): Record<string, unknown> | null {
  if (!r.release_key) return null;
  if (!hasMetaOrLinkfire(r)) return null;

  const joined = shareLookup.get(r.release_key);
  const summary = summaryLookup.get(r.release_key);
  const start =
    dateOrNull(r.first_campaign_date) ?? dateOrNull(r.release_date);
  const end = joined?.endDate ?? null;

  return {
    release_key: r.release_key,
    campaign_uid: r.release_key,
    campaign_name: null,
    // Release-master Meta aggregates are link-click (traffic) campaigns.
    objective: "traffic",
    spend_usd: num(r.meta_spend_usd),
    link_clicks: num(r.meta_link_clicks),
    landing_page_views: num(r.meta_landing_page_views),
    cpc: num(r.meta_cost_per_click_usd),
    linkfire_visits: num(r.linkfire_visits),
    linkfire_clickthroughs: num(r.linkfire_clickthroughs),
    spotify_click_share: joined?.share ?? null,
    impressions: null,
    reach: num(r.meta_reach),
    linkfire_ctr_pct: summary?.ctrPct ?? num(r.linkfire_ctr_pct),
    linkfire_streams: summary?.streams ?? null,
    start_date: start,
    end_date: end,
  };
}

/** Drop columns not yet migrated so import still works on older schemas. */
function stripUnknownMetaColumns(
  rows: Record<string, unknown>[],
  errorMessage: string,
): Record<string, unknown>[] {
  const optional = [
    "campaign_uid",
    "impressions",
    "reach",
    "linkfire_ctr_pct",
    "linkfire_streams",
    "derived_fields",
    "source_partner",
  ];
  const drop = optional.filter((col) => errorMessage.includes(`'${col}'`));
  if (drop.length === 0) return rows;
  return rows.map((row) => {
    const next = { ...row };
    for (const col of drop) delete next[col];
    return next;
  });
}

async function replaceTable(
  table: "ad_spotify_campaigns" | "ad_meta_campaigns",
  rows: Record<string, unknown>[],
  onConflict: string,
): Promise<number> {
  const supabase = createServiceClient();

  // Delete all existing rows (idempotent re-import).
  const { error: delError } = await supabase
    .from(table)
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000");
  if (delError) {
    throw new Error(`${table} delete: ${delError.message}`);
  }

  let payload = rows;
  let conflict = onConflict;

  // Resolve schema drift on first batch (missing migrated columns).
  {
    let attempt = 0;
    while (attempt < 6) {
      const { error } = await supabase
        .from(table)
        .upsert(payload.slice(0, Math.min(BATCH, payload.length)), {
          onConflict: conflict,
        });
      if (!error) break;
      if (table !== "ad_meta_campaigns") {
        throw new Error(`${table} upsert @0: ${error.message}`);
      }
      const stripped = stripUnknownMetaColumns(payload, error.message);
      const changed =
        stripped.length === payload.length &&
        stripped.some((row, idx) => {
          const prev = payload[idx] ?? {};
          return Object.keys(prev).length !== Object.keys(row).length;
        });
      if (!changed) {
        throw new Error(`${table} upsert @0: ${error.message}`);
      }
      payload = stripped;
      if (!("campaign_uid" in (payload[0] ?? {}))) {
        conflict = "release_key";
      }
      console.warn(`${table}: dropped missing columns — ${error.message}`);
      attempt += 1;
    }
  }

  for (let i = BATCH; i < payload.length; i += BATCH) {
    const chunk = payload.slice(i, i + BATCH);
    const { error } = await supabase.from(table).upsert(chunk, {
      onConflict: conflict,
    });
    if (error) {
      throw new Error(`${table} upsert @${i}: ${error.message}`);
    }
  }

  const { count, error: countError } = await supabase
    .from(table)
    .select("id", { count: "exact", head: true });
  if (countError) {
    throw new Error(`${table} count: ${countError.message}`);
  }
  return count ?? rows.length;
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

  const spotifyCsv = parseCsv(readFileSync(SPOTIFY_CSV, "utf8"));
  const masterCsv = parseCsv(readFileSync(MASTER_CSV, "utf8"));
  const linkfireCsv = parseCsv(readFileSync(LINKFIRE_SERVICES_CSV, "utf8"));
  const summaryCsv = parseCsv(readFileSync(LINKFIRE_SUMMARY_CSV, "utf8"));
  const deliveryCsv = parseCsv(readFileSync(META_DELIVERY_CSV, "utf8"));

  const shareLookup = buildSpotifyClickShareByReleaseKey(masterCsv, linkfireCsv);
  const summaryLookup = buildLinkfireSummaryByReleaseKey(masterCsv, summaryCsv);

  const spotifyRows = spotifyCsv
    .map(mapSpotifyRow)
    .filter((r): r is Record<string, unknown> => r != null);
  const trafficRows = masterCsv
    .map((r) => mapMetaRow(r, shareLookup, summaryLookup))
    .filter((r): r is Record<string, unknown> => r != null);
  const awarenessRows = mapAwarenessDeliveryRows(deliveryCsv);
  const metaRows = [...trafficRows, ...awarenessRows];

  console.log(`Parsed spotify CSV rows: ${spotifyCsv.length} → ${spotifyRows.length} to insert`);
  console.log(`Parsed traffic Meta/Linkfire rows: ${trafficRows.length}`);
  console.log(`Parsed awareness delivery rows: ${awarenessRows.length}`);
  console.log(
    `Linkfire spotify_click_share joined for ${shareLookup.size} release_keys`,
  );
  console.log(
    `Linkfire CTR/streams joined for ${summaryLookup.size} release_keys`,
  );

  const spotifyCount = await replaceTable(
    "ad_spotify_campaigns",
    spotifyRows,
    "campaign_uid,format",
  );
  const metaCount = await replaceTable(
    "ad_meta_campaigns",
    metaRows,
    // Prefer campaign_uid when migrated; replaceTable falls back to release_key.
    "campaign_uid",
  );

  console.log("---");
  console.log(`ad_spotify_campaigns loaded: ${spotifyCount}`);
  console.log(`ad_meta_campaigns loaded: ${metaCount}`);
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
