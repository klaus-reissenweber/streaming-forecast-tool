"use client";

import { useEffect, useState } from "react";
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

interface ChartPalette {
  line: string;
  grid: string;
  axis: string;
}

const MONO_TICK = {
  fontFamily: "var(--font-plex-mono)",
  fontSize: 11,
} as const;

const DEFAULT_PALETTE: ChartPalette = {
  line: "#8FA800",
  grid: "#ECEEF2",
  axis: "#868E98",
};

function readChartPalette(): ChartPalette {
  if (typeof window === "undefined") {
    return DEFAULT_PALETTE;
  }

  const root = document.documentElement;
  const read = (name: string, fallback: string) =>
    getComputedStyle(root).getPropertyValue(name).trim() || fallback;

  return {
    line: read("--color-chart-locked", DEFAULT_PALETTE.line),
    grid: read("--color-chart-grid", DEFAULT_PALETTE.grid),
    axis: read("--color-chart-axis", DEFAULT_PALETTE.axis),
  };
}

function hasOtherPctData(otherPctByDay: OtherPctDayPoint[]): boolean {
  return otherPctByDay.some((point) => point.otherPct != null);
}

export function SourceOfStreamsChart({
  otherPctByDay,
  phase,
}: SourceOfStreamsChartProps) {
  const [palette, setPalette] = useState(DEFAULT_PALETTE);

  useEffect(() => {
    setPalette(readChartPalette());
  }, []);

  const showChart =
    phase !== "pre-release" && hasOtherPctData(otherPctByDay);

  const chartData = otherPctByDay.map((point) => ({
    day: point.day,
    otherPct: point.otherPct,
  }));

  return (
    <section
      className="motion-fade-up rounded-instrument border border-border bg-surface p-5"
      aria-label="Source of streams"
    >
      <h2 className="font-serif text-section font-semibold text-foreground">
        <span className="bracket-tag bracket-tag--accent mr-2 align-middle">
          [SOURCES]
        </span>
        <span className="instrument-section-title align-middle">
          Source of streams: Other %
        </span>
      </h2>

      {showChart ? (
        <div className="mt-5 h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={chartData}
              margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
            >
              <CartesianGrid
                stroke={palette.grid}
                strokeDasharray="3 3"
              />
              <XAxis
                dataKey="day"
                tick={{
                  fill: palette.axis,
                  ...MONO_TICK,
                }}
                tickFormatter={(day) => `D${day}`}
                interval={2}
                axisLine={{ stroke: palette.grid }}
                tickLine={{ stroke: palette.grid }}
              />
              <YAxis
                tick={{
                  fill: palette.axis,
                  ...MONO_TICK,
                }}
                tickFormatter={(value) => `${value}%`}
                domain={[0, "auto"]}
                width={40}
                axisLine={{ stroke: palette.grid }}
                tickLine={{ stroke: palette.grid }}
              />
              <Tooltip
                contentStyle={{
                  fontFamily: "var(--font-plex-mono)",
                  fontSize: 12,
                }}
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
                stroke={palette.line}
                strokeWidth={2}
                dot={{ r: 2, fill: palette.line }}
                connectNulls={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="mt-5 border border-dashed border-border bg-canvas px-4 py-8 text-center text-caption text-muted">
          Other % trend appears once daily source-of-streams data is entered
        </p>
      )}
    </section>
  );
}
