import {
  ForecastVsActualChart,
  SpendByChannelChart,
} from "@/components/report/AdReportCharts";
import {
  MetaLogo,
  SpotifyLogo,
} from "@/components/brand/PlatformLogos";
import { EditableFindings } from "@/components/report/EditableFindings";
import { EditableNoteBlock } from "@/components/report/EditableNoteBlock";
import { SaveAsPdfButton } from "@/components/report/SaveAsPdfButton";
import { StatusPill } from "@/components/ui/StatusPill";
import Link from "next/link";
import type {
  AdReportCampaignRow,
  AdReportChannelSnapshot,
  AdReportMetaFunnelComparison,
  AdReportMetricsSnapshot,
} from "@/lib/ad-report/types";
import {
  RESULT_LABEL_DISPLAY,
  STREAMS_LABEL_DISPLAY,
  isEstimatedStreams,
  isUnavailableStreams,
  parseResultLabel,
} from "@/lib/ad-report/labels";
import {
  d28ActualFromDaily,
  variancePct,
  week1FromDaily,
} from "@/lib/ad-report/windows";
import {
  channelsForAnalysis,
  metaFunnelForAnalysis,
  releaseForAnalysis,
  week1OutcomesForAnalysis,
} from "@/lib/ad-report/analysis-inputs";
import { hasUsableBudget, type AdReportNotes } from "@/lib/ad-report/notes";
import {
  channelComparisonFindings,
  metaFunnelFindings,
} from "@/lib/analysis/ads";
import { week1Findings } from "@/lib/analysis/findings";
import { STREAM_BANDS } from "@/lib/constants";
import {
  classifyStreamsVsBand,
  expectedStreamRange,
  SAVE_RATE_BAND_LABEL,
  saveRateToneClass,
  streamBandCaption,
} from "@/lib/save-rate-band-label";
import { readableCampaignName } from "@/lib/campaign-display-name";
import {
  formatCompactNumber,
  formatCount,
  formatLockTimestamp,
  formatPercent,
  formatReleaseDate,
  formatUsd,
} from "@/lib/format";

function fmtUsdOrDash(v: number | null | undefined, decimals = 2): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return formatUsd(v, decimals);
}

function captured(value: number | null | undefined): value is number {
  return value != null && Number.isFinite(value) && value !== 0;
}

function formatSignedPct(v: number | null | undefined, decimals = 0): string {
  if (v == null || !Number.isFinite(v)) return "—";
  const rounded = Number(v.toFixed(decimals));
  const sign = rounded > 0 ? "+" : "";
  return `${sign}${formatPercent(rounded, decimals)}`;
}

function displayCampaignName(row: AdReportCampaignRow): string {
  return readableCampaignName(row);
}

function channelCardHeading(label: string): string {
  if (label === "Meta traffic") return "Meta Traffic";
  if (label === "Meta awareness") return "Meta Awareness";
  return label;
}

function campaignCompareMetrics(c: AdReportCampaignRow) {
  const resultActual =
    c.resultActual ??
    (c.platform === "spotify"
      ? positiveOrNull(c.streams)
      : (positiveOrNull(c.linkfireSpotifyClicks) ??
        positiveOrNull(c.clicks)));
  const resultForecast =
    c.resultForecast ?? positiveOrNull(c.predictedSpotifyClicks);
  const resultKey =
    parseResultLabel(c.resultLabel) ??
    (c.platform === "spotify" ? "streams" : "spotify_clicks");
  const resultLabel = RESULT_LABEL_DISPLAY[resultKey];
  const status =
    c.status ??
    (resultActual != null && resultForecast != null
      ? resultActual >= resultForecast
        ? "achieved"
        : "under_achieved"
      : null);
  const cpr =
    resultActual != null && resultActual > 0
      ? c.spend / resultActual
      : c.costPerStream;
  return { resultActual, resultForecast, resultLabel, status, cpr };
}

