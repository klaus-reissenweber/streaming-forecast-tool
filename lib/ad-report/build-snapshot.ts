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
  AdReportMetaFunnelComparison,
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

function cps(spend: number, streams: number | null): number | null {
  if (streams == null || !(streams > 0) || !(spend >= 0)) return null;
  return spend / streams;
}

/** Add a captured metric into a running total; ignore null/absent. */
function addCaptured(
  current: number | null,
  value: number | null,
): number | null {
  if (value == null) return current;
  return (current ?? 0) + value;
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
        "artist, release_key, campaign_uid, format, spend_usd, reach, clicks, converted_listeners, streams_per_listener, active_streams_per_listener, est_attributed_streams, saves, start_date, end_date, usable_for_modeling, derived_fields, source_partner",
      )
      .eq("release_key", releaseKey),
    sb
      .from("ad_meta_campaigns")
      .select(
        "release_key, campaign_uid, campaign_name, objective, spend_usd, link_clicks, impressions, reach, linkfire_visits, linkfire_spotify_clicks, linkfire_streams, start_date, end_date, derived_fields, source_partner",
      )
      .eq("release_key", releaseKey),
  ]);

  let spotify = (spotifyRes.data ?? []) as SpotifyRow[];
  if (spotifyRes.error) {
    // Pre-migration: saves / streams_per_listener may be missing.
    const lean = await sb
      .from("ad_spotify_campaigns")
      .select(
        "artist, release_key, campaign_uid, format, spend_usd, reach, clicks, converted_listeners, active_streams_per_listener, est_attributed_streams, start_date, end_date, usable_for_modeling, derived_fields, source_partner",
      )
      .eq("release_key", releaseKey);
    if (lean.error) {
      throw new Error(`ad_spotify_campaigns: ${lean.error.message}`);
    }
    spotify = (lean.data ?? []) as SpotifyRow[];
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
      spotify,
      meta: (lean.data ?? []) as MetaRow[],
    };
  }

  return {
    spotify,
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
    streams: null,
    streamsLabel,
    impressions: null,
    reach: null,
    clicks: null,
    convertedListeners: null,
    saves: null,
    linkfireVisits: null,
    linkfireSpotifyClicks: null,
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

  const forecastSaves = release.locked_forecast_saves;

  const channels: Record<AdReportChannelId, AdReportChannelSnapshot> = {
    marquee: emptyChannel("marquee", "Marquee", "measured"),
    showcase: emptyChannel("showcase", "Showcase", "measured"),
    meta_traffic: emptyChannel("meta_traffic", "Meta traffic", "estimate"),
    meta_awareness: emptyChannel("meta_awareness", "Meta awareness", "n/a"),
  };

  const campaigns: AdReportCampaignRow[] = [];
  let actualSavesSum: number | null = null;

  for (const row of spotify) {
    const format = String(row.format ?? "").toLowerCase();
    const channelId: AdReportChannelId =
      format === "showcase" ? "showcase" : "marquee";
    const spend = num(row.spend_usd);
    const streamsRaw = numOrNull(row.est_attributed_streams);
    const reach = numOrNull(row.reach);
    const clicks = numOrNull(row.clicks);
    const convertedListeners = numOrNull(row.converted_listeners);
    const saves = numOrNull(row.saves);
    const streamsPerListener =
      numOrNull(row.streams_per_listener) ??
      numOrNull(row.active_streams_per_listener);
    const derived = asStringArray(row.derived_fields);
    const usable = Boolean(row.usable_for_modeling);

    const ch = channels[channelId];
    ch.spend += spend;
    ch.streams = addCaptured(ch.streams, streamsRaw);
    ch.reach = addCaptured(ch.reach, reach);
    ch.clicks = addCaptured(ch.clicks, clicks);
    ch.convertedListeners = addCaptured(ch.convertedListeners, convertedListeners);
    ch.saves = addCaptured(ch.saves, saves);
    if (derived.length > 0) ch.hasDerivedValues = true;

    if (saves != null) {
      actualSavesSum = (actualSavesSum ?? 0) + saves;
    }

    campaigns.push({
      platform: "spotify",
      channel: channelId,
      campaignName:
        strOrNull(row.campaign_uid) ??
        `${format || "spotify"} · ${release.track_name}`,
      format: format || null,
      objective: null,
      spend,
      streams: streamsRaw,
      streamsLabel: "measured",
      impressions: null,
      reach,
      clicks,
      convertedListeners,
      saves,
      streamsPerListener,
      linkfireSpotifyClicks: null,
      linkfireVisits: null,
      predictedSpotifyClicks: null,
      costPerStream: cps(spend, streamsRaw),
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
    const impressions = numOrNull(row.impressions);
    const reach = numOrNull(row.reach);
    const clicks = numOrNull(row.link_clicks);
    const linkfireVisits = numOrNull(row.linkfire_visits);
    const measuredSpotifyClicks = numOrNull(row.linkfire_spotify_clicks);
    const enteredStreams = numOrNull(row.linkfire_streams);
    const derived = asStringArray(row.derived_fields);

    const ch = channels[channelId];
    ch.spend += spend;
    ch.impressions = addCaptured(ch.impressions, impressions);
    ch.reach = addCaptured(ch.reach, reach);
    ch.clicks = addCaptured(ch.clicks, clicks);
    ch.linkfireVisits = addCaptured(ch.linkfireVisits, linkfireVisits);
    ch.linkfireSpotifyClicks = addCaptured(
      ch.linkfireSpotifyClicks,
      measuredSpotifyClicks,
    );
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
      streams: channelId === "meta_traffic" ? enteredStreams ?? 0 : null,
      streamsLabel: channelId === "meta_traffic" ? "estimate" : null,
      impressions,
      reach,
      clicks,
      convertedListeners: null,
      saves: null,
      streamsPerListener: null,
      linkfireSpotifyClicks:
        channelId === "meta_traffic" ? measuredSpotifyClicks : null,
      linkfireVisits,
      predictedSpotifyClicks: null,
      costPerStream: null,
      usableForModeling: true,
      derivedFields: derived,
      startDate: strOrNull(row.start_date),
      endDate: strOrNull(row.end_date),
    });
  }

  // Meta traffic streams priority:
  // 1) partner-entered streams (linkfire_streams)
  // 2) measured Linkfire Spotify clicks × SPL effective
  // 3) funnel estimate from Meta link_clicks × share × SPL
  let metaFunnelComparison: AdReportMetaFunnelComparison | null = null;
  {
    const { spl } = resolveSpl(
      model.adModel,
      release.artist_name,
      release.genre,
    );
    const cpc = model.adModel.metaFunnel.cpc;
    const share = model.adModel.metaFunnel.spotifyClickShare;
    const perClick = effectiveMetaStreamsPerSpotifyClick(model.adModel, spl);
    const traffic = channels.meta_traffic;

    let channelStreams = 0;
    let measuredTotal = 0;
    let hasAnyMeasured = false;
    let predictedTotal = 0;
    let hasAnyStreams = false;

    for (const camp of campaigns) {
      if (camp.channel !== "meta_traffic") continue;
      const predicted =
        camp.spend > 0 && cpc > 0 ? (camp.spend / cpc) * share : 0;
      camp.predictedSpotifyClicks = predicted > 0 ? predicted : null;
      predictedTotal += predicted;

      const entered = camp.streams != null && camp.streams > 0 ? camp.streams : null;
      const measured = camp.linkfireSpotifyClicks;
      if (entered != null) {
        // Partner-entered streams win; do not also apply click×SPL.
        camp.streams = entered;
        camp.streamsLabel = "estimate";
        camp.costPerStream = cps(camp.spend, entered);
        channelStreams += entered;
        hasAnyStreams = true;
      } else if (measured != null && measured > 0) {
        hasAnyMeasured = true;
        measuredTotal += measured;
        const est = Math.round(measured * perClick);
        camp.streams = est;
        camp.streamsLabel = "estimate";
        camp.costPerStream = cps(camp.spend, est);
        channelStreams += est;
        hasAnyStreams = true;
      } else if (camp.clicks != null && camp.clicks > 0) {
        const est = Math.round(camp.clicks * share * perClick);
        camp.streams = est;
        camp.streamsLabel = "estimate";
        camp.costPerStream = cps(camp.spend, est);
        channelStreams += est;
        hasAnyStreams = true;
      } else {
        camp.streams = null;
        camp.costPerStream = null;
      }
    }

    if (traffic.spend > 0 || traffic.clicks != null || hasAnyMeasured || hasAnyStreams) {
      traffic.streams = hasAnyStreams ? channelStreams : null;
      traffic.streamsLabel = "estimate";
      traffic.costPerStream = cps(traffic.spend, traffic.streams);
      metaFunnelComparison = {
        predictedSpotifyClicks: Math.round(predictedTotal),
        measuredSpotifyClicks: hasAnyMeasured ? measuredTotal : null,
        estimatedStreams: channelStreams,
        streamsFromMeasuredClicks: hasAnyMeasured,
        cpc,
        spotifyClickShare: share,
        streamsPerSpotifyClickEffective: perClick,
      };
    }
  }

  for (const ch of Object.values(channels)) {
    if (ch.streamsLabel !== "n/a") {
      ch.costPerStream = cps(ch.spend, ch.streams);
    }
  }

  const channelList = Object.values(channels).filter(
    (ch) =>
      ch.spend > 0 ||
      (ch.streams != null && ch.streams > 0) ||
      ch.impressions != null ||
      ch.reach != null ||
      ch.clicks != null ||
      ch.saves != null,
  );

  const totalSpend = channelList.reduce((s, ch) => s + ch.spend, 0);
  const attributedStreams = channelList.reduce(
    (s, ch) => s + (ch.streams ?? 0),
    0,
  );
  const impressions = channelList.reduce<number | null>(
    (s, ch) => addCaptured(s, ch.impressions),
    null,
  );
  const reach = channelList.reduce<number | null>(
    (s, ch) => addCaptured(s, ch.reach),
    null,
  );
  const clicks = channelList.reduce<number | null>(
    (s, ch) => addCaptured(s, ch.clicks),
    null,
  );
  const paidSaves = channelList.reduce<number | null>(
    (s, ch) => addCaptured(s, ch.saves),
    null,
  );

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

  const savesDelta =
    actualSavesSum == null ? null : actualSavesSum - forecastSaves;
  const savesPctOfForecast =
    actualSavesSum == null || !(forecastSaves > 0)
      ? null
      : (actualSavesSum / forecastSaves) * 100;

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
      forecastSaves,
      actualSaves: actualSavesSum,
      savesDelta,
      savesPctOfForecast,
    },
    paid: {
      totalSpend,
      attributedStreams,
      impressions,
      reach,
      clicks,
      saves: paidSaves,
      blendedCostPerStream: cps(totalSpend, attributedStreams),
    },
    channels: channelList,
    campaigns: campaigns.sort((a, b) => b.spend - a.spend),
    metaFunnelComparison,
    charts: {
      spendByChannel: channelList.map((ch) => ({
        channel: ch.label,
        spend: ch.spend,
      })),
      forecastVsActualDaily,
    },
  };
}
