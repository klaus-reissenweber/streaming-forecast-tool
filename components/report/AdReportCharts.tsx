"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { AdReportDailyPoint } from "@/lib/ad-report/types";
import { formatCompactNumber, formatUsd } from "@/lib/format";

export function AdReportCharts({
  spendByChannel,
  forecastVsActualDaily,
}: {
  spendByChannel: Array<{ channel: string; spend: number }>;
  forecastVsActualDaily: AdReportDailyPoint[];
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-2 print:grid-cols-2">
      <section className="rounded-instrument border border-border bg-surface p-4">
        <h2 className="font-serif text-section text-foreground">
          Spend by channel
        </h2>
        <div className="mt-3 h-56 w-full">
          {spendByChannel.length === 0 ? (
            <p className="text-body-sm text-muted">No paid spend recorded.</p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={spendByChannel} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="#eceef2" vertical={false} />
                <XAxis
                  dataKey="channel"
                  tick={{ fill: "#868e98", fontSize: 11 }}
                  axisLine={{ stroke: "#e2e6eb" }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: "#868e98", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v: number) => formatUsd(v, 0)}
                  width={56}
                />
                <Tooltip
                  formatter={(value) => formatUsd(Number(value), 0)}
                  contentStyle={{
                    borderRadius: 4,
                    borderColor: "#e2e6eb",
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="spend" fill="#5a6600" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>

      <section className="rounded-instrument border border-border bg-surface p-4">
        <h2 className="font-serif text-section text-foreground">
          Forecast vs actual streams
        </h2>
        <div className="mt-3 h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={forecastVsActualDaily}
              margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
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
      </section>
    </div>
  );
}
