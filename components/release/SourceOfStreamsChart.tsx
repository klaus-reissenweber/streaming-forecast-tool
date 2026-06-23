"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type {
  OtherPctDayPoint,
  ReleasePhase,
} from "@/lib/build-release-view-model";

export interface SourceOfStreamsChartProps {
  otherPctByDay: OtherPctDayPoint[];
  phase: ReleasePhase;
}

function hasOtherPctData(otherPctByDay: OtherPctDayPoint[]): boolean {
  return otherPctByDay.some((point) => point.otherPct != null);
}

export function SourceOfStreamsChart({
  otherPctByDay,
  phase,
}: SourceOfStreamsChartProps) {
  const showChart =
    phase !== "pre-release" && hasOtherPctData(otherPctByDay);

  const chartData = otherPctByDay.map((point) => ({
    day: point.day,
    otherPct: point.otherPct,
  }));

  return (
    <section className="rounded-lg border border-stone-200 bg-white p-5">
      <h2 className="text-lg font-semibold text-stone-900">
        Source of streams: Other %
      </h2>
      <p className="mt-1 text-sm text-stone-500">
        Spotify source-of-streams &quot;Other&quot; share by day (paid conversion
        signal)
      </p>

      {showChart ? (
        <div className="mt-5 h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={chartData}
              margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
            >
              <CartesianGrid stroke="#e7e5e4" strokeDasharray="3 3" />
              <XAxis
                dataKey="day"
                tick={{ fill: "#78716c", fontSize: 11 }}
                tickFormatter={(day) => `D${day}`}
                interval={2}
              />
              <YAxis
                tick={{ fill: "#78716c", fontSize: 11 }}
                tickFormatter={(value) => `${value}%`}
                domain={[0, "auto"]}
                width={40}
              />
              <Tooltip
                formatter={(value) => {
                  if (value == null || typeof value !== "number") {
                    return ["n/a", "Other %"];
                  }
                  return [`${value.toFixed(1)}%`, "Other %"];
                }}
                labelFormatter={(day) => `Day ${day}`}
              />
              <Line
                type="monotone"
                dataKey="otherPct"
                name="Other %"
                stroke="#0284c7"
                strokeWidth={2}
                dot={{ r: 2, fill: "#0284c7" }}
                connectNulls={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="mt-5 rounded-lg border border-dashed border-stone-200 bg-stone-50 px-4 py-8 text-center text-sm text-stone-500">
          Other % trend appears once daily source-of-streams data is entered
        </p>
      )}
    </section>
  );
}
