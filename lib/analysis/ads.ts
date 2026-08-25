import type { Finding } from "./types";
import {
  benchmarkGenre,
  classify,
  findBenchmark,
  findFormatReference,
  marginVsBenchmark,
  vsAverage,
  type Format,
  type Metric,
  type Surface,
} from "./ad-benchmarks";

/* Every sentence is a template over computed values. */

export type AdPlatform = "meta" | "spotify" | "youtube" | "tiktok";

export type CampaignMetric = {
  key: string;
  value: number;
};

export type CampaignRow = {
  market: string;
  metrics: CampaignMetric[];
};

export type AdCampaign = {
  platform: AdPlatform;
  /** Maps to the Surface union. Null when the schema cannot name one. */
  surface: Surface | null;
  metrics: CampaignMetric[];
  rows?: CampaignRow[];
  /** Previous campaign on the same surface, when one exists. */
  previous?: { metrics: CampaignMetric[] } | null;
};

export type AdRelease = {
  genre: string;
  /** Single vs album for Spotify format references. Not marquee/showcase. */
  format?: Format | null;
};

const METRICS = new Set<Metric>([
  "ctr",
  "cpc",
  "cpv",
  "cplpv",
  "cost_per_purchase",
  "roas",
  "view_rate",
  "six_second_view_rate",
  "conversion_rate",
  "streams_per_listener",
  "intent_rate",
  "playlist_add_rate",
  "save_rate",
]);

const MONEY = new Set<string>(["cpc", "cpv", "cplpv", "cost_per_purchase", "cost_per_signup"]);
const RATE = new Set<string>([
  "ctr",
  "view_rate",
  "six_second_view_rate",
  "conversion_rate",
  "intent_rate",
  "playlist_add_rate",
  "save_rate",
]);

const LABEL: Record<string, string> = {
  cpc: "Cost per click",
  ctr: "Click-through rate",
  cpv: "Cost per view",
  cplpv: "Cost per landing page view",
  cost_per_purchase: "Cost per purchase",
  roas: "Return on ad spend",
  conversion_rate: "Conversion rate",
  streams_per_listener: "Streams per listener",
  intent_rate: "Intent rate",
  playlist_add_rate: "Playlist add rate",
  save_rate: "Save rate",
  view_rate: "View rate",
  six_second_view_rate: "Six-second view rate",
  cost_per_signup: "Cost per signup",
};

const PRIMARY: Partial<Record<Surface, { key: string; better: "lower" | "higher" }>> = {
  meta_traffic: { key: "cpc", better: "lower" },
  meta_lpv: { key: "cplpv", better: "lower" },
  meta_sales: { key: "roas", better: "higher" },
};

const SURFACE_PHRASE: Partial<Record<Surface, string>> = {
  meta_awareness: "awareness",
  meta_traffic: "traffic",
  meta_lpv: "landing page views",
  meta_sales: "sales",
};

const pc = (x: number) => `${Math.round(Math.abs(x) * 100)} percent`;

const labelOf = (key: string) => LABEL[key] ?? key;

function asMetric(key: string): Metric | null {
  return METRICS.has(key as Metric) ? (key as Metric) : null;
}

function money(n: number): string {
  return `$${n.toFixed(2)}`;
}

function formatValue(key: string, n: number): string {
  if (RATE.has(key)) return `${n.toFixed(2)} percent`;
  if (key === "roas" || key === "streams_per_listener") return n.toFixed(2);
  if (MONEY.has(key)) return money(n);
  return n.toFixed(2);
}

function read(metrics: CampaignMetric[], key: string): number | null {
  const row = metrics.find((m) => m.key === key);
  if (!row || !Number.isFinite(row.value)) return null;
  return row.value;
}

function article(phrase: string): "a" | "an" {
  return /^[aeiou]/i.test(phrase) ? "an" : "a";
}

/** Positive signed margin means better. Cost metrics read that as "below". */
function sideWord(direction: "higher" | "lower", signed: number): "above" | "below" | "at" {
  if (signed === 0) return "at";
  if (direction === "lower") return signed > 0 ? "below" : "above";
  return signed > 0 ? "above" : "below";
}

function thresholdOf(b: { excellent?: number; good?: [number, number]; direction: "higher" | "lower" }): number | null {
  if (b.excellent !== undefined) return b.excellent;
  if (!b.good) return null;
  return b.direction === "higher" ? b.good[1] : b.good[0];
}

function metaBenchmarkFinding(
  metric: CampaignMetric,
  genre: "bass" | "house",
  surface: Surface,
): Finding | null {
  const key = asMetric(metric.key);
  if (!key) return null;
  const bench = findBenchmark(surface, genre, key);
  if (!bench) return null;
  const verdict = classify(metric.value, bench);
  const margin = marginVsBenchmark(metric.value, bench);
  const threshold = thresholdOf(bench);
  const phrase = SURFACE_PHRASE[surface];
  if (verdict == null || margin == null || threshold == null || !phrase) return null;
  const name = labelOf(metric.key);
  const shown = formatValue(metric.key, metric.value);
  const cut = formatValue(metric.key, threshold);
  const kind = `${genre} ${phrase}`;
  const side = sideWord(bench.direction, margin);
  if (side === "at") {
    return {
      id: `benchmark:${metric.key}`,
      text: `${name} of ${shown} is ${verdict} for ${article(kind)} ${kind} campaign, at the ${cut} threshold.`,
    };
  }
  return {
    id: `benchmark:${metric.key}`,
    text: `${name} of ${shown} is ${verdict} for ${article(kind)} ${kind} campaign, ${pc(margin)} ${side} the ${cut} threshold.`,
  };
}