function CampaignCompareCard({
  campaign,
}: {
  campaign: AdReportCampaignRow;
}) {
  const { resultActual, resultForecast, resultLabel, status, cpr } =
    campaignCompareMetrics(campaign);
  const isSpotify = campaign.platform === "spotify";

  return (
    <li className="px-4 py-3.5">
      <div className="flex items-start gap-2.5">
        {isSpotify ? (
          <SpotifyLogo className="mt-0.5 h-5 w-5 shrink-0" />
        ) : (
          <MetaLogo className="mt-0.5 h-5 w-auto shrink-0" />
        )}
        <div className="min-w-0 flex-1">
          <p className="font-medium text-foreground">
            {displayCampaignName(campaign)}
          </p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {isEstimatedStreams(campaign.streamsLabel) ||
            campaign.derivedFields.length > 0 ? (
              <StatusPill tone="warning">Derived</StatusPill>
            ) : isSpotify ? (
              <StatusPill tone="neutral">{STREAMS_LABEL_DISPLAY.measured}</StatusPill>
            ) : null}
            {!campaign.usableForModeling ? (
              <StatusPill tone="warning">Report only</StatusPill>
            ) : null}
          </div>
        </div>
      </div>

      <div className="mt-2">
        {status === "achieved" ? (
          <StatusPill tone="positive">Achieved</StatusPill>
        ) : status === "under_achieved" ? (
          <StatusPill tone="warning">Under achieved</StatusPill>
        ) : (
          <span className="text-sm text-secondary">—</span>
        )}
      </div>

      <dl className="mt-3 space-y-2 text-sm">
        <div>
          <dt className="text-caption text-foreground">Spent</dt>
          <dd className="tabular-nums text-foreground">
            {formatUsd(campaign.spend, 0)}
            {campaign.budget != null && campaign.budget > 0 ? (
              <span className="text-secondary">
                {" / "}
                {formatUsd(campaign.budget, 0)}
              </span>
            ) : null}
          </dd>
        </div>
        <div>
          <dt className="text-caption text-foreground">{resultLabel}</dt>
          <dd className="tabular-nums text-foreground">
            {resultActual == null ? "—" : formatCount(resultActual)}
          </dd>
          {resultForecast != null ? (
            <dd className="text-caption text-secondary">
              Forecast {formatCount(resultForecast)}
            </dd>
          ) : null}
        </div>
        <div>
          <dt className="text-caption text-foreground">Cost per result</dt>
          <dd className="tabular-nums text-foreground">
            {fmtUsdOrDash(cpr, 2)}
          </dd>
        </div>
      </dl>
    </li>
  );
}

function MetricValue({
  value,
  estimate,
}: {
  value: number | null | undefined;
  estimate?: boolean;
}) {
  if (!captured(value)) {
    return <span className="text-secondary">—</span>;
  }
  return (
    <span className="inline-flex flex-col items-start">
      <span className="tabular-nums">
        {formatCount(value)}
        {estimate ? (
          <sup className="ml-0.5 text-[0.65em] font-normal text-secondary">
            *
          </sup>
        ) : null}
      </span>
      {estimate ? (
        <span className="text-[10px] leading-tight text-secondary">
          {STREAMS_LABEL_DISPLAY.estimated}
        </span>
      ) : null}
    </span>
  );
}

function ChannelMetric({
  label,
  value,
  estimate,
  money,
}: {
  label: string;
  value: number | null | undefined;
  estimate?: boolean;
  money?: boolean;
}) {
  if (money) {
    if (value == null || !Number.isFinite(value) || value === 0) return null;
  } else if (!captured(value)) {
    return null;
  }
  return (
    <div>
      <dt className="text-foreground">{label}</dt>
      <dd className="text-foreground">
        {money ? (
          formatUsd(value!, label === "Spend" ? 0 : 2)
        ) : (
          <MetricValue value={value} estimate={estimate} />
        )}
      </dd>
    </div>
  );
}

function ProgressBar({
  label,
  startLabel,
  endLabel,
  pct,
}: {
  label: string;
  startLabel: string;
  endLabel: string;
  pct: number;
}) {
  const width = Math.max(0, Math.min(100, pct));
  return (
    <div>
      <p className="text-[10px] font-medium uppercase tracking-[0.06em] text-foreground">
        {label}
      </p>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-canvas">
        <div
          className="h-full rounded-full bg-projected"
          style={{ width: `${width}%` }}
        />
      </div>
      <div className="mt-1 flex justify-between text-caption text-secondary">
        <span>{startLabel}</span>
        <span>{endLabel}</span>
      </div>
    </div>
  );
}

