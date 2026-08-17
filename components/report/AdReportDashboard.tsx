import {
  ForecastVsActualChart,
  SpendByChannelChart,
} from "@/components/report/AdReportCharts";
import {
  MetaLogo,
  SpotifyLogo,
} from "@/components/report/brand/PlatformLogos";
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
  d28ActualFromDaily,
  variancePct,
  week1FromDaily,
} from "@/lib/ad-report/windows";
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

function looksLikeCampaignUid(value: string): boolean {
  if (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
  ) {
    return true;
  }
  return !/\s/.test(value) && value.length >= 12 && /[0-9]/.test(value);
}

function displayCampaignName(row: AdReportCampaignRow): string {
  if (row.campaignName && !looksLikeCampaignUid(row.campaignName)) {
    return row.campaignName;
  }
  if (row.format === "marquee") return "Marquee";
  if (row.format === "showcase") return "Showcase";
  if (row.objective === "awareness") return "Meta awareness";
  if (row.objective === "traffic") return "Meta traffic";
  return row.platform === "spotify" ? "Spotify" : "Meta";
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
  const resultLabel =
    c.resultLabel ??
    (c.platform === "spotify" ? "Streams" : "Spotify clicks");
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
            {campaign.streamsLabel === "estimate" ||
            campaign.derivedFields.length > 0 ? (
              <StatusPill tone="warning">Derived</StatusPill>
            ) : isSpotify ? (
              <StatusPill tone="neutral">Measured</StatusPill>
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
          <span className="text-sm text-muted">—</span>
        )}
      </div>

      <dl className="mt-3 space-y-2 text-sm">
        <div>
          <dt className="text-caption text-muted">Spent</dt>
          <dd className="font-mono tabular-nums text-foreground">
            {formatUsd(campaign.spend, 0)}
            {campaign.budget != null && campaign.budget > 0 ? (
              <span className="text-muted">
                {" / "}
                {formatUsd(campaign.budget, 0)}
              </span>
            ) : null}
          </dd>
        </div>
        <div>
          <dt className="text-caption text-muted">{resultLabel}</dt>
          <dd className="font-mono tabular-nums text-foreground">
            {resultActual == null ? "—" : formatCount(resultActual)}
          </dd>
          {resultForecast != null ? (
            <dd className="text-caption text-secondary">
              Forecast {formatCount(resultForecast)}
            </dd>
          ) : null}
        </div>
        <div>
          <dt className="text-caption text-muted">Cost per result</dt>
          <dd className="font-mono tabular-nums text-foreground">
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
    return <span className="text-muted">—</span>;
  }
  return (
    <span className="inline-flex flex-col items-start">
      <span className="tabular-nums">
        {formatCount(value)}
        {estimate ? (
          <sup
            className="ml-0.5 text-[0.65em] font-normal text-muted"
            title="Modeled estimate"
          >
            *
          </sup>
        ) : null}
      </span>
      {estimate ? (
        <span className="text-[10px] leading-tight text-muted">estimate</span>
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
      <dt className="text-muted">{label}</dt>
      <dd className="font-mono text-foreground">
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
      <p className="text-[10px] font-medium uppercase tracking-[0.06em] text-muted">
        {label}
      </p>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-canvas">
        <div
          className="h-full rounded-full bg-accent"
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
      className="flex size-16 shrink-0 items-center justify-center rounded-instrument bg-canvas font-serif text-2xl font-semibold text-foreground"
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
}: {
  title: string;
  snapshot: AdReportMetricsSnapshot;
  generatedAt: string;
  backHref?: string | null;
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
  const budgetTotal = paid.budgetTotal ?? 0;
  const spendPct =
    budgetTotal > 0 ? (paid.totalSpend / budgetTotal) * 100 : 100;

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
                    <p className="text-caption text-muted">{release.artistName}</p>
                    <h1 className="font-serif text-xl font-semibold text-foreground">
                      {release.trackName}
                    </h1>
                  </div>
                  {release.objectiveLabel ? (
                    <StatusPill tone="info">{release.objectiveLabel}</StatusPill>
                  ) : null}
                </div>
                <p className="mt-1 text-caption text-muted">
                  Release {formatReleaseDate(release.releaseDate)} · Snapshot{" "}
                  {formatLockTimestamp(generatedAt)}
                </p>
              </div>
            </div>

            <div className="mt-4 space-y-3">
              {campaignWindow.startDate && campaignWindow.endDate ? (
                <ProgressBar
                  label="Campaign duration"
                  startLabel={formatReleaseDate(campaignWindow.startDate)}
                  endLabel={formatReleaseDate(campaignWindow.endDate)}
                  pct={rangeFillPct(
                    campaignWindow.startDate,
                    campaignWindow.endDate,
                  )}
                />
              ) : null}
              <ProgressBar
                label="Spend vs budget"
                startLabel={formatUsd(paid.totalSpend, 0)}
                endLabel={
                  budgetTotal > 0
                    ? formatUsd(budgetTotal, 0)
                    : formatUsd(paid.totalSpend, 0)
                }
                pct={spendPct}
              />
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

      <section className="mt-6" aria-label="Week 1 forecast vs week 1 actual">
        <h2 className="text-section font-semibold text-foreground">
          Week 1 forecast vs week 1 actual
        </h2>
        <p className="mt-1 text-sm text-muted">
          Both sides cover D1–D7
          {week1Days > 0 ? ` · ${week1Days} day${week1Days === 1 ? "" : "s"} entered` : ""}.
        </p>
        <dl className="mt-3 grid gap-3 sm:grid-cols-3">
          <div className="rounded-instrument border border-border bg-surface px-4 py-3">
            <dt className="text-label text-muted">Week 1 forecast</dt>
            <dd className="mt-1 font-mono text-2xl font-semibold tabular-nums text-foreground">
              {formatCompactNumber(week1Forecast)}
            </dd>
          </div>
          <div className="rounded-instrument border border-border bg-surface px-4 py-3">
            <dt className="text-label text-muted">Week 1 actual</dt>
            <dd className="mt-1 font-mono text-2xl font-semibold tabular-nums text-foreground">
              {week1Actual == null ? "—" : formatCompactNumber(week1Actual)}
            </dd>
          </div>
          <div className="rounded-instrument border border-border bg-surface px-4 py-3">
            <dt className="text-label text-muted">Variance</dt>
            <dd
              className={`mt-1 font-mono text-2xl font-semibold tabular-nums ${
                streamsVariance == null
                  ? "text-muted"
                  : streamsVariance >= 0
                    ? "text-semantic-positive"
                    : "text-semantic-negative"
              }`}
            >
              {formatSignedPct(streamsVariance, 0)}
            </dd>
          </div>
        </dl>
        {d28.actualStreams != null ? (
          <p className="mt-3 text-sm text-muted">
            D1–D28 actual total{" "}
            <span className="font-mono text-foreground">
              {formatCompactNumber(d28.actualStreams)}
            </span>
            {d28.daysEntered > 0
              ? ` · ${d28.daysEntered} day${d28.daysEntered === 1 ? "" : "s"} entered`
              : ""}
            . Not compared to the week-1 forecast.
          </p>
        ) : null}
      </section>

      {forecastSaves != null && !savesArePaid ? (
        <section className="mt-6" aria-label="Week 1 saves">
          <h2 className="text-section font-semibold text-foreground">
            Week 1 saves
          </h2>
          <dl className="mt-3 grid gap-3 sm:grid-cols-3">
            <div className="rounded-instrument border border-border bg-surface px-4 py-3">
              <dt className="text-label text-muted">Week 1 forecast</dt>
              <dd className="mt-1 font-mono text-2xl font-semibold tabular-nums">
                {formatCompactNumber(forecastSaves)}
              </dd>
            </div>
            <div className="rounded-instrument border border-border bg-surface px-4 py-3">
              <dt className="text-label text-muted">Week 1 actual</dt>
              <dd className="mt-1 font-mono text-2xl font-semibold tabular-nums">
                {actualSaves == null ? "—" : formatCompactNumber(actualSaves)}
              </dd>
            </div>
            <div className="rounded-instrument border border-border bg-surface px-4 py-3">
              <dt className="text-label text-muted">Variance</dt>
              <dd
                className={`mt-1 font-mono text-2xl font-semibold tabular-nums ${
                  savesVariance == null
                    ? "text-muted"
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

      <section className="mt-6" aria-label="Aggregated campaign metrics">
        <h2 className="text-section font-semibold text-foreground">
          Aggregated campaign metrics
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
                <p className="text-label text-muted">{item.label}</p>
                <p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-foreground">
                  {item.value}
                </p>
              </div>
            ))}
        </div>
      </section>

      <section className="mt-6" aria-label="Forecast vs actual chart">
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
        <section className="mt-8" aria-label="Meta funnel comparison">
          <div className="mb-3 flex items-center gap-2">
            <MetaLogo className="h-5 w-auto" />
            <h2 className="text-section font-semibold text-foreground">
              Meta funnel comparison
            </h2>
          </div>
          <p className="text-sm text-muted">
            Spotify clicks — model prediction vs measured Linkfire clicks.
          </p>
          <dl className="mt-3 grid gap-3 sm:grid-cols-3">
            <div className="rounded-instrument border border-border bg-surface px-4 py-3">
              <dt className="text-label text-muted">Predicted</dt>
              <dd className="mt-1 font-mono text-2xl tabular-nums text-secondary">
                {formatCount(metaFunnelComparison.predictedSpotifyClicks)}
              </dd>
            </div>
            <div className="rounded-instrument border border-border bg-surface px-4 py-3">
              <dt className="text-label text-muted">Measured</dt>
              <dd className="mt-1 font-mono text-2xl font-semibold tabular-nums">
                {metaFunnelComparison.measuredSpotifyClicks == null
                  ? "—"
                  : formatCount(metaFunnelComparison.measuredSpotifyClicks)}
              </dd>
            </div>
            <div className="rounded-instrument border border-border bg-surface px-4 py-3">
              <dt className="text-label text-muted">Variance</dt>
              <dd
                className={`mt-1 font-mono text-2xl font-semibold tabular-nums ${
                  metaFunnelComparison.clicksVariancePct == null
                    ? "text-muted"
                    : metaFunnelComparison.clicksVariancePct >= 0
                      ? "text-semantic-positive"
                      : "text-semantic-negative"
                }`}
              >
                {formatSignedPct(metaFunnelComparison.clicksVariancePct, 0)}
              </dd>
            </div>
          </dl>
        </section>
      ) : null}

      {spotifyChannels.length > 0 || metaChannels.length > 0 ? (
        <div
          className={
            bothPlatforms
              ? "mt-8 grid gap-6 lg:grid-cols-2 print:grid-cols-2"
              : "mt-8"
          }
        >
          {spotifyChannels.length > 0 ? (
            <section aria-label="Spotify channels">
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
                        {ch.label}
                      </h3>
                      {ch.hasDerivedValues ? (
                        <StatusPill tone="warning">Derived</StatusPill>
                      ) : (
                        <StatusPill tone="neutral">Measured</StatusPill>
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
            <section aria-label="Meta channels">
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
                        {ch.label}
                      </h3>
                      {ch.streamsLabel === "estimate" || ch.hasDerivedValues ? (
                        <StatusPill tone="warning">Derived</StatusPill>
                      ) : (
                        <StatusPill tone="neutral">Measured</StatusPill>
                      )}
                    </div>
                    <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-body-sm">
                      <ChannelMetric label="Spend" value={ch.spend} money />
                      <ChannelMetric
                        label="Streams"
                        value={ch.streamsLabel === "n/a" ? null : ch.streams}
                        estimate={ch.streamsLabel === "estimate"}
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
      ) : null}

      {hasCreatives && campaignsWithCreatives.length > 0 ? (
        <section className="mt-8" aria-label="Creatives by campaign">
          <h2 className="text-section font-semibold text-foreground">
            Creatives
          </h2>
          <p className="mt-1 text-sm text-muted">
            Performance next to the creative that produced it.
          </p>
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
                  <p className="text-caption text-muted">
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
                        <p className="mt-1 truncate text-caption text-muted">
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

      <section className="mt-8" aria-label="Marketing objective compare">
        <h2 className="text-section font-semibold text-foreground">
          Marketing objective compare
        </h2>
        <p className="mt-1 text-sm text-muted">
          How campaign goals performed at a glance.
        </p>
        <ul className="mt-3 divide-y divide-border-subtle overflow-hidden rounded-instrument border border-border bg-surface md:hidden print:hidden">
          {visibleCampaigns.length === 0 ? (
            <li className="px-4 py-4 text-muted">No campaigns in snapshot.</li>
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
              <tr className="border-b border-border text-muted">
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
                  <td colSpan={6} className="px-3 py-4 text-muted">
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
                        {c.streamsLabel === "estimate" ||
                        c.derivedFields.length > 0 ? (
                          <span className="ml-2">
                            <StatusPill tone="warning">Derived</StatusPill>
                          </span>
                        ) : c.platform === "spotify" ? (
                          <span className="ml-2">
                            <StatusPill tone="neutral">Measured</StatusPill>
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
                          <span className="text-muted">—</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-right font-mono tabular-nums">
                        {formatUsd(c.spend, 0)}
                        {c.budget != null && c.budget > 0 ? (
                          <span className="text-muted">
                            {" / "}
                            {formatUsd(c.budget, 0)}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-3 py-3">
                        <p className="text-caption text-muted">{resultLabel}</p>
                        <p className="font-mono tabular-nums text-foreground">
                          {resultActual == null
                            ? "—"
                            : formatCount(resultActual)}
                          {resultForecast != null ? (
                            <span className="text-muted">
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
                      <td className="px-3 py-3 text-right font-mono tabular-nums">
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

      <footer className="mt-10 border-t border-border pt-4 text-xs text-muted print:mt-6">
        <p>
          Red Light Creative · Read-only performance snapshot.{" "}
          <sup>*</sup> Meta streams are modeled estimates; Spotify attributed
          streams are measured. Week-1 comparisons use D1–D7 only.
        </p>
      </footer>
    </div>
  );
}

function positiveOrNull(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value) || value === 0) return null;
  return value;
}
