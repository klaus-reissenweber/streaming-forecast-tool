"use client";

import {
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import { CampaignFlightBands } from "@/components/charts/CampaignFlightBands";
import {
  flightsToChartBands,
  type CampaignFlight,
} from "@/lib/campaign-flights";
import type { AdReportDailyPoint } from "@/lib/ad-report/types";
import { formatCompactNumber, formatUsd } from "@/lib/format";

const SPEND_COLORS = ["#5a6600", "#8fa800", "#12151a", "#868e98"];

export function SpendByChannelChart({
  spendByChannel,
  compact = false,
}: {
  spendByChannel: Array<{ channel: string; spend: number; budget?: number }>;
  compact?: boolean;
}) {
  const data = spendByChannel.filter((d) => d.spend > 0);
  const total = data.reduce((s, d) => s + d.spend, 0);

  const chart = (
    <div className={compact ? "h-40 w-full" : "mt-3 h-56 w-full"}>
      {data.length === 0 ? (
        <p className="text-body-sm text-secondary">No paid spend recorded.</p>
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="spend"
              nameKey="channel"
              cx="50%"
              cy="50%"
              innerRadius={compact ? 36 : 48}
              outerRadius={compact ? 58 : 80}
              paddingAngle={2}
              isAnimationActive={false}
            >
              {data.map((entry, index) => (
                <Cell
                  key={entry.channel}
                  fill={SPEND_COLORS[index % SPEND_COLORS.length]}
                  stroke="transparent"
                />
              ))}
            </Pie>
            <Tooltip
              formatter={(value, name) => {
                const n = Number(value);
                const pct = total > 0 ? Math.round((n / total) * 100) : 0;
                return [`${formatUsd(n, 0)} (${pct}%)`, String(name)];
              }}
              contentStyle={{
                borderRadius: 4,
                borderColor: "#e2e6eb",
                fontSize: 12,
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      )}
    </div>
  );

  const legend = (
    <ul className={compact ? "mt-2 space-y-1" : "mt-3 space-y-1"}>
      {data.map((entry, index) => {
        const pct = total > 0 ? Math.round((entry.spend / total) * 100) : 0;
        return (
          <li
            key={entry.channel}
            className="flex items-center justify-between gap-2 text-caption"
          >
            <span className="inline-flex items-center gap-1.5 text-secondary">
              <span
                className="size-2 shrink-0 rounded-tag"
                style={{ backgroundColor: SPEND_COLORS[index % SPEND_COLORS.length] }}
                aria-hidden="true"
              />
              {entry.channel}
            </span>
            <span className="tabular-nums text-foreground">
              {formatUsd(entry.spend, 0)}
              {entry.budget != null && entry.budget > 0
                ? ` / ${formatUsd(entry.budget, 0)}`
                : ` (${pct}%)`}
            </span>
          </li>
        );
      })}
    </ul>
  );

  if (compact) {
    return (
      <section aria-label="Media mix">
        <h2 className="text-section font-semibold text-foreground">Media mix</h2>
        {chart}
        {legend}
      </section>
    );
  }

  return (
    <section className="rounded-instrument border border-border bg-surface p-4">
      <h2 className="text-section font-semibold text-foreground">
        Spend by channel
      </h2>
      {chart}
      {legend}
    </section>
  );
}

export function ForecastVsActualChart({
  forecastVsActualDaily,
  releaseDate,
  campaignFlights = [],
}: {
  forecastVsActualDaily: AdReportDailyPoint[];
  releaseDate?: string;
  campaignFlights?: CampaignFlight[];
}) {
  const flightBands =
    releaseDate != null
      ? flightsToChartBands(campaignFlights, releaseDate)
      : [];
  const axisWidth = 44;
  const rightMargin = 8;

  return (
    <section className="rounded-instrument border border-border bg-surface p-4">
      <h2 className="text-section font-semibold text-foreground">
        Forecast vs actual streams
      </h2>
      <div className="mt-3 h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={forecastVsActualDaily}
            margin={{ top: 8, right: rightMargin, left: 0, bottom: 0 }}
          >
            <CartesianGrid stroke="#eceef2" vertical={false} />
            <XAxis
              dataKey="day"
              ticks={[1, 7, 14, 21, 28]}
              tick={{ fill: "#868e98", fontSize: 11 }}
              axisLine={{ stroke: "#e2e6eb" }}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: "#868e98", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v: number) => formatCompactNumber(v)}
              width={44}
            />
            <Tooltip
              formatter={(value, name) => [
                formatCompactNumber(Number(value)),
                name === "forecastStreams" ? "Forecast" : "Actual",
              ]}
              labelFormatter={(day) => `Day ${day}`}
              contentStyle={{
                borderRadius: 4,
                borderColor: "#e2e6eb",
                fontSize: 12,
              }}
            />
            <Legend
              formatter={(value) =>
                value === "forecastStreams" ? "Forecast" : "Actual"
              }
              wrapperStyle={{ fontSize: 12 }}
            />
            <Line
              type="monotone"
              dataKey="forecastStreams"
              stroke="#8fa800"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="actualStreams"
              stroke="#12151a"
              strokeWidth={2}
              connectNulls={false}
              dot={{ r: 2, fill: "#12151a" }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <CampaignFlightBands
        bands={flightBands}
        axisWidth={axisWidth}
        rightMargin={rightMargin}
      />
    </section>
  );
}

/** @deprecated Prefer SpendByChannelChart + ForecastVsActualChart. */
export function AdReportCharts({
  spendByChannel,
  forecastVsActualDaily,
}: {
  spendByChannel: Array<{ channel: string; spend: number }>;
  forecastVsActualDaily: AdReportDailyPoint[];
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-2 print:grid-cols-2">
      <SpendByChannelChart spendByChannel={spendByChannel} />
      <ForecastVsActualChart forecastVsActualDaily={forecastVsActualDaily} />
    </div>
  );
}
