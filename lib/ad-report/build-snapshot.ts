/**
 * Build a frozen ad_reports.metrics_snapshot for a release.
 */

import {
  effectiveMetaStreamsPerSpotifyClick,
  resolveSpl,
} from "@/lib/ad-forecast";
import { releaseKeyFromTrackName } from "@/lib/ad-upload/canonical";
import { listCreativesForReleaseKey } from "@/lib/ad-upload/creatives";
import type {
  AdReportCampaignRow,
  AdReportChannelId,
  AdReportChannelSnapshot,
  AdReportCreativeAsset,
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
import { variancePct } from "@/lib/ad-report/windows";
import { computeWeek1Actuals } from "@/lib/compute-week1-actuals";
import { asMetaAdSurface, asSpotifyAdSurface } from "@/lib/ad-campaign-surface";
import { readableCampaignName } from "@/lib/campaign-display-name";
import {
  classifyStreamsVsBand,
  expectedStreamRange,
} from "@/lib/save-rate-band-label";

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

function ctrPct(
  clicks: number | null,
  impressions: number | null,
): number | null {
  if (clicks == null || impressions == null || !(impressions > 0)) return null;
  return (clicks / impressions) * 100;
}

/** Add a captured metric into a running total; ignore null and zero. */
function addCaptured(
  current: number | null,
  value: number | null,
): number | null {
  if (value == null || value === 0) return current;
  return (current ?? 0) + value;
}

function isBlankCampaign(row: AdReportCampaignRow): boolean {
  const hasSpend = row.spend > 0;
  const hasResult =
    (row.streams ?? 0) > 0 ||
    (row.clicks ?? 0) > 0 ||
    (row.impressions ?? 0) > 0 ||
    (row.reach ?? 0) > 0 ||
    (row.saves ?? 0) > 0 ||
    (row.linkfireSpotifyClicks ?? 0) > 0 ||
    (row.linkfireVisits ?? 0) > 0;
  return !hasSpend && !hasResult;
}

function positiveMetric(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value) || value === 0) return null;
  return value;
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
        "artist, release_key, campaign_uid, surface, spend_usd, reach, clicks, converted_listeners, streams_per_listener, active_streams_per_listener, est_attributed_streams, saves, start_date, end_date, usable_for_modeling, derived_fields, source_partner",
      )
      .eq("release_key", releaseKey),
    sb
      .from("ad_meta_campaigns")
      .select(
        "release_key, campaign_uid, campaign_name, objective, surface, spend_usd, link_clicks, impressions, reach, linkfire_visits, linkfire_spotify_clicks, linkfire_streams, start_date, end_date, derived_fields, source_partner",
      )
      .eq("release_key", releaseKey),
  ]);

  let spotify = (spotifyRes.data ?? []) as SpotifyRow[];
  if (spotifyRes.error) {
    // Pre-migration: saves / streams_per_listener may be missing.
    const lean = await sb
      .from("ad_spotify_campaigns")
      .select(
        "artist, release_key, campaign_uid, surface, spend_usd, reach, clicks, converted_listeners, active_streams_per_listener, est_attributed_streams, start_date, end_date, usable_for_modeling, derived_fields, source_partner",
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

/**
 * Flight window = earliest start_date × latest end_date across all campaigns.
 * Omit the header label when dates are absent or collapse to a same-day range
 * (often a single defaulted value, not a real multi-day flight).
 */
function channelWindow(
  spotify: SpotifyRow[],
  meta: MetaRow[],
): { startDate: string | null; endDate: string | null; label: string | null } {
  const starts: string[] = [];
  const ends: string[] = [];
  for (const row of [...spotify, ...meta]) {
    const s = strOrNull(row.start_date);
    const e = strOrNull(row.end_date);
    if (s) starts.push(s);
    if (e) ends.push(e);
  }
  starts.sort();
  ends.sort();
  const startDate = starts.length > 0 ? starts[0]! : null;
  const endDate = ends.length > 0 ? ends[ends.length - 1]! : null;
  if (startDate == null || endDate == null || startDate === endDate) {
    return { startDate, endDate, label: null };
  }
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
  const [{ spotify, meta }, creatives] = await Promise.all([
    loadAdRowsForRelease(releaseKey),
    listCreativesForReleaseKey(releaseKey).catch(() => []),
  ]);
  const creativesByUid = new Map<string, AdReportCreativeAsset[]>();
  for (const c of creatives) {
    const list = creativesByUid.get(c.campaignUid) ?? [];
    list.push({ id: c.id, url: c.url, caption: c.caption });
    creativesByUid.set(c.campaignUid, list);
  }

  const model = await loadActiveModel();
  logActiveModelSource(model, `ad-report/${release.id}`);
  const lockedCurve = buildStreamCurve(
    model,
    release.locked_forecast_streams,
    { releaseDate: release.release_date },
  );

  const wk1 = computeWeek1Actuals(dailyData);
  const forecastStreams = release.locked_forecast_streams;
  const actualStreams = wk1.streams;
  const actualDaysEntered = wk1.daysWithStreams;
  const streamBand = model.streamBands;
  const expectedRange = expectedStreamRange(forecastStreams, streamBand);
  const streamsVsBand =
    actualStreams == null
      ? null
      : classifyStreamsVsBand(actualStreams, forecastStreams, streamBand);
  const delta =
    actualStreams == null ? null : actualStreams - forecastStreams;
  const pctOfForecast =
    actualStreams == null || !(forecastStreams > 0)
      ? null
      : (actualStreams / forecastStreams) * 100;

  const forecastSaves = release.locked_forecast_saves;
  const actualSavesSum = wk1.saves;

  let d28Actual = 0;
  let d28Days = 0;
  for (const row of dailyData) {
    if (row.day_number < 1 || row.day_number > 28) continue;
    if (row.streams != null && row.streams >= 0) {
      d28Actual += row.streams;
      d28Days += 1;
    }
  }

  const channels: Record<AdReportChannelId, AdReportChannelSnapshot> = {
    marquee: emptyChannel("marquee", "Marquee", "measured"),
    showcase: emptyChannel("showcase", "Showcase", "measured"),
    meta_traffic: emptyChannel("meta_traffic", "Meta Traffic", "estimated"),
    meta_awareness: emptyChannel("meta_awareness", "Meta Awareness", "unavailable"),
  };

  const campaigns: AdReportCampaignRow[] = [];

  for (const row of spotify) {
    const format = asSpotifyAdSurface(row.surface) ?? "marquee";
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

    const campaignUid = strOrNull(row.campaign_uid);
    campaigns.push({
      platform: "spotify",
      channel: channelId,
      campaignUid,
      campaignName: readableCampaignName({
        campaignName: null,
        campaignUid,
        platform: "spotify",
        format: format || null,
        objective: null,
      }),
      format: format || null,
      objective: null,
      spend,
      streams: streamsRaw,
      streamsLabel: "measured",
      impressions: null,
      reach,
      clicks,
      ctr: null,
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
      creatives: campaignUid ? (creativesByUid.get(campaignUid) ?? []) : [],
    });
  }

  for (const row of meta) {
    const objective = coerceMetaObjective(
      row.objective as string | null | undefined,
      "traffic",
    );
    const storedSurface = asMetaAdSurface(row.surface);
    const channelId: AdReportChannelId =
      storedSurface ??
      (objective === "awareness" ? "meta_awareness" : "meta_traffic");
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

    const campaignUid = strOrNull(row.campaign_uid);
    const campaignName = readableCampaignName({
      campaignName: strOrNull(row.campaign_name),
      campaignUid,
      platform: "meta",
      format: null,
      objective,
    });
    campaigns.push({
      platform: "meta",
      channel: channelId,
      campaignUid,
      campaignName,
      format: null,
      objective,
      spend,
      streams: channelId === "meta_traffic" ? enteredStreams ?? 0 : null,
      streamsLabel: channelId === "meta_traffic" ? "estimated" : null,
      impressions,
      reach,
      clicks,
      ctr: ctrPct(clicks, impressions),
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
      creatives: campaignUid ? (creativesByUid.get(campaignUid) ?? []) : [],
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
      if (measured != null && measured > 0) {
        hasAnyMeasured = true;
        measuredTotal += measured;
      }
      if (entered != null) {
        // Partner-entered streams win; do not also apply click×SPL.
        camp.streams = entered;
        camp.streamsLabel = "estimated";
        camp.costPerStream = cps(camp.spend, entered);
        channelStreams += entered;
        hasAnyStreams = true;
      } else if (measured != null && measured > 0) {
        const est = Math.round(measured * perClick);
        camp.streams = est;
        camp.streamsLabel = "estimated";
        camp.costPerStream = cps(camp.spend, est);
        channelStreams += est;
        hasAnyStreams = true;
      } else if (camp.clicks != null && camp.clicks > 0) {
        const est = Math.round(camp.clicks * share * perClick);
        camp.streams = est;
        camp.streamsLabel = "estimated";
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
      traffic.streamsLabel = "estimated";
      traffic.costPerStream = cps(traffic.spend, traffic.streams);
      const predictedRounded = Math.round(predictedTotal);
      const measured = hasAnyMeasured ? measuredTotal : null;
      metaFunnelComparison = {
        predictedSpotifyClicks: predictedRounded,
        measuredSpotifyClicks: measured,
        clicksVariancePct: variancePct(predictedRounded, measured),
        estimatedStreams: channelStreams,
        streamsFromMeasuredClicks: hasAnyMeasured,
        cpc,
        spotifyClickShare: share,
        streamsPerSpotifyClickEffective: perClick,
      };
    }
  }

  for (const ch of Object.values(channels)) {
    if (ch.streamsLabel !== "unavailable") {
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

  const budgetByChannel: Record<AdReportChannelId, number> = {
    marquee: release.spotify_marquee_spend_planned,
    showcase: release.spotify_showcase_spend_planned,
    meta_traffic: release.meta_traffic_spend_planned,
    meta_awareness: release.meta_awareness_spend_planned,
  };
  const budgetTotal =
    release.meta_spend_planned + release.spotify_spend_planned;

  const visibleCampaigns = campaigns.filter((c) => !isBlankCampaign(c));
  const spendByChannelId: Record<AdReportChannelId, number> = {
    marquee: 0,
    showcase: 0,
    meta_traffic: 0,
    meta_awareness: 0,
  };
  for (const camp of visibleCampaigns) {
    spendByChannelId[camp.channel] += camp.spend;
  }

  for (const camp of visibleCampaigns) {
    const channelSpend = spendByChannelId[camp.channel];
    const channelBudget = budgetByChannel[camp.channel];
    camp.budget =
      channelSpend > 0 && channelBudget > 0
        ? channelBudget * (camp.spend / channelSpend)
        : channelBudget > 0
          ? channelBudget
          : null;

    if (camp.platform === "spotify") {
      camp.resultLabel = "streams";
      camp.resultActual = positiveMetric(camp.streams);
      camp.resultForecast = null;
      camp.status = null;
    } else if (camp.channel === "meta_traffic") {
      camp.resultLabel = "spotify_clicks";
      camp.resultActual =
        positiveMetric(camp.linkfireSpotifyClicks) ??
        positiveMetric(camp.clicks);
      camp.resultForecast = positiveMetric(camp.predictedSpotifyClicks);
      if (camp.resultActual != null && camp.resultForecast != null) {
        camp.status =
          camp.resultActual >= camp.resultForecast
            ? "achieved"
            : "under_achieved";
      } else {
        camp.status = null;
      }
    } else {
      camp.resultLabel = "impressions";
      camp.resultActual = positiveMetric(camp.impressions);
      camp.resultForecast = null;
      camp.status = null;
    }
  }

  const sortedCampaigns = visibleCampaigns.sort((a, b) => b.spend - a.spend);
  const hasCreatives = sortedCampaigns.some((c) => c.creatives.length > 0);

  const objectives = new Set(
    meta
      .map((row) =>
        coerceMetaObjective(row.objective as string | null | undefined, "traffic"),
      )
      .filter(Boolean),
  );
  let objectiveLabel: string | null = null;
  if (objectives.size === 0 && spotify.length > 0) {
    objectiveLabel = "Streaming";
  } else if (objectives.size === 1) {
    const only = [...objectives][0]!;
    objectiveLabel = only.charAt(0).toUpperCase() + only.slice(1);
  } else if (objectives.size > 1) {
    objectiveLabel = [...objectives]
      .map((o) => o.charAt(0).toUpperCase() + o.slice(1))
      .join(" + ");
  }

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
      objectiveLabel,
    },
    campaignWindow: window,
    headline: {
      forecastStreams,
      actualStreams,
      actualDaysEntered,
      delta,
      pctOfForecast,
      variancePct: variancePct(forecastStreams, actualStreams),
      streamBand,
      expectedStreamsLo: expectedRange.lo,
      expectedStreamsHi: expectedRange.hi,
      streamsVsBand,
      forecastSaves,
      actualSaves: actualSavesSum,
      savesDelta,
      savesPctOfForecast,
      savesVariancePct: variancePct(forecastSaves, actualSavesSum),
      actualSavesWindow: "week1",
      d28ActualStreams: d28Days > 0 ? d28Actual : null,
      d28DaysEntered: d28Days,
    },
    paid: {
      totalSpend,
      attributedStreams,
      impressions,
      reach,
      clicks,
      saves: paidSaves,
      blendedCostPerStream: cps(totalSpend, attributedStreams),
      budgetTotal,
    },
    channels: channelList,
    campaigns: sortedCampaigns,
    metaFunnelComparison,
    hasCreatives,
    charts: {
      spendByChannel: channelList.map((ch) => ({
        channel: ch.label,
        spend: ch.spend,
        budget: budgetByChannel[ch.id],
      })),
      forecastVsActualDaily,
    },
  };
}