function ReleaseMonogram({
  artist,
  title,
}: {
  artist: string;
  title: string;
}) {
  const letter = (artist.trim()[0] || title.trim()[0] || "?").toUpperCase();
  return (
    <div
      className="flex size-16 shrink-0 items-center justify-center rounded-instrument bg-canvas text-2xl font-semibold text-foreground"
      aria-hidden="true"
    >
      {letter}
    </div>
  );
}

function resolveMetaFunnel(
  snapshot: AdReportMetricsSnapshot,
): AdReportMetaFunnelComparison | null {
  const funnel = snapshot.metaFunnelComparison;
  if (!funnel) return null;
  const measuredFromRows = snapshot.campaigns.reduce((sum, row) => {
    return sum + (row.linkfireSpotifyClicks ?? 0);
  }, 0);
  const measured =
    funnel.measuredSpotifyClicks ??
    (measuredFromRows > 0 ? measuredFromRows : null);
  return {
    ...funnel,
    measuredSpotifyClicks: measured,
    clicksVariancePct:
      funnel.clicksVariancePct ??
      variancePct(funnel.predictedSpotifyClicks, measured),
  };
}

function isSpotifyChannel(id: AdReportChannelSnapshot["id"]): boolean {
  return id === "marquee" || id === "showcase";
}

function isMetaChannel(id: AdReportChannelSnapshot["id"]): boolean {
  return id === "meta_traffic" || id === "meta_awareness";
}

function rangeFillPct(start: string | null, end: string | null): number {
  if (!start || !end) return 100;
  const startMs = Date.parse(`${start}T00:00:00`);
  const endMs = Date.parse(`${end}T00:00:00`);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    return 100;
  }
  return Math.max(
    0,
    Math.min(100, ((Date.now() - startMs) / (endMs - startMs)) * 100),
  );
}

