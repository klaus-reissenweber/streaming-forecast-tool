/**
 * Build a frozen ad_reports.metrics_snapshot for a release.
 */

import {
  effectiveMetaStreamsPerSpotifyClick,
  resolveSpl,
} from "@/lib/ad-forecast";
import { releaseKeyFromTrackName } from "@/lib/ad-upload/canonical";
import type {
  AdReportCampaignRow,
  AdReportChannelId,
  AdReportChannelSnapshot,
  AdReportDailyPoint,
  AdReportMetricsSnapshot,
} from "@/lib/ad-report/types";
import { buildStreamCurve } from "@/lib/forecast";
import { loadActiveModel } from "@/lib/load-active-model";
import type { DailyDataPoint, ReleaseRecord } from "@/lib/map-release-row";
import { coerceMetaObjective } from "@/lib/meta-objective";
import { logActiveModelSource } from "@/lib/model/forecast-model";
import { createServiceClient } from "@/lib/supabase/service";

function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function numOrNull(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function strOrNull(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s || null;
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map(String).filter(Boolean);
}

function cps(spend: number, streams: number): number | null {
  if (!(streams > 0) || !(spend >= 0)) return null;
  return spend / streams;
}

type SpotifyRow = Record<string, unknown>;
type MetaRow = Record<string, unknown>;

async function loadAdRowsForRelease(releaseKey: string): Promise<{
  spotify: SpotifyRow[];
  meta: MetaRow[];
}> {
  const sb = createServiceClient();
  const [spotifyRes, metaRes] = await Promise.all([
    sb
      .from("ad_spotify_campaigns")
      .select(
        "artist, release_key, campaign_uid, format, spend_usd, reach, clicks, converted_listeners, est_attributed_streams, start_date, end_date, usable_for_modeling, derived_fields, source_partner",
      )
      .eq("release_key", releaseKey),
    sb
      .from("ad_meta_campaigns")
      .select(
        "release_key, campaign_uid, campaign_name, objective, spend_usd, link_clicks, impressions, reach, start_date, end_date, derived_fields, source_partner",
      )
      .eq("release_key", releaseKey),
  ]);

  if (spotifyRes.error) {
    throw new Error(`ad_spotify_campaigns: ${spotifyRes.error.message}`);
  }
  if (metaRes.error) {
    // Pre-migration schemas may lack some columns — retry leaner select.
    const lean = await sb
      .from("ad_meta_campaigns")
      .select(
        "release_key, campaign_name, objective, spend_usd, link_clicks, start_date, end_date",
      )
      .eq("release_key", releaseKey);
    if (lean.error) {
      throw new Error(`ad_meta_campaigns: ${lean.error.message}`);
    }
    return {
      spotify: (spotifyRes.data ?? []) as SpotifyRow[],
      meta: (lean.data ?? []) as MetaRow[],
    };
  }

  return {
    spotify: (spotifyRes.data ?? []) as SpotifyRow[],
    meta: (metaRes.data ?? []) as MetaRow[],
  };
}

function channelWindow(
  spotify: SpotifyRow[],
  meta: MetaRow[],
): { startDate: string | null; endDate: string | null; label: string } {
  const dates: string[] = [];
  for (const row of [...spotify, ...meta]) {
    const s = strOrNull(row.start_date);
    const e = strOrNull(row.end_date);
    if (s) dates.push(s);
    if (e) dates.push(e);
  }
  if (dates.length === 0) {
    return { startDate: null, endDate: null, label: "No campaign dates" };
  }
  dates.sort();
  const startDate = dates[0]!;
  const endDate = dates[dates.length - 1]!;
  return {
    startDate,
    endDate,
    label: `${startDate} → ${endDate}`,
  };
}

function emptyChannel(
  id: AdReportChannelId,
  label: string,
  streamsLabel: AdReportChannelSnapshot["streamsLabel"],
): AdReportChannelSnapshot {
  return {
    id,
    label,
    spend: 0,
    streams: 0,
    streamsLabel,
    impressions: 0,
    reach: 0,
    clicks: 0,
    costPerStream: null,
    hasDerivedValues: false,
  };
}

export async function buildAdReportSnapshot(
  release: ReleaseRecord,
  dailyData: DailyDataPoint[],
): Promise<AdReportMetricsSnapshot> {
  const releaseKey = releaseKeyFromTrackName(release.track_name);
  const { spotify, meta } = await loadAdRowsForRelease(releaseKey);

  const model = await loadActiveModel();
  logActiveModelSource(model, `ad-report/${release.id}`);
  const lockedCurve = buildStreamCurve(
    model,
    release.locked_forecast_streams,
    { releaseDate: release.release_date },
  );

  let actualStreamsSum = 0;
  let actualDaysEntered = 0;
  for (const row of dailyData) {
    if (row.streams != null && row.streams >= 0) {
      actualStreamsSum += row.streams;
      actualDaysEntered += 1;
    }
  }
  const forecastStreams = release.locked_forecast_streams;
  const actualStreams = actualDaysEntered > 0 ? actualStreamsSum : null;
  const delta =
    actualStreams == null ? null : actualStreams - forecastStreams;
  const pctOfForecast =
    actualStreams == null || !(forecastStreams > 0)
      ? null
      : (actualStreams / forecastStreams) * 100;

  const channels: Record<AdReportChannelId, AdReportChannelSnapshot> = {
    marquee: emptyChannel("marquee", "Marquee", "measured"),
    showcase: emptyChannel("showcase", "Showcase", "measured"),
    meta_traffic: emptyChannel("meta_traffic", "Meta traffic", "estimate"),
    meta_awareness: emptyChannel("meta_awareness", "Meta awareness", "n/a"),
  };

  const campaigns: AdReportCampaignRow[] = [];

  for (const row of spotify) {
    const format = String(row.format ?? "").toLowerCase();
    const channelId: AdReportChannelId =
      format === "showcase" ? "showcase" : "marquee";
    const spend = num(row.spend_usd);
    const streams = num(row.est_attributed_streams);
    const derived = asStringArray(row.derived_fields);
    const usable = Boolean(row.usable_for_modeling);

    const ch = channels[channelId];
    ch.spend += spend;
    ch.streams += streams;
    ch.reach += num(row.reach);
    ch.clicks += num(row.clicks);
    if (derived.length > 0) ch.hasDerivedValues = true;

    campaigns.push({
      platform: "spotify",
      channel: channelId,
      campaignName:
        strOrNull(row.campaign_uid) ??
        `${format || "spotify"} · ${release.track_name}`,
      format: format || null,
      objective: null,
      spend,
      streams,
      streamsLabel: "measured",
      impressions: null,
      reach: numOrNull(row.reach),
      clicks: numOrNull(row.clicks),
      costPerStream: cps(spend, streams),
      usableForModeling: usable,
      derivedFields: derived,
      startDate: strOrNull(row.start_date),
      endDate: strOrNull(row.end_date),
    });
  }

  for (const row of meta) {
    const objective = coerceMetaObjective(
      row.objective as string | null | undefined,
      "traffic",
    );
    const channelId: AdReportChannelId =
      objective === "awareness" ? "meta_awareness" : "meta_traffic";
    const spend = num(row.spend_usd);
    const impressions = num(row.impressions);
    const reach = num(row.reach);
    const clicks = num(row.link_clicks);
    const derived = asStringArray(row.derived_fields);

    // Meta streams are not measured on the campaign row — leave 0 / n/a for awareness;
    // traffic streams stay estimate-only (0 in snapshot unless we model later).
    const ch = channels[channelId];
    ch.spend += spend;
    ch.impressions += impressions;
    ch.reach += reach;
    ch.clicks += clicks;
    if (derived.length > 0) ch.hasDerivedValues = true;

    campaigns.push({
      platform: "meta",
      channel: channelId,
      campaignName:
        strOrNull(row.campaign_name) ??
        strOrNull(row.campaign_uid) ??
        `Meta ${objective}`,
      format: null,
      objective,
      spend,
      streams: channelId === "meta_traffic" ? 0 : null,
      streamsLabel: channelId === "meta_traffic" ? "estimate" : null,
      impressions: impressions > 0 ? impressions : numOrNull(row.impressions),
      reach: reach > 0 ? reach : numOrNull(row.reach),
      clicks: clicks > 0 ? clicks : numOrNull(row.link_clicks),
      costPerStream: null,
      usableForModeling: true,
      derivedFields: derived,
      startDate: strOrNull(row.start_date),
      endDate: strOrNull(row.end_date),
    });
  }

  // Meta traffic streams are modeled (not measured): clicks × share × effective SPL scale.
  {
    const { spl } = resolveSpl(
      model.adModel,
      release.artist_name,
      release.genre,
    );
    const share = model.adModel.metaFunnel.spotifyClickShare;
    const perClick = effectiveMetaStreamsPerSpotifyClick(model.adModel, spl);
    const traffic = channels.meta_traffic;
    if (traffic.clicks > 0) {
      const estimated = Math.round(traffic.clicks * share * perClick);
      traffic.streams = estimated;
      traffic.streamsLabel = "estimate";
      traffic.costPerStream = cps(traffic.spend, estimated);
      for (const camp of campaigns) {
        if (
          camp.channel !== "meta_traffic" ||
          !(camp.clicks != null && camp.clicks > 0)
        ) {
          continue;
        }
        const est = Math.round(camp.clicks * share * perClick);
        camp.streams = est;
        camp.streamsLabel = "estimate";
        camp.costPerStream = cps(camp.spend, est);
      }
    }
  }

  for (const ch of Object.values(channels)) {
    if (ch.streamsLabel !== "n/a") {
      ch.costPerStream = cps(ch.spend, ch.streams);
    }
  }

  const channelList = Object.values(channels).filter(
    (ch) => ch.spend > 0 || ch.streams > 0 || ch.impressions > 0 || ch.reach > 0,
  );

  const totalSpend = channelList.reduce((s, ch) => s + ch.spend, 0);
  const attributedStreams = channelList.reduce((s, ch) => s + ch.streams, 0);
  const impressions = channelList.reduce((s, ch) => s + ch.impressions, 0);
  const reach = channelList.reduce((s, ch) => s + ch.reach, 0);
  const clicks = channelList.reduce((s, ch) => s + ch.clicks, 0);

  const actualByDay: (number | null)[] = Array.from({ length: 28 }, () => null);
  for (const row of dailyData) {
    if (row.day_number >= 1 && row.day_number <= 28) {
      actualByDay[row.day_number - 1] = row.streams;
    }
  }

  const forecastVsActualDaily: AdReportDailyPoint[] =
    lockedCurve.dailyStreams.map((forecast, index) => ({
      day: index + 1,
      forecastStreams: forecast,
      actualStreams: actualByDay[index] ?? null,
    }));

  const window = channelWindow(spotify, meta);

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    release: {
      id: release.id,
      trackName: release.track_name,
      artistName: release.artist_name,
      genre: release.genre,
      releaseDate: release.release_date,
      releaseKey,
    },
    campaignWindow: window,
    headline: {
      forecastStreams,
      actualStreams,
      actualDaysEntered,
      delta,
      pctOfForecast,
    },
    paid: {
      totalSpend,
      attributedStreams,
      impressions,
      reach,
      clicks,
      blendedCostPerStream: cps(totalSpend, attributedStreams),
    },
    channels: channelList,
    campaigns: campaigns.sort((a, b) => b.spend - a.spend),
    charts: {
      spendByChannel: channelList.map((ch) => ({
        channel: ch.label,
        spend: ch.spend,
      })),
      forecastVsActualDaily,
    },
  };
}
