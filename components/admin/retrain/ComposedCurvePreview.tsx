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
import type { CurvePreview } from "@/lib/model/draft-review";

function CurveCard({ curve }: { curve: CurvePreview }) {
  const rows = curve.draftPct.map((draft, index) => ({
    day: index + 1,
    draft,
    active: curve.activePct[index] ?? null,
  }));

  return (
    <div className="rounded-instrument border border-border bg-surface p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">
          {curve.label} Release
        </h3>
        <span className="text-caption text-secondary">
          {curve.releaseDate} · Week 1 Σ new {curve.draftWk1Sum.toFixed(1)} / active{" "}
          {curve.activeWk1Sum.toFixed(1)}
        </span>
      </div>
      <div className="mt-3 h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="#eceef2" strokeDasharray="3 3" />
            <XAxis
              dataKey="day"
              tick={{ fill: "#868e98", fontSize: 11 }}
              ticks={[1, 7, 14, 21, 28]}
            />
            <YAxis
              tick={{ fill: "#868e98", fontSize: 11 }}
              width={36}
              tickFormatter={(value: number) => `${value}`}
            />
            <Tooltip
              formatter={(value) =>
                typeof value === "number" ? `${value.toFixed(2)}%` : String(value ?? "")
              }
              labelFormatter={(day) => `Day ${day}`}
            />
            <Legend />
            <Line
              type="monotone"
              dataKey="active"
              name="Active"
              stroke="#868e98"
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="draft"
              name="New"
              stroke="#1565a8"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function ComposedCurvePreview({ curves }: { curves: CurvePreview[] }) {
  return (
    <section className="motion-fade-up">
      <div className="mb-3 flex flex-wrap items-baseline gap-2">
        <h2 className="text-section font-semibold text-foreground">
          Composed Curve Preview
        </h2>
        <span className="text-caption text-secondary">New against active</span>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {curves.map((curve) => (
          <CurveCard key={curve.releaseDate} curve={curve} />
        ))}
      </div>
    </section>
  );
}
