"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ReleasePhase } from "@/lib/build-release-view-model";
import { formatCompactNumber } from "@/lib/format";
import type { StreamCurveForecast } from "@/lib/forecast";

export interface StreamCurveChartProps {
  streamCurve: StreamCurveForecast;
  actualStreamsByDay: (number | null)[];
  phase: ReleasePhase;
}

interface ChartRow {
  day: number;
  expected: number;
  actual: number | null;
}

function buildChartRows(
  streamCurve: StreamCurveForecast,
  actualStreamsByDay: (number | null)[],
): ChartRow[] {
  return streamCurve.dailyStreams.map((expected, index) => ({
    day: index + 1,
    expected,
    actual: actualStreamsByDay[index] ?? null,
  }));
}

function formatAxisTick(value: number): string {
  return formatCompactNumber(value);
}

export function StreamCurveChart({
  streamCurve,
  actualStreamsByDay,
  phase,
}: StreamCurveChartProps) {
  const chartData = buildChartRows(streamCurve, actualStreamsByDay);
  const hasActuals = actualStreamsByDay.some((value) => value != null);

  return (
    <section className="rounded-lg border border-stone-200 bg-white p-5">
      <h2 className="text-lg font-semibold text-stone-900">Stream curve</h2>
      <p className="mt-1 text-sm text-stone-500">
        Daily streams vs locked forecast median template (D1–D28)
      </p>
      {phase === "pre-release" || !hasActuals ? (
        <p className="mt-2 text-xs text-stone-400">
          Expected curve from locked forecast. Actual daily streams overlay once
          data is entered.
        </p>
      ) : null}

      <div className="mt-5 h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="#e7e5e4" strokeDasharray="3 3" />
            <XAxis
              dataKey="day"
              tick={{ fill: "#78716c", fontSize: 11 }}
              tickFormatter={(day) => `D${day}`}
              interval={2}
            />
            <YAxis
              tick={{ fill: "#78716c", fontSize: 11 }}
              tickFormatter={formatAxisTick}
              width={48}
            />
            <Tooltip
              formatter={(value, name) => {
                if (value == null || typeof value !== "number") {
                  return ["n/a", String(name)];
                }
                return [value.toLocaleString("en-US"), String(name)];
              }}
              labelFormatter={(day) => `Day ${day}`}
            />
            <Legend />
            <Line
              type="monotone"
              dataKey="expected"
              name="Expected"
              stroke="#c2410c"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
            {hasActuals ? (
              <Line
                type="monotone"
                dataKey="actual"
                name="Actual"
                stroke="#1c1917"
                strokeWidth={2}
                dot={{ r: 2, fill: "#1c1917" }}
                connectNulls={false}
              />
            ) : null}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
