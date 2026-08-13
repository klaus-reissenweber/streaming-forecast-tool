import {
  ForecastVsActualChart,
  SpendByChannelChart,
} from "@/components/report/AdReportCharts";
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
  } = snapshot;
  const deltaPositive =
    headline.delta != null ? headline.delta >= 0 : null;
  const savesDeltaPositive =
    headline.savesDelta != null ? headline.savesDelta >= 0 : null;

  const forecastSaves = headline.forecastSaves ?? null;
  const actualSaves = headline.actualSaves ?? null;

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
              {title} · Campaign {campaignWindow.label} · Release{" "}
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

      {/* Headline: forecast vs actual streams */}
      <section
        className="mt-8 rounded-instrument border border-border bg-surface p-6 sm:p-8"
        aria-label="Streaming forecast vs actual"
      >
        <p className="text-label text-muted">Forecast vs actual streams</p>
        <div className="mt-4 grid gap-6 sm:grid-cols-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted">
              Locked forecast
            </p>
            <p className="mt-1 font-serif text-4xl font-semibold tabular-nums text-foreground sm:text-5xl">
              {formatCompactNumber(headline.forecastStreams)}
            </p>
            <p className="mt-1 text-body-sm text-secondary">
              {formatCount(headline.forecastStreams)} streams
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted">
              Actual to date
              {headline.actualDaysEntered > 0
                ? ` · ${headline.actualDaysEntered}d entered`
                : ""}
            </p>
            <p className="mt-1 font-serif text-4xl font-semibold tabular-nums text-foreground sm:text-5xl">
              {headline.actualStreams == null
                ? "—"
                : formatCompactNumber(headline.actualStreams)}
            </p>
            <p className="mt-1 text-body-sm text-secondary">
              {headline.actualStreams == null
                ? "No daily data yet"
                : `${formatCount(headline.actualStreams)} streams`}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted">
              vs forecast
            </p>
            <p
              className={`mt-1 font-serif text-4xl font-semibold tabular-nums sm:text-5xl ${
                deltaPositive == null
                  ? "text-muted"
                  : deltaPositive
                    ? "text-semantic-positive"
                    : "text-semantic-negative"
              }`}
            >
              {headline.pctOfForecast == null
                ? "—"
                : formatPercent(headline.pctOfForecast, 0)}
            </p>
            <p className="mt-1 text-body-sm text-secondary">
              {headline.delta == null
                ? "Awaiting actuals"
                : `${headline.delta >= 0 ? "+" : ""}${formatCount(headline.delta)} streams`}
            </p>
          </div>
        </div>
        <MetricFoot />
      </section>

      {/* Saves: locked forecast vs Spotify campaign saves when captured */}
      {forecastSaves != null ? (
        <section
          className="mt-6 rounded-instrument border border-border bg-surface p-6"
          aria-label="Saves forecast vs actual"
        >
          <p className="text-label text-muted">Forecast vs actual saves</p>
          <div className="mt-4 grid gap-6 sm:grid-cols-3">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted">
                Locked forecast
              </p>
              <p className="mt-1 font-serif text-3xl font-semibold tabular-nums text-foreground">
                {formatCompactNumber(forecastSaves)}
              </p>
              <p className="mt-1 text-body-sm text-secondary">
                {formatCount(forecastSaves)} saves
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted">
                Campaign actual
              </p>
              <p className="mt-1 font-serif text-3xl font-semibold tabular-nums text-foreground">
                {actualSaves == null ? "—" : formatCompactNumber(actualSaves)}
              </p>
              <p className="mt-1 text-body-sm text-secondary">
                {actualSaves == null
                  ? "No Spotify saves captured"
                  : `${formatCount(actualSaves)} saves`}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted">
                vs forecast
              </p>
              <p
                className={`mt-1 font-serif text-3xl font-semibold tabular-nums ${
                  savesDeltaPositive == null
                    ? "text-muted"
                    : savesDeltaPositive
                      ? "text-semantic-positive"
                      : "text-semantic-negative"
                }`}
              >
                {headline.savesPctOfForecast == null
                  ? "—"
                  : formatPercent(headline.savesPctOfForecast, 0)}
              </p>
              <p className="mt-1 text-body-sm text-secondary">
                {headline.savesDelta == null
                  ? "Awaiting campaign saves"
                  : `${headline.savesDelta >= 0 ? "+" : ""}${formatCount(headline.savesDelta)} saves`}
              </p>
            </div>
          </div>
        </section>
      ) : null}

      <section className="mt-6" aria-label="Forecast vs actual chart">
        <ForecastVsActualChart
          forecastVsActualDaily={snapshot.charts.forecastVsActualDaily}
        />
      </section>

      {/* Paid KPIs */}
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
          <h2 className="font-serif text-section text-foreground">
            Meta funnel comparison
          </h2>
          <p className="mt-1 text-body-sm text-secondary">
            Predicted vs measured at the Spotify-click level (same units).
          </p>
          <dl className="mt-3 space-y-3 rounded-instrument border border-border bg-surface p-4 text-body-sm">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <dt className="text-muted">Spotify clicks</dt>
              <dd className="font-mono tabular-nums text-foreground">
                {formatCount(metaFunnelComparison.predictedSpotifyClicks)}
                {" → "}
                {metaFunnelComparison.measuredSpotifyClicks == null
                  ? "—"
                  : formatCount(metaFunnelComparison.measuredSpotifyClicks)}
              </dd>
            </div>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <dt className="text-muted">Est. streams</dt>
              <dd className="font-mono text-foreground">
                <MetricValue
                  value={metaFunnelComparison.estimatedStreams}
                  estimate
                />
              </dd>
            </div>
            <p className="text-caption text-muted">
              Predicted clicks = (spend ÷ CPC{" "}
              {formatUsd(metaFunnelComparison.cpc, 2)}) × click share{" "}
              {formatPercent(metaFunnelComparison.spotifyClickShare * 100, 0)}
              {metaFunnelComparison.streamsFromMeasuredClicks
                ? " · streams from measured clicks × SPL"
                : " · streams from funnel"}
            </p>
          </dl>
        </section>
      ) : null}

      {/* Spotify channels — field set: spend, reach, clicks, listeners, streams, saves, CPS */}
      {spotifyChannels.length > 0 ? (
        <section className="mt-8" aria-label="Spotify channels">
          <h2 className="font-serif text-section text-foreground">
            Spotify
          </h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
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

      {/* Meta channels — field set: spend, impressions, clicks, streams, linkfire, CPS */}
      {metaChannels.length > 0 ? (
        <section className="mt-8" aria-label="Meta channels">
          <h2 className="font-serif text-section text-foreground">Meta</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
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
                    label="Linkfire visits"
                    value={ch.linkfireVisits}
                  />
                  <ChannelMetric
                    label="Linkfire Spotify clicks"
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

      {/* Per-campaign table */}
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
