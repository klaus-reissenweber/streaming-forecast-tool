import {
  ForecastVsActualChart,
  SpendByChannelChart,
} from "@/components/report/AdReportCharts";
import {
  MetaLogo,
  SpotifyLogo,
} from "@/components/report/brand/PlatformLogos";
import { SaveAsPdfButton } from "@/components/report/SaveAsPdfButton";
import type {
  AdReportChannelSnapshot,
  AdReportMetricsSnapshot,
} from "@/lib/ad-report/types";
import {
  formatCompactNumber,
  formatCount,
  formatLockTimestamp,
  formatPercent,
  formatReleaseDate,
  formatUsd,
} from "@/lib/format";

function MetricFoot() {
  return (
    <div className="instrument-metric-foot" aria-hidden="true">
      {Array.from({ length: 8 }, (_, index) => (
        <span key={index} />
      ))}
    </div>
  );
}

function fmtUsdOrDash(v: number | null | undefined, decimals = 2): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return formatUsd(v, decimals);
}

function fmtCountOrDash(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return formatCount(v);
}

function formatSignedPct(v: number | null | undefined, decimals = 0): string {
  if (v == null || !Number.isFinite(v)) return "—";
  const rounded = Number(v.toFixed(decimals));
  const sign = rounded > 0 ? "+" : "";
  return `${sign}${formatPercent(rounded, decimals)}`;
}

