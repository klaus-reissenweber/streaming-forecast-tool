import { AdReportCharts } from "@/components/report/AdReportCharts";
import { SaveAsPdfButton } from "@/components/report/SaveAsPdfButton";
import type { AdReportMetricsSnapshot } from "@/lib/ad-report/types";
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

function streamsSuffix(label: "measured" | "estimate" | "n/a" | null): string {
  if (label === "estimate") return " (estimate)";
  if (label === "measured") return "";
  return "";
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

      {/* Headline: forecast vs actual */}
      <section
        className="mt-8 rounded-instrument border border-border bg-surface p-6 sm:p-8"
        aria-label="Streaming forecast vs actual"
      >
        <p className="text-label text-muted">Streaming forecast vs actual</p>
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

      {/* Paid KPIs */}
      <section className="mt-6" aria-label="Paid KPIs">
        <h2 className="font-serif text-section text-foreground">Paid KPIs</h2>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {[
            { label: "Spend", value: formatUsd(paid.totalSpend, 0) },
            {
              label: "Attr. streams",
              value: formatCount(paid.attributedStreams),
            },
            { label: "Impressions", value: formatCount(paid.impressions) },
            { label: "Reach", value: formatCount(paid.reach) },
            { label: "Clicks", value: formatCount(paid.clicks) },
            {
              label: "Blended CPS",
              value: fmtUsdOrDash(paid.blendedCostPerStream, 2),
            },
          ].map((m) => (
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
              <dd className="font-mono tabular-nums text-foreground">
                {formatCount(metaFunnelComparison.estimatedStreams)}
                <span className="ml-1 text-muted">
                  {metaFunnelComparison.streamsFromMeasuredClicks
                    ? "(estimate · measured clicks × SPL)"
                    : "(estimate · funnel)"}
                </span>
              </dd>
            </div>
            <p className="text-caption text-muted">
              Predicted clicks = (spend ÷ CPC{" "}
              {formatUsd(metaFunnelComparison.cpc, 2)}) × click share{" "}
              {formatPercent(metaFunnelComparison.spotifyClickShare * 100, 0)}
            </p>
          </dl>
        </section>
      ) : null}

      {/* Per-channel */}
      <section className="mt-8" aria-label="Per-channel breakdown">
        <h2 className="font-serif text-section text-foreground">
          Per-channel breakdown
        </h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {channels.length === 0 ? (
            <p className="text-body-sm text-muted">No channel activity.</p>
          ) : (
            channels.map((ch) => (
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
                  <div>
                    <dt className="text-muted">Spend</dt>
                    <dd className="font-mono tabular-nums text-foreground">
                      {formatUsd(ch.spend, 0)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted">
                      Streams
                      {ch.streamsLabel === "estimate" ? " · estimate" : ""}
                      {ch.streamsLabel === "n/a" ? " · n/a" : ""}
                    </dt>
                    <dd className="font-mono tabular-nums text-foreground">
                      {ch.streamsLabel === "n/a"
                        ? "—"
                        : formatCount(ch.streams)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted">Impressions</dt>
                    <dd className="font-mono tabular-nums text-foreground">
                      {ch.impressions > 0 ? formatCount(ch.impressions) : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted">Reach</dt>
                    <dd className="font-mono tabular-nums text-foreground">
                      {ch.reach > 0 ? formatCount(ch.reach) : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted">Clicks</dt>
                    <dd className="font-mono tabular-nums text-foreground">
                      {ch.clicks > 0 ? formatCount(ch.clicks) : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted">CPS</dt>
                    <dd className="font-mono tabular-nums text-foreground">
                      {fmtUsdOrDash(ch.costPerStream, 2)}
                    </dd>
                  </div>
                </dl>
              </article>
            ))
          )}
        </div>
      </section>

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
                <th className="px-3 py-2 font-normal text-right">Impr.</th>
                <th className="px-3 py-2 font-normal text-right">Reach</th>
                <th className="px-3 py-2 font-normal text-right">Clicks</th>
                <th className="px-3 py-2 font-normal text-right">CPS</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-3 py-4 text-muted"
                  >
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
                    <td className="px-3 py-2 text-right font-mono tabular-nums">
                      {fmtCountOrDash(c.streams)}
                      {c.streamsLabel
                        ? streamsSuffix(c.streamsLabel)
                        : ""}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">
                      {fmtCountOrDash(c.impressions)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">
                      {fmtCountOrDash(c.reach)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">
                      {fmtCountOrDash(c.clicks)}
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

      <section className="mt-8" aria-label="Charts">
        <AdReportCharts
          spendByChannel={snapshot.charts.spendByChannel}
          forecastVsActualDaily={snapshot.charts.forecastVsActualDaily}
        />
      </section>

      <footer className="mt-10 border-t border-border pt-4 text-xs text-muted print:mt-6">
        <p>
          Red Light Creative · Instrument Edition · Read-only performance
          snapshot. Meta streams are modeled estimates; Spotify attributed
          streams are measured. Derived (benchmark-filled) values are flagged.
        </p>
      </footer>
    </div>
  );
}