export function AdReportDashboard({
  title,
  snapshot,
  generatedAt,
  backHref = null,
  slug,
  notes,
  editable = false,
}: {
  title: string;
  snapshot: AdReportMetricsSnapshot;
  generatedAt: string;
  backHref?: string | null;
  slug: string;
  notes: AdReportNotes;
  editable?: boolean;
}) {
  const {
    headline,
    paid,
    release,
    campaignWindow,
    channels,
    campaigns,
    hasCreatives = false,
  } = snapshot;

  const week1 = week1FromDaily(snapshot.charts.forecastVsActualDaily);
  const week1Forecast =
    week1.forecastStreams > 0 ? week1.forecastStreams : headline.forecastStreams;
  const week1Actual = week1.actualStreams ?? headline.actualStreams;
  const week1Days = week1.actualDaysEntered || headline.actualDaysEntered;
  const streamsVariance = variancePct(week1Forecast, week1Actual);
  const streamBand = headline.streamBand ?? STREAM_BANDS;
  const expectedStreams = {
    lo: headline.expectedStreamsLo ?? expectedStreamRange(week1Forecast, streamBand).lo,
    hi: headline.expectedStreamsHi ?? expectedStreamRange(week1Forecast, streamBand).hi,
  };
  const streamsVsBand =
    headline.streamsVsBand !== undefined
      ? headline.streamsVsBand
      : week1Actual == null
        ? null
        : classifyStreamsVsBand(week1Actual, week1Forecast, streamBand);

  const d28 =
    headline.d28ActualStreams != null
      ? {
          actualStreams: headline.d28ActualStreams,
          daysEntered: headline.d28DaysEntered ?? 0,
        }
      : d28ActualFromDaily(snapshot.charts.forecastVsActualDaily);

  const savesArePaid =
    headline.actualSavesWindow !== "week1" &&
    paid.saves != null &&
    headline.actualSaves === paid.saves;
  const forecastSaves = headline.forecastSaves ?? null;
  const actualSaves = savesArePaid ? null : (headline.actualSaves ?? null);
  const savesVariance = savesArePaid
    ? null
    : (headline.savesVariancePct ??
      variancePct(forecastSaves ?? 0, actualSaves));

  const metaFunnelComparison = resolveMetaFunnel(snapshot);
  const budgetTotal = paid.budgetTotal;
  const spendPct =
    hasUsableBudget(budgetTotal) ? (paid.totalSpend / budgetTotal) * 100 : 0;

  const visibleCampaigns = campaigns.filter((row) => {
    return (
      row.spend > 0 ||
      captured(row.streams) ||
      captured(row.clicks) ||
      captured(row.impressions) ||
      captured(row.reach) ||
      captured(row.saves) ||
      captured(row.linkfireSpotifyClicks)
    );
  });

  const spotifyChannels = channels.filter((ch) => isSpotifyChannel(ch.id));
  const metaChannels = channels.filter((ch) => isMetaChannel(ch.id));
  const bothPlatforms =
    spotifyChannels.length > 0 && metaChannels.length > 0;
  const campaignsWithCreatives = visibleCampaigns.filter(
    (c) => (c.creatives?.length ?? 0) > 0,
  );

  const week1Analysis = week1Findings(
    week1OutcomesForAnalysis({
      forecastStreams: week1Forecast,
      actualStreams: week1Actual,
      expectedLo: expectedStreams.lo,
      expectedHi: expectedStreams.hi,
      forecastSaves: null,
      actualSaves: null,
      streamBand,
    }),
  );
  const channelAnalysis = channelComparisonFindings(
    channelsForAnalysis(snapshot),
    releaseForAnalysis(snapshot),
  );
  const funnelAnalysis = metaFunnelComparison
    ? metaFunnelFindings(metaFunnelForAnalysis(metaFunnelComparison))
    : [];

  return (
    <div className="ad-report mx-auto max-w-5xl px-5 py-8 print:max-w-none print:px-0 print:py-0">
      <header className="border-b border-border pb-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            {backHref ? (
              <p className="print:hidden">
                <Link
                  href={backHref}
                  className="text-sm font-medium text-accent-readable hover:underline"
                >
                  ← Back to release
                </Link>
              </p>
            ) : null}
            <p
              className={
                backHref
                  ? "mt-2 text-body-sm text-secondary"
                  : "text-body-sm text-secondary"
              }
            >
              {title}
            </p>
          </div>
          <SaveAsPdfButton />
        </div>

        <div className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(16rem,0.8fr)]">
          <div className="rounded-instrument border border-border bg-surface p-4">
            <div className="flex gap-4">
              <ReleaseMonogram
                artist={release.artistName}
                title={release.trackName}
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-caption text-secondary">{release.artistName}</p>
                    <h1 className="text-xl font-semibold text-foreground">
                      {release.trackName}
                    </h1>
                  </div>
                  {release.objectiveLabel ? (
                    <StatusPill tone="info">{release.objectiveLabel}</StatusPill>
                  ) : null}
                </div>
                <p className="mt-1 text-caption text-secondary">
                  Release {formatReleaseDate(release.releaseDate)} · Snapshot{" "}
                  {formatLockTimestamp(generatedAt)}
                </p>
              </div>
            </div>

            <div className="mt-4 space-y-3">
              {campaignWindow.startDate && campaignWindow.endDate ? (
                <ProgressBar
                  label="Campaign Duration"
                  startLabel={formatReleaseDate(campaignWindow.startDate)}
                  endLabel={formatReleaseDate(campaignWindow.endDate)}
                  pct={rangeFillPct(
                    campaignWindow.startDate,
                    campaignWindow.endDate,
                  )}
                />
              ) : null}
              {hasUsableBudget(budgetTotal) ? (
                <ProgressBar
                  label="Spend Against Budget"
                  startLabel={formatUsd(paid.totalSpend, 0)}
                  endLabel={formatUsd(budgetTotal, 0)}
                  pct={spendPct}
                />
              ) : null}
            </div>
          </div>

          <div className="rounded-instrument border border-border bg-surface p-4">
            <SpendByChannelChart
              spendByChannel={snapshot.charts.spendByChannel}
              compact
            />
          </div>
        </div>
      </header>

      <section className="mt-6" aria-label="Week 1 Forecast Against Week 1 Actual">
        <h2 className="text-section font-semibold text-foreground">
          Week 1 Forecast Against Week 1 Actual
        </h2>
        <p className="mt-1 text-sm text-secondary">
          Both sides cover Days 1 to 7
          {week1Days > 0 ? ` · ${week1Days} day${week1Days === 1 ? "" : "s"} entered` : ""}.
        </p>
        <dl className="mt-3 grid gap-3 sm:grid-cols-3">
          <div className="rounded-instrument border border-border bg-surface px-4 py-3">
            <dt className="text-label text-foreground">Week 1 forecast</dt>
            <dd className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
              {formatCompactNumber(week1Forecast)}
            </dd>
          </div>
          <div className="rounded-instrument border border-border bg-surface px-4 py-3">
            <dt className="text-label text-foreground">Week 1 actual</dt>
            <dd
              className={`mt-1 text-2xl font-semibold tabular-nums ${
                streamsVsBand == null
                  ? "text-foreground"
                  : saveRateToneClass(streamsVsBand)
              }`}
            >
              {week1Actual == null ? "—" : formatCompactNumber(week1Actual)}
            </dd>
            {streamsVsBand != null ? (
              <p className={`mt-2 text-caption ${saveRateToneClass(streamsVsBand)}`}>
                {streamBandCaption(streamsVsBand, expectedStreams)}
              </p>
            ) : week1Forecast > 0 ? (
              <p className="mt-2 text-caption text-secondary">
                Expected {formatCompactNumber(expectedStreams.lo)}–
                {formatCompactNumber(expectedStreams.hi)}
              </p>
            ) : null}
          </div>
          <div className="rounded-instrument border border-border bg-surface px-4 py-3">
            <dt className="text-label text-foreground">Variance</dt>
            <dd
              className={`mt-1 text-2xl font-semibold tabular-nums ${
                streamsVsBand != null
                  ? saveRateToneClass(streamsVsBand)
                  : streamsVariance == null
                    ? "text-secondary"
                    : streamsVariance >= 0
                      ? "text-semantic-positive"
                      : "text-semantic-negative"
              }`}
            >
              {formatSignedPct(streamsVariance, 0)}
            </dd>
            {streamsVsBand != null ? (
              <p className={`mt-2 text-caption ${saveRateToneClass(streamsVsBand)}`}>
                {SAVE_RATE_BAND_LABEL[streamsVsBand]}
              </p>
            ) : null}
          </div>
        </dl>
        {d28.actualStreams != null ? (
          <p className="mt-3 text-sm text-secondary">
            Days 1–28 actual total{" "}
            <span className="text-foreground">
              {formatCompactNumber(d28.actualStreams)}
            </span>
            {d28.daysEntered > 0
              ? ` · ${d28.daysEntered} day${d28.daysEntered === 1 ? "" : "s"} entered`
              : ""}
            . Not compared to the week-1 forecast.
          </p>
        ) : null}
        <EditableFindings
          slug={slug}
          findings={week1Analysis}
          notes={notes}
          editable={editable}
        />
      </section>

      {forecastSaves != null && !savesArePaid ? (
        <section className="mt-6" aria-label="Week 1 Saves">
          <h2 className="text-section font-semibold text-foreground">
            Week 1 Saves
          </h2>
          <dl className="mt-3 grid gap-3 sm:grid-cols-3">
            <div className="rounded-instrument border border-border bg-surface px-4 py-3">
              <dt className="text-label text-foreground">Week 1 forecast</dt>
              <dd className="mt-1 text-2xl font-semibold tabular-nums">
                {formatCompactNumber(forecastSaves)}
              </dd>
            </div>
            <div className="rounded-instrument border border-border bg-surface px-4 py-3">
              <dt className="text-label text-foreground">Week 1 actual</dt>
              <dd className="mt-1 text-2xl font-semibold tabular-nums">
                {actualSaves == null ? "—" : formatCompactNumber(actualSaves)}
              </dd>
            </div>
            <div className="rounded-instrument border border-border bg-surface px-4 py-3">
              <dt className="text-label text-foreground">Variance</dt>
              <dd
                className={`mt-1 text-2xl font-semibold tabular-nums ${
                  savesVariance == null
                    ? "text-secondary"
                    : savesVariance >= 0
                      ? "text-semantic-positive"
                      : "text-semantic-negative"
                }`}
              >
                {formatSignedPct(savesVariance, 0)}
              </dd>
            </div>
          </dl>
        </section>
      ) : null}

      <section className="mt-6" aria-label="Aggregated Campaign Metrics">
        <h2 className="text-section font-semibold text-foreground">
          Aggregated Campaign Metrics
        </h2>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            captured(paid.impressions)
              ? { label: "Impressions", value: formatCount(paid.impressions) }
              : null,
            captured(paid.clicks)
              ? { label: "Clicks", value: formatCount(paid.clicks) }
              : null,
            {
              label: "Streams",
              value: formatCount(paid.attributedStreams),
            },
            captured(paid.saves)
              ? { label: "Saves", value: formatCount(paid.saves) }
              : null,
          ]
            .filter((item): item is { label: string; value: string } => item != null)
            .map((item) => (
              <div
                key={item.label}
                className="rounded-instrument border border-border bg-surface px-4 py-3"
              >
                <p className="text-label text-foreground">{item.label}</p>
                <p className="mt-2 text-2xl font-semibold tabular-nums text-foreground">
                  {item.value}
                </p>
              </div>
            ))}
        </div>
      </section>

      <section className="mt-6" aria-label="Forecast Against Actual Chart">
        <ForecastVsActualChart
          forecastVsActualDaily={snapshot.charts.forecastVsActualDaily}
          releaseDate={release.releaseDate}
          campaignFlights={visibleCampaigns.map((c, index) => ({
            id: c.campaignUid ?? `${c.campaignName}-${index}`,
            name: displayCampaignName(c),
            startDate: c.startDate,
            endDate: c.endDate,
          }))}
        />
      </section>

      {metaFunnelComparison ? (
        <section className="mt-8" aria-label="Meta Funnel Comparison">
          <div className="mb-3 flex items-center gap-2">
            <MetaLogo className="h-5 w-auto" />
            <h2 className="text-section font-semibold text-foreground">
              Meta Funnel Comparison
            </h2>
          </div>
          <p className="text-sm text-secondary">
            Predicted against measured Linkfire clicks.
          </p>
          <dl className="mt-3 grid gap-3 sm:grid-cols-3">
            <div className="rounded-instrument border border-border bg-surface px-4 py-3">
              <dt className="text-label text-foreground">Predicted</dt>
              <dd className="mt-1 text-2xl tabular-nums text-secondary">
                {formatCount(metaFunnelComparison.predictedSpotifyClicks)}
              </dd>
            </div>
            <div className="rounded-instrument border border-border bg-surface px-4 py-3">
              <dt className="text-label text-foreground">Measured</dt>
              <dd className="mt-1 text-2xl font-semibold tabular-nums">
                {metaFunnelComparison.measuredSpotifyClicks == null
                  ? "—"
                  : formatCount(metaFunnelComparison.measuredSpotifyClicks)}
              </dd>
            </div>
            <div className="rounded-instrument border border-border bg-surface px-4 py-3">
              <dt className="text-label text-foreground">Variance</dt>
              <dd
                className={`mt-1 text-2xl font-semibold tabular-nums ${
                  metaFunnelComparison.clicksVariancePct == null
                    ? "text-secondary"
                    : metaFunnelComparison.clicksVariancePct >= 0
                      ? "text-semantic-positive"
                      : "text-semantic-negative"
                }`}
              >
                {formatSignedPct(metaFunnelComparison.clicksVariancePct, 0)}
              </dd>
            </div>
          </dl>
          <EditableFindings
            slug={slug}
            findings={funnelAnalysis}
            notes={notes}
            editable={editable}
          />
        </section>
      ) : null}

      {spotifyChannels.length > 0 || metaChannels.length > 0 ? (
        <div className="mt-8">
          <div
            className={
              bothPlatforms
                ? "grid gap-6 lg:grid-cols-2 print:grid-cols-2"
                : undefined
            }
          >
          {spotifyChannels.length > 0 ? (
            <section aria-label="Spotify Channels">
              <div className="mb-3 flex items-center gap-2">
                <SpotifyLogo className="h-5 w-5" />
                <h2 className="text-section font-semibold text-foreground">
                  Spotify
                </h2>
              </div>
              <div
                className={
                  !bothPlatforms && spotifyChannels.length > 1
                    ? "grid gap-3 sm:grid-cols-2"
                    : "grid gap-3"
                }
              >
                {spotifyChannels.map((ch) => (
                  <article
                    key={ch.id}
                    className="rounded-instrument border border-border bg-surface p-4"
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <h3 className="text-sm font-semibold text-foreground">
                        {channelCardHeading(ch.label)}
                      </h3>
                      {ch.hasDerivedValues ? (
                        <StatusPill tone="warning">Derived</StatusPill>
                      ) : (
                        <StatusPill tone="neutral">
                          {STREAMS_LABEL_DISPLAY.measured}
                        </StatusPill>
                      )}
                    </div>
                    <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-body-sm">
                      <ChannelMetric label="Spend" value={ch.spend} money />
                      <ChannelMetric label="Streams" value={ch.streams} />
                      <ChannelMetric label="Reach" value={ch.reach} />
                      <ChannelMetric label="Clicks" value={ch.clicks} />
                      <ChannelMetric
                        label="Converted listeners"
                        value={ch.convertedListeners}
                      />
                      <ChannelMetric label="Saves" value={ch.saves} />
                      <ChannelMetric
                        label="Cost per stream"
                        value={ch.costPerStream}
                        money
                      />
                    </dl>
                  </article>
                ))}
              </div>
            </section>
          ) : null}

          {metaChannels.length > 0 ? (
            <section aria-label="Meta Channels">
              <div className="mb-3 flex items-center gap-2">
                <MetaLogo className="h-5 w-auto" />
                <h2 className="text-section font-semibold text-foreground">
                  Meta
                </h2>
              </div>
              <div
                className={
                  !bothPlatforms && metaChannels.length > 1
                    ? "grid gap-3 sm:grid-cols-2"
                    : "grid gap-3"
                }
              >
                {metaChannels.map((ch) => (
                  <article
                    key={ch.id}
                    className="rounded-instrument border border-border bg-surface p-4"
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <h3 className="text-sm font-semibold text-foreground">
                        {channelCardHeading(ch.label)}
                      </h3>
                      {isEstimatedStreams(ch.streamsLabel) || ch.hasDerivedValues ? (
                        <StatusPill tone="warning">Derived</StatusPill>
                      ) : (
                        <StatusPill tone="neutral">
                          {STREAMS_LABEL_DISPLAY.measured}
                        </StatusPill>
                      )}
                    </div>
                    <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-body-sm">
                      <ChannelMetric label="Spend" value={ch.spend} money />
                      <ChannelMetric
                        label="Streams"
                        value={
                          isUnavailableStreams(ch.streamsLabel) ? null : ch.streams
                        }
                        estimate={isEstimatedStreams(ch.streamsLabel)}
                      />
                      <ChannelMetric label="Impressions" value={ch.impressions} />
                      <ChannelMetric label="Clicks" value={ch.clicks} />
                      <ChannelMetric
                        label="Link visits"
                        value={ch.linkfireVisits}
                      />
                      <ChannelMetric
                        label="Spotify clicks"
                        value={ch.linkfireSpotifyClicks}
                      />
                      <ChannelMetric
                        label="Cost per stream"
                        value={ch.costPerStream}
                        money
                      />
                    </dl>
                  </article>
                ))}
              </div>
            </section>
          ) : null}
          </div>
          <EditableFindings
            slug={slug}
            findings={channelAnalysis}
            notes={notes}
            editable={editable}
          />
        </div>
      ) : null}

      {hasCreatives && campaignsWithCreatives.length > 0 ? (
        <section className="mt-8" aria-label="Creatives by Campaign">
          <h2 className="text-section font-semibold text-foreground">
            Creatives
          </h2>
          <div className="mt-3 space-y-4">
            {campaignsWithCreatives.map((c, i) => (
              <article
                key={`${c.campaignUid ?? c.campaignName}-${i}`}
                className="rounded-instrument border border-border bg-surface p-4"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="text-sm font-semibold text-foreground">
                    {displayCampaignName(c)}
                  </h3>
                  <p className="text-caption text-secondary">
                    {c.channel.replace(/_/g, " ")}
                  </p>
                </div>
                <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                  {c.creatives.map((asset) => (
                    <li key={asset.id} className="min-w-0">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={asset.url}
                        alt={asset.caption || "Ad creative"}
                        className="aspect-square w-full rounded border border-border-subtle bg-canvas object-cover"
                        loading="lazy"
                      />
                      {asset.caption ? (
                        <p className="mt-1 truncate text-caption text-secondary">
                          {asset.caption}
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <section className="mt-8" aria-label="Marketing Objective Compare">
        <h2 className="text-section font-semibold text-foreground">
          Marketing Objective Compare
        </h2>
        <ul className="mt-3 divide-y divide-border-subtle overflow-hidden rounded-instrument border border-border bg-surface md:hidden print:hidden">
          {visibleCampaigns.length === 0 ? (
            <li className="px-4 py-4 text-secondary">No campaigns in snapshot.</li>
          ) : (
            visibleCampaigns.map((c, i) => (
              <CampaignCompareCard
                key={`${c.campaignName}-${i}`}
                campaign={c}
              />
            ))
          )}
        </ul>
        <div className="mt-3 hidden overflow-x-auto rounded-instrument border border-border bg-surface md:block print:block">
          <table className="w-full text-left text-body-sm">
            <thead>
              <tr className="border-b border-border text-foreground">
                <th className="px-3 py-2 font-normal">Platform</th>
                <th className="px-3 py-2 font-normal">Campaign</th>
                <th className="px-3 py-2 font-normal">Status</th>
                <th className="px-3 py-2 font-normal text-right">Amount spent</th>
                <th className="px-3 py-2 font-normal">Current result</th>
                <th className="px-3 py-2 font-normal text-right">
                  Cost per result
                </th>
              </tr>
            </thead>
            <tbody>
              {visibleCampaigns.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-4 text-secondary">
                    No campaigns in snapshot.
                  </td>
                </tr>
              ) : (
                visibleCampaigns.map((c, i) => {
                  const {
                    resultActual,
                    resultForecast,
                    resultLabel,
                    status,
                    cpr,
                  } = campaignCompareMetrics(c);
                  return (
                    <tr
                      key={`${c.campaignName}-${i}`}
                      className="border-b border-border-subtle last:border-0"
                    >
                      <td className="px-3 py-3 font-medium text-foreground">
                        {c.platform === "spotify" ? "Spotify" : "Meta"}
                      </td>
                      <td className="px-3 py-3">
                        <span className="text-foreground">
                          {displayCampaignName(c)}
                        </span>
                        {isEstimatedStreams(c.streamsLabel) ||
                        c.derivedFields.length > 0 ? (
                          <span className="ml-2">
                            <StatusPill tone="warning">Derived</StatusPill>
                          </span>
                        ) : c.platform === "spotify" ? (
                          <span className="ml-2">
                            <StatusPill tone="neutral">
                              {STREAMS_LABEL_DISPLAY.measured}
                            </StatusPill>
                          </span>
                        ) : null}
                        {!c.usableForModeling ? (
                          <span className="ml-2">
                            <StatusPill tone="warning">Report only</StatusPill>
                          </span>
                        ) : null}
                      </td>
                      <td className="px-3 py-3">
                        {status === "achieved" ? (
                          <StatusPill tone="positive">Achieved</StatusPill>
                        ) : status === "under_achieved" ? (
                          <StatusPill tone="warning">Under achieved</StatusPill>
                        ) : (
                          <span className="text-secondary">—</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">
                        {formatUsd(c.spend, 0)}
                        {c.budget != null && c.budget > 0 ? (
                          <span className="text-secondary">
                            {" / "}
                            {formatUsd(c.budget, 0)}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-3 py-3">
                        <p className="text-caption text-foreground">{resultLabel}</p>
                        <p className="tabular-nums text-foreground">
                          {resultActual == null
                            ? "—"
                            : formatCount(resultActual)}
                          {resultForecast != null ? (
                            <span className="text-secondary">
                              {" / "}
                              {formatCount(resultForecast)}
                            </span>
                          ) : null}
                        </p>
                        {resultForecast != null ? (
                          <p className="text-caption text-secondary">
                            Forecast {formatCount(resultForecast)}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">
                        {fmtUsdOrDash(cpr, 2)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      <EditableNoteBlock
        slug={slug}
        noteKey="creative"
        notes={notes}
        editable={editable}
      />
      <EditableNoteBlock
        slug={slug}
        noteKey="audience"
        notes={notes}
        editable={editable}
      />
      <EditableNoteBlock
        slug={slug}
        noteKey="recommendations"
        notes={notes}
        editable={editable}
      />

      <footer className="mt-10 border-t border-border pt-4 text-xs text-secondary print:mt-6">
        <p>
          Red Light Creative · Read-only performance snapshot.{" "}
          <sup>*</sup> Meta streams are modeled estimates; Spotify attributed
          streams are measured. Week 1 comparisons use Days 1 to 7 only.
        </p>
      </footer>
    </div>
  );
}

function positiveOrNull(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value) || value === 0) return null;
  return value;
}