/** Show captured metrics only — never a bare 0 for uncaptured fields. */
function MetricValue({
  value,
  estimate,
}: {
  value: number | null | undefined;
  estimate?: boolean;
}) {
  if (value == null || !Number.isFinite(value)) {
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
  if (value == null || !Number.isFinite(value)) return null;
  return (
    <div>
      <dt className="text-muted">{label}</dt>
      <dd className="font-mono text-foreground">
        {money ? (
          formatUsd(value, label === "Spend" ? 0 : 2)
        ) : (
          <MetricValue value={value} estimate={estimate} />
        )}
      </dd>
    </div>
  );
}

/**
 * Labeled predicted/forecast vs actual comparison.
 * Measured/actual is emphasized; model/forecast stays secondary.
 */
function LabeledComparison({
  title,
  predictedLabel,
  predictedValue,
  actualLabel,
  actualValue,
  actualEmpty,
  variancePct,
  predictedCaption,
  predictedTone = "model",
}: {
  title: string;
  predictedLabel: string;
  predictedValue: string;
  actualLabel: string;
  actualValue: string;
  actualEmpty?: boolean;
  variancePct: number | null;
  predictedCaption?: string;
  predictedTone?: "model" | "forecast";
}) {
  const variancePositive =
    variancePct != null ? variancePct >= 0 : null;

  return (
    <section
      className="rounded-instrument border border-border bg-surface p-6"
      aria-label={title}
    >
      <p className="text-label text-muted">{title}</p>
      <dl className="mt-4 space-y-4">
        <div
          className={
            predictedTone === "model"
              ? "rounded border border-border-subtle bg-canvas/60 px-3 py-3"
              : "px-0 py-0"
          }
        >
          <dt className="text-xs uppercase tracking-wide text-muted">
            {predictedLabel}
          </dt>
          <dd
            className={`mt-1 font-serif tabular-nums ${
              predictedTone === "model"
                ? "text-2xl font-medium text-secondary sm:text-3xl"
                : "text-3xl font-semibold text-foreground sm:text-4xl"
            }`}
          >
            {predictedValue}
          </dd>
          {predictedCaption ? (
            <p className="mt-1 text-caption text-muted">{predictedCaption}</p>
          ) : null}
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-muted">
            {actualLabel}
          </dt>
          <dd
            className={`mt-1 font-serif font-semibold tabular-nums ${
              actualEmpty
                ? "text-3xl text-muted sm:text-4xl"
                : "text-3xl text-foreground sm:text-4xl"
            }`}
          >
            {actualValue}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-muted">
            Variance
          </dt>
          <dd
            className={`mt-1 font-serif text-3xl font-semibold tabular-nums sm:text-4xl ${
              variancePositive == null
                ? "text-muted"
                : variancePositive
                  ? "text-semantic-positive"
                  : "text-semantic-negative"
            }`}
          >
            {formatSignedPct(variancePct, 0)}
          </dd>
        </div>
      </dl>
    </section>
  );
}

function isSpotifyChannel(id: AdReportChannelSnapshot["id"]): boolean {
  return id === "marquee" || id === "showcase";
}

function isMetaChannel(id: AdReportChannelSnapshot["id"]): boolean {
  return id === "meta_traffic" || id === "meta_awareness";
}

export function AdReportDashboard({
  title,
  snapshot,
  generatedAt,
}: {
  title: string;
  snapshot: AdReportMetricsSnapshot;
  generatedAt: string;
}) {
  const {
    headline,
    paid,
    release,
    campaignWindow,
    channels,
    campaigns,
    metaFunnelComparison = null,
    hasCreatives = false,
  } = snapshot;

  const forecastSaves = headline.forecastSaves ?? null;
  const actualSaves = headline.actualSaves ?? null;
  const streamsVariance =
    headline.variancePct ??
    (headline.pctOfForecast != null && headline.actualStreams != null
      ? headline.pctOfForecast - 100
      : null);
  const savesVariance =
    headline.savesVariancePct ??
    (headline.savesPctOfForecast != null && actualSaves != null
      ? headline.savesPctOfForecast - 100
      : null);

  const paidKpis: Array<{ label: string; value: string }> = [
    { label: "Spend", value: formatUsd(paid.totalSpend, 0) },
    {
      label: "Attr. streams",
      value: formatCount(paid.attributedStreams),
    },
  ];
  if (paid.impressions != null) {
    paidKpis.push({
      label: "Impressions",
      value: formatCount(paid.impressions),
    });
  }
  if (paid.reach != null) {
    paidKpis.push({ label: "Reach", value: formatCount(paid.reach) });
  }
  if (paid.clicks != null) {
    paidKpis.push({ label: "Clicks", value: formatCount(paid.clicks) });
  }
  if (paid.saves != null) {
    paidKpis.push({ label: "Saves", value: formatCount(paid.saves) });
  }
  paidKpis.push({
    label: "Blended CPS",
    value: fmtUsdOrDash(paid.blendedCostPerStream, 2),
  });

  const spotifyChannels = channels.filter((ch) => isSpotifyChannel(ch.id));
  const metaChannels = channels.filter((ch) => isMetaChannel(ch.id));
  const campaignsWithCreatives = campaigns.filter(
    (c) => (c.creatives?.length ?? 0) > 0,
  );

  return (
    <div className="ad-report mx-auto max-w-5xl px-5 py-8 print:max-w-none print:px-0 print:py-0">
      <header className="border-b border-border pb-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="bracket-tag bracket-tag--page">INSTRUMENT EDITION</p>
            <h1 className="mt-2 font-serif text-release-title text-foreground">
              {release.trackName}
              <span className="font-normal text-secondary">
                {" "}
                · {release.artistName}
              </span>
            </h1>
            <p className="mt-1 text-body-sm text-secondary">
              {title}
              {campaignWindow.label
                ? ` · Campaign ${campaignWindow.label}`
                : ""}
              {" · Release "}
              {formatReleaseDate(release.releaseDate)}
            </p>
            <p className="mt-1 text-xs text-muted">
              Snapshot {formatLockTimestamp(generatedAt)} · Paid spend{" "}
              {formatUsd(paid.totalSpend, 0)}
            </p>
          </div>
          <SaveAsPdfButton />
        </div>
      </header>

      <div className="mt-8 grid gap-6 lg:grid-cols-1">
        <LabeledComparison
          title="Streams"
          predictedLabel="Locked forecast"
          predictedValue={formatCompactNumber(headline.forecastStreams)}
          actualLabel="Actually measured"
          actualValue={
            headline.actualStreams == null
              ? "—"
              : formatCompactNumber(headline.actualStreams)
          }
          actualEmpty={headline.actualStreams == null}
          variancePct={streamsVariance}
          predictedTone="forecast"
          predictedCaption={
            headline.actualDaysEntered > 0
              ? `${formatCount(headline.forecastStreams)} forecast · actual covers ${headline.actualDaysEntered}d entered`
              : `${formatCount(headline.forecastStreams)} forecast streams`
          }
        />
      </div>
      <MetricFoot />

      {forecastSaves != null ? (
        <div className="mt-6">
          <LabeledComparison
            title="Saves"
            predictedLabel="Locked forecast"
            predictedValue={formatCompactNumber(forecastSaves)}
            actualLabel="Actually measured"
            actualValue={
              actualSaves == null ? "—" : formatCompactNumber(actualSaves)
            }
            actualEmpty={actualSaves == null}
            variancePct={savesVariance}
            predictedTone="forecast"
            predictedCaption={
              actualSaves == null
                ? "Campaign saves not yet captured"
                : `${formatCount(forecastSaves)} forecast saves`
            }
          />
        </div>
      ) : null}

      <section className="mt-6" aria-label="Forecast vs actual chart">
        <ForecastVsActualChart
          forecastVsActualDaily={snapshot.charts.forecastVsActualDaily}
        />
      </section>

      <section className="mt-6" aria-label="Paid KPIs">
        <h2 className="font-serif text-section text-foreground">Paid KPIs</h2>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {paidKpis.map((m) => (
            <div
              key={m.label}
              className="rounded-instrument border border-border bg-surface px-3 py-3"
            >
              <p className="text-label text-muted">{m.label}</p>
              <p className="mt-1 font-mono text-lg tabular-nums text-foreground">
                {m.value}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-6" aria-label="Spend by channel">
        <SpendByChannelChart
          spendByChannel={snapshot.charts.spendByChannel}
        />
      </section>

      {metaFunnelComparison ? (
        <section className="mt-8" aria-label="Meta funnel comparison">
          <div className="mb-3 flex items-center gap-2">
            <MetaLogo className="h-5 w-auto" />
            <h2 className="font-serif text-section text-foreground">
              Meta funnel comparison
            </h2>
          </div>
          <p className="text-body-sm text-secondary">
            Spotify clicks — model prediction vs measured Linkfire clicks.
          </p>
          <div className="mt-3 rounded-instrument border border-border bg-surface p-4">
            <p className="text-label text-muted">Spotify clicks</p>
            <dl className="mt-3 space-y-4 text-body-sm">
              <div className="rounded border border-border-subtle bg-canvas/60 px-3 py-3">
                <dt className="text-xs uppercase tracking-wide text-muted">
                  Model predicted
                </dt>
                <dd className="mt-1 font-mono text-2xl tabular-nums text-secondary">
                  {formatCount(metaFunnelComparison.predictedSpotifyClicks)}
                </dd>
                <p className="mt-1 text-caption text-muted">
                  Predicted from (spend ÷ CPC{" "}
                  {formatUsd(metaFunnelComparison.cpc, 2)}) × click share{" "}
                  {formatPercent(
                    metaFunnelComparison.spotifyClickShare * 100,
                    0,
                  )}
                </p>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted">
                  Actually measured
                </dt>
                <dd className="mt-1 font-mono text-2xl font-semibold tabular-nums text-foreground">
                  {metaFunnelComparison.measuredSpotifyClicks == null
                    ? "—"
                    : formatCount(metaFunnelComparison.measuredSpotifyClicks)}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted">
                  Variance
                </dt>
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
            {metaFunnelComparison.estimatedStreams > 0 ? (
              <p className="mt-4 border-t border-border-subtle pt-3 text-caption text-muted">
                Est. streams {formatCount(metaFunnelComparison.estimatedStreams)}
                <sup>*</sup>
                {metaFunnelComparison.streamsFromMeasuredClicks
                  ? ` · from measured clicks × ${metaFunnelComparison.streamsPerSpotifyClickEffective.toFixed(2)} streams/click`
                  : " · from funnel estimate"}
              </p>
            ) : null}
          </div>
        </section>
      ) : null}

      {spotifyChannels.length > 0 ? (
        <section className="mt-8" aria-label="Spotify channels">
          <div className="mb-3 flex items-center gap-2">
            <SpotifyLogo className="h-5 w-5" />
            <h2 className="font-serif text-section text-foreground">
              Spotify
            </h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {spotifyChannels.map((ch) => (
              <article
                key={ch.id}
                className="rounded-instrument border border-border bg-surface p-4"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="font-serif text-sm font-semibold text-foreground">
                    {ch.label}
                  </h3>
                  {ch.hasDerivedValues ? (
                    <span className="bracket-tag bracket-tag--warning">
                      DERIVED
                    </span>
                  ) : null}
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
        <section className="mt-8" aria-label="Meta channels">
          <div className="mb-3 flex items-center gap-2">
            <MetaLogo className="h-5 w-auto" />
            <h2 className="font-serif text-section text-foreground">Meta</h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {metaChannels.map((ch) => (
              <article
                key={ch.id}
                className="rounded-instrument border border-border bg-surface p-4"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="font-serif text-sm font-semibold text-foreground">
                    {ch.label}
                  </h3>
                  {ch.hasDerivedValues ? (
                    <span className="bracket-tag bracket-tag--warning">
                      DERIVED
                    </span>
                  ) : null}
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

      {hasCreatives && campaignsWithCreatives.length > 0 ? (
        <section className="mt-8" aria-label="Creatives by campaign">
          <h2 className="font-serif text-section text-foreground">
            Creatives
          </h2>
          <p className="mt-1 text-body-sm text-secondary">
            Performance next to the creative that produced it.
          </p>
          <div className="mt-3 space-y-4">
            {campaignsWithCreatives.map((c, i) => (
              <article
                key={`${c.campaignUid ?? c.campaignName}-${i}`}
                className="rounded-instrument border border-border bg-surface p-4"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="font-serif text-sm font-semibold text-foreground">
                    {c.campaignName}
                  </h3>
                  <p className="text-caption text-muted">
                    {c.channel.replace(/_/g, " ")}
                  </p>
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-body-sm sm:grid-cols-4">
                  <div>
                    <dt className="text-muted">Spend</dt>
                    <dd className="font-mono tabular-nums">
                      {formatUsd(c.spend, 0)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted">Impressions</dt>
                    <dd className="font-mono tabular-nums">
                      {fmtCountOrDash(c.impressions)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted">Clicks</dt>
                    <dd className="font-mono tabular-nums">
                      {fmtCountOrDash(c.clicks)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted">CTR</dt>
                    <dd className="font-mono tabular-nums">
                      {c.ctr == null ? "—" : formatPercent(c.ctr, 2)}
                    </dd>
                  </div>
                </dl>
                <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                  {c.creatives.map((asset) => (
                    <li key={asset.id} className="min-w-0">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={asset.url}
                        alt={asset.caption || "Ad creative"}
                        className="aspect-square w-full rounded border border-border-subtle object-cover bg-canvas"
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

      <section className="mt-8" aria-label="Per-campaign table">
        <h2 className="font-serif text-section text-foreground">
          Per-campaign
        </h2>
        <div className="mt-3 overflow-x-auto rounded-instrument border border-border bg-surface">
          <table className="w-full min-w-[720px] text-left text-body-sm">
            <thead>
              <tr className="border-b border-border text-muted">
                <th className="px-3 py-2 font-normal">Campaign</th>
                <th className="px-3 py-2 font-normal">Channel</th>
                <th className="px-3 py-2 font-normal text-right">Spend</th>
                <th className="px-3 py-2 font-normal text-right">Streams</th>
                <th className="px-3 py-2 font-normal text-right">Reach</th>
                <th className="px-3 py-2 font-normal text-right">Clicks</th>
                <th className="px-3 py-2 font-normal text-right">Saves</th>
                <th className="px-3 py-2 font-normal text-right">CPS</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-4 text-muted">
                    No campaigns in snapshot.
                  </td>
                </tr>
              ) : (
                campaigns.map((c, i) => (
                  <tr
                    key={`${c.campaignName}-${i}`}
                    className={`border-b border-border-subtle last:border-0 ${
                      !c.usableForModeling ? "bg-semantic-warning-bg/40" : ""
                    }`}
                  >
                    <td className="px-3 py-2">
                      <span className="text-foreground">{c.campaignName}</span>
                      {!c.usableForModeling ? (
                        <span className="ml-2 bracket-tag bracket-tag--warning">
                          REPORT-ONLY
                        </span>
                      ) : null}
                      {c.derivedFields.length > 0 ? (
                        <span className="ml-2 bracket-tag bracket-tag--neutral">
                          DERIVED
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-secondary">
                      {c.channel.replace(/_/g, " ")}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">
                      {formatUsd(c.spend, 0)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">
                      <MetricValue
                        value={c.streams}
                        estimate={c.streamsLabel === "estimate"}
                      />
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">
                      {fmtCountOrDash(c.reach)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">
                      {fmtCountOrDash(c.clicks)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">
                      {fmtCountOrDash(c.saves)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">
                      {fmtUsdOrDash(c.costPerStream, 2)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <footer className="mt-10 border-t border-border pt-4 text-xs text-muted print:mt-6">
        <p>
          Red Light Creative · Instrument Edition · Read-only performance
          snapshot. <sup>*</sup> Meta streams are modeled estimates; Spotify
          attributed streams are measured. Derived (benchmark-filled) values are
          flagged. Reach and saves appear only when captured.
        </p>
      </footer>
    </div>
  );
}