function spotifyBenchmarkFinding(
  metric: CampaignMetric,
  surface: Surface,
  format: Format,
): Finding | null {
  const key = asMetric(metric.key);
  if (!key) return null;
  const ref = findFormatReference(surface, format, key);
  if (!ref || ref.average === undefined) return null;
  const signed = vsAverage(metric.value, ref);
  if (signed == null) return null;
  const name = labelOf(metric.key);
  const shown = formatValue(metric.key, metric.value);
  const avg = formatValue(metric.key, ref.average);
  const when = ref.source === "spotify_2025" ? "2025" : "EDM";
  const mark = `${when} ${ref.format} benchmark of ${avg}`;
  const side = sideWord(ref.direction, signed);
  if (side === "at") {
    return {
      id: `benchmark:${metric.key}`,
      text: `${name} of ${shown} matches the ${mark}.`,
    };
  }
  return {
    id: `benchmark:${metric.key}`,
    text: `${name} of ${shown} is ${pc(signed)} ${side} the ${mark}.`,
  };
}

function rankRows(rows: CampaignRow[], spec: { key: string; better: "lower" | "higher" }): CampaignRow[] {
  const scored = rows.filter((row) => read(row.metrics, spec.key) != null);
  const sign = spec.better === "lower" ? 1 : -1;
  return [...scored].sort((a, b) => {
    const av = read(a.metrics, spec.key)!;
    const bv = read(b.metrics, spec.key)!;
    return sign * (av - bv);
  });
}

function leadsOnCtr(best: CampaignRow, rows: CampaignRow[]): boolean {
  const bestCtr = read(best.metrics, "ctr");
  if (bestCtr == null) return false;
  return rows.every((row) => {
    const ctr = read(row.metrics, "ctr");
    return ctr == null || ctr <= bestCtr;
  });
}

function marketFindings(campaign: AdCampaign): Finding[] {
  const surface = campaign.surface;
  if (!surface || !campaign.rows || campaign.rows.length < 2) return [];
  const spec = PRIMARY[surface];
  if (!spec) return [];
  const ranked = rankRows(campaign.rows, spec);
  if (ranked.length < 2) return [];
  const best = ranked[0]!;
  const worst = ranked[ranked.length - 1]!;
  const bestPrimary = read(best.metrics, spec.key)!;
  const worstPrimary = read(worst.metrics, spec.key)!;
  const out: Finding[] = [];

  if (surface === "meta_traffic") {
    const ctr = read(best.metrics, "ctr");
    const cpc = read(best.metrics, "cpc");
    if (ctr != null && cpc != null && leadsOnCtr(best, ranked)) {
      out.push({
        id: "market-best",
        text: `${best.market} led on both counts: ${ctr.toFixed(2)} percent click-through rate at ${money(cpc)} per click.`,
      });
    } else {
      out.push({
        id: "market-best",
        text: `${best.market} led at ${money(bestPrimary)} per click.`,
      });
    }
    out.push({
      id: "market-worst",
      text: `${worst.market} trailed at ${money(worstPrimary)} per click.`,
    });
    return out;
  }

  if (surface === "meta_lpv") {
    out.push({
      id: "market-best",
      text: `${best.market} led at ${money(bestPrimary)} per landing page view.`,
    });
    out.push({
      id: "market-worst",
      text: `${worst.market} trailed at ${money(worstPrimary)} per landing page view.`,
    });
    return out;
  }

  out.push({
    id: "market-best",
    text: `${best.market} led at ${bestPrimary.toFixed(2)} return on ad spend.`,
  });
  out.push({
    id: "market-worst",
    text: `${worst.market} trailed at ${worstPrimary.toFixed(2)} return on ad spend.`,
  });
  return out;
}

function previousFindings(campaign: AdCampaign): Finding[] {
  const prev = campaign.previous?.metrics;
  if (!prev?.length) return [];
  const out: Finding[] = [];
  for (const metric of campaign.metrics) {
    const before = read(prev, metric.key);
    if (before == null || before === metric.value) continue;
    const verb = metric.value < before ? "fell" : "rose";
    out.push({
      id: `previous:${metric.key}`,
      text: `${labelOf(metric.key)} ${verb} from ${formatValue(metric.key, before)} to ${formatValue(metric.key, metric.value)}.`,
    });
  }
  return out;
}

function isIgnored(campaign: AdCampaign): boolean {
  if (campaign.platform === "youtube" || campaign.platform === "tiktok") return true;
  return campaign.surface === "youtube_trueview" || campaign.surface === "tiktok";
}

export function campaignFindings(
  campaign: AdCampaign,
  release: AdRelease,
): Finding[] {
  if (isIgnored(campaign)) return [];

  const out: Finding[] = [];

  if (campaign.platform === "meta") {
    const genre = benchmarkGenre(release.genre);
    if (genre == null) {
      out.push({
        id: "genre",
        text: `${release.genre} has no benchmark.`,
      });
    } else if (campaign.surface) {
      for (const metric of campaign.metrics) {
        if (!Number.isFinite(metric.value)) continue;
        const finding = metaBenchmarkFinding(metric, genre, campaign.surface);
        if (finding) out.push(finding);
      }
    }
  } else if (campaign.platform === "spotify") {
    const format = release.format ?? null;
    const surface = campaign.surface;
    if (format && surface) {
      for (const metric of campaign.metrics) {
        if (!Number.isFinite(metric.value)) continue;
        const finding = spotifyBenchmarkFinding(metric, surface, format);
        if (finding) out.push(finding);
      }
    }
  }

  out.push(...marketFindings(campaign));
  out.push(...previousFindings(campaign));
  return out;
}
