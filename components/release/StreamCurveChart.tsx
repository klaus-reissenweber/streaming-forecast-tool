"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ReleasePhase } from "@/lib/build-release-view-model";
import { formatCompactNumber } from "@/lib/format";
import type { StreamCurveForecast } from "@/lib/forecast";

export interface StreamCurveChartProps {
  lockedStreamCurve: StreamCurveForecast;
  projectedStreamCurve?: StreamCurveForecast | null;
  /** Daily Marquee attributed streams (additive, 28). */
  marqueeAdDaily?: number[];
  /** Daily Showcase attributed streams (additive, 28). */
  showcaseAdDaily?: number[];
  /** Daily Meta ad attributed streams (additive, 28). */
  metaAdDaily?: number[];
  actualStreamsByDay: (number | null)[];
  phase: ReleasePhase;
  releaseDate: string;
}

interface ChartRow {
  day: number;
  locked: number;
  marqueeAds: number;
  showcaseAds: number;
  metaAds: number;
  projected: number | null;
  actual: number | null;
}

interface ChartPalette {
  locked: string;
  marqueeAds: string;
  showcaseAds: string;
  metaAds: string;
  projected: string;
  actual: string;
  grid: string;
  axis: string;
  accent: string;
}

const BRACKET_AXIS_DAYS = [1, 7, 14, 21, 28] as const;
const CHART_Y_AXIS_WIDTH = 48;
const CHART_MARGIN_TOP = 28;
const CHART_MARGIN_RIGHT = 56;
const CHART_MARGIN_BOTTOM = 40;
const CAMPAIGN_WINDOW_DAYS = 28;
const TODAY_LABEL_OFFSET = 42;
const AXIS_BRACKET_LABEL_BOTTOM = 8;
const AXIS_BRACKET_LABEL_HALF_WIDTH = 14;
const DRAW_PATH_LENGTH = 2000;
const DRAW_STAGGER_MS = { locked: 0, projected: 200, actual: 400 } as const;
const LEGEND_BASE_DELAY_MS = 500;
const LEGEND_STAGGER_MS = 60;

const DEFAULT_PALETTE: ChartPalette = {
  locked: "#8fa800",
  marqueeAds: "#1db954",
  showcaseAds: "#0d7a3a",
  metaAds: "#1877f2",
  projected: "#1565a8",
  actual: "#12151a",
  grid: "#eceef2",
  axis: "#868e98",
  accent: "#c8e600",
};

function buildChartRows(
  lockedStreamCurve: StreamCurveForecast,
  projectedStreamCurve: StreamCurveForecast | null | undefined,
  marqueeAdDaily: number[] | undefined,
  showcaseAdDaily: number[] | undefined,
  metaAdDaily: number[] | undefined,
  actualStreamsByDay: (number | null)[],
): ChartRow[] {
  return lockedStreamCurve.dailyStreams.map((locked, index) => ({
    day: index + 1,
    locked,
    marqueeAds: marqueeAdDaily?.[index] ?? 0,
    showcaseAds: showcaseAdDaily?.[index] ?? 0,
    metaAds: metaAdDaily?.[index] ?? 0,
    projected: projectedStreamCurve?.dailyStreams[index] ?? null,
    actual: actualStreamsByDay[index] ?? null,
  }));
}

function formatAxisTick(value: number): string {
  return formatCompactNumber(value);
}

function getMotionDurationChartMs(): number {
  if (typeof window === "undefined") {
    return 600;
  }

  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue("--motion-duration-chart")
    .trim();

  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : 600;
}

function readChartPalette(): ChartPalette {
  if (typeof window === "undefined") {
    return DEFAULT_PALETTE;
  }

  const style = getComputedStyle(document.documentElement);
  const read = (name: string, fallback: string) =>
    style.getPropertyValue(name).trim() || fallback;

  return {
    locked: read("--color-chart-locked", DEFAULT_PALETTE.locked),
    marqueeAds: read(
      "--color-chart-spotify-marquee",
      DEFAULT_PALETTE.marqueeAds,
    ),
    showcaseAds: read(
      "--color-chart-spotify-showcase",
      DEFAULT_PALETTE.showcaseAds,
    ),
    metaAds: read("--color-chart-meta-ads", DEFAULT_PALETTE.metaAds),
    projected: read("--color-chart-projected", DEFAULT_PALETTE.projected),
    actual: read("--color-chart-actual", DEFAULT_PALETTE.actual),
    grid: read("--color-chart-grid", DEFAULT_PALETTE.grid),
    axis: read("--color-chart-axis", DEFAULT_PALETTE.axis),
    accent: read("--color-accent", DEFAULT_PALETTE.accent),
  };
}

function getCampaignDay(releaseDate: string): number | null {
  const release = new Date(`${releaseDate}T00:00:00`);
  if (Number.isNaN(release.getTime())) {
    return null;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const dayIntoCampaign =
    Math.floor((today.getTime() - release.getTime()) / 86_400_000) + 1;

  if (dayIntoCampaign < 1) {
    return null;
  }

  return Math.min(dayIntoCampaign, 28);
}

function getLastActualDay(actualStreamsByDay: (number | null)[]): number {
  for (let index = actualStreamsByDay.length - 1; index >= 0; index -= 1) {
    if (actualStreamsByDay[index] != null) {
      return index + 1;
    }
  }
  return 0;
}

function getPlotDayLeft(day: number, labelOffsetPx: number): string {
  const plotProgress = (day - 1) / (CAMPAIGN_WINDOW_DAYS - 1);
  const horizontalInset = CHART_Y_AXIS_WIDTH + CHART_MARGIN_RIGHT;

  return `calc(${CHART_Y_AXIS_WIDTH}px + (100% - ${horizontalInset}px) * ${plotProgress} - ${labelOffsetPx}px)`;
}

function getTodayLabelLeft(campaignDay: number): string {
  return getPlotDayLeft(campaignDay, TODAY_LABEL_OFFSET);
}

function getAxisBracketLabelLeft(day: number): string {
  return getPlotDayLeft(day, AXIS_BRACKET_LABEL_HALF_WIDTH);
}

function useChartPalette(): ChartPalette {
  const [palette, setPalette] = useState(DEFAULT_PALETTE);

  useEffect(() => {
    setPalette(readChartPalette());
  }, []);

  return palette;
}

function useLineDrawIn(
  delayMs: number,
  options?: { dashedWhenDone?: boolean },
) {
  const { dashedWhenDone = false } = options ?? {};
  const [offset, setOffset] = useState(DRAW_PATH_LENGTH);
  const [dashPattern, setDashPattern] = useState<string | number>(
    DRAW_PATH_LENGTH,
  );

  useEffect(() => {
    const durationMs = getMotionDurationChartMs();

    if (durationMs === 0) {
      setOffset(0);
      if (dashedWhenDone) {
        setDashPattern("6 4");
      }
      return;
    }

    const drawTimer = window.setTimeout(() => {
      setOffset(0);
    }, delayMs);

    let dashTimer = 0;
    if (dashedWhenDone) {
      dashTimer = window.setTimeout(() => {
        setDashPattern("6 4");
      }, delayMs + durationMs);
    }

    return () => {
      window.clearTimeout(drawTimer);
      if (dashTimer) {
        window.clearTimeout(dashTimer);
      }
    };
  }, [delayMs, dashedWhenDone]);

  const durationMs = getMotionDurationChartMs();

  return {
    strokeDasharray: dashPattern,
    strokeDashoffset: offset,
    style: {
      transition:
        durationMs > 0
          ? `stroke-dashoffset ${durationMs}ms var(--ease-out-expo)`
          : undefined,
    },
  };
}

function LegendSwatch({
  color,
  kind,
}: {
  color: string;
  kind: "area" | "line" | "dashed";
}) {
  if (kind === "area") {
    return (
      <span
        className="inline-block h-2.5 w-5 shrink-0 rounded-[2px]"
        style={{ backgroundColor: color }}
        aria-hidden="true"
      />
    );
  }
  return (
    <svg
      width={28}
      height={8}
      viewBox="0 0 28 8"
      aria-hidden="true"
      className="shrink-0"
    >
      <line
        x1={0}
        y1={4}
        x2={28}
        y2={4}
        stroke={color}
        strokeWidth={kind === "dashed" ? 2 : 2.5}
        strokeDasharray={kind === "dashed" ? "4 3" : undefined}
      />
    </svg>
  );
}

export function StreamCurveChart({
  lockedStreamCurve,
  projectedStreamCurve,
  marqueeAdDaily,
  showcaseAdDaily,
  metaAdDaily,
  actualStreamsByDay,
  phase,
  releaseDate,
}: StreamCurveChartProps) {
  const palette = useChartPalette();
  const projectedDraw = useLineDrawIn(DRAW_STAGGER_MS.projected, {
    dashedWhenDone: true,
  });
  const actualDraw = useLineDrawIn(DRAW_STAGGER_MS.actual);

  const chartData = buildChartRows(
    lockedStreamCurve,
    projectedStreamCurve,
    marqueeAdDaily,
    showcaseAdDaily,
    metaAdDaily,
    actualStreamsByDay,
  );
  const hasActuals = actualStreamsByDay.some((value) => value != null);
  const hasProjected = projectedStreamCurve != null;
  const hasMarqueeAds = (marqueeAdDaily ?? []).some((v) => v > 0);
  const hasShowcaseAds = (showcaseAdDaily ?? []).some((v) => v > 0);
  const hasMetaAds = (metaAdDaily ?? []).some((v) => v > 0);
  const campaignDay = useMemo(
    () => (phase === "monitoring" ? getCampaignDay(releaseDate) : null),
    [phase, releaseDate],
  );
  const lastActualDay = getLastActualDay(actualStreamsByDay);

  const legendItems = [
    {
      tag: "[LOCKED]",
      tagClass: "bracket-tag--accent",
      label: "Organic locked forecast",
      color: palette.locked,
      kind: "area" as const,
      visible: true,
    },
    {
      tag: "[MARQUEE]",
      tagClass: "bracket-tag--neutral",
      label: "Marquee attributed lift",
      color: palette.marqueeAds,
      kind: "area" as const,
      visible: hasMarqueeAds,
    },
    {
      tag: "[SHOWCASE]",
      tagClass: "bracket-tag--neutral",
      label: "Showcase attributed lift",
      color: palette.showcaseAds,
      kind: "area" as const,
      visible: hasShowcaseAds,
    },
    {
      tag: "[META ADS]",
      tagClass: "bracket-tag--info",
      label: "Meta attributed lift",
      color: palette.metaAds,
      kind: "area" as const,
      visible: hasMetaAds,
    },
    {
      tag: "[PROJECTED]",
      tagClass: "bracket-tag--info",
      label: "Live pace projection",
      color: palette.projected,
      kind: "dashed" as const,
      visible: hasProjected,
    },
    {
      tag: "[ACTUAL]",
      tagClass: "bracket-tag--neutral",
      label:
        lastActualDay > 0
          ? `Daily actuals D1–D${lastActualDay}`
          : "Daily actuals",
      color: palette.actual,
      kind: "line" as const,
      visible: hasActuals,
    },
  ].filter((item) => item.visible);

  return (
    <section
      className="motion-fade-up relative overflow-hidden rounded-instrument border border-border bg-surface p-5"
      aria-label="Stream curve"
    >
      <span
        className="pointer-events-none absolute inset-y-0 left-0 w-1 origin-top bg-accent animate-instrument-rule-grow"
        aria-hidden="true"
      />

      <div>
        <h2 className="font-serif text-[1.5rem] font-semibold leading-tight text-foreground">
          <span className="bracket-tag bracket-tag--accent mr-2 align-middle">
            [STREAM CURVE]
          </span>
          <span className="instrument-section-title align-middle">
            Stream curve
          </span>
        </h2>
        <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.06em] text-muted">
          LOCKED · MARQUEE · SHOWCASE · META ADS · PROJECTED · ACTUAL · D1–D28
        </p>
        {phase === "pre-release" || !hasActuals ? (
          <p className="mt-2 text-caption text-muted">
            Organic locked curve with additive ad bands. Actual daily streams
            overlay once data is entered.
          </p>
        ) : null}
      </div>

      <div className="motion-chart-grid-in relative mt-5 h-72 w-full">
        {campaignDay != null ? (
          <div
            className="pointer-events-none absolute z-10 w-10"
            style={{
              top: CHART_MARGIN_TOP - 22,
              left: getTodayLabelLeft(campaignDay),
            }}
            aria-hidden="true"
          >
            <span className="chart-today-label mx-auto block w-fit">
              [TODAY]
            </span>
          </div>
        ) : null}
        {BRACKET_AXIS_DAYS.map((day) => (
          <div
            key={day}
            className="pointer-events-none absolute z-10 w-7"
            style={{
              bottom: AXIS_BRACKET_LABEL_BOTTOM,
              left: getAxisBracketLabelLeft(day),
            }}
            aria-hidden="true"
          >
            <span className="chart-axis-bracket mx-auto block w-fit">
              [D{day}]
            </span>
          </div>
        ))}
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={chartData}
            margin={{
              top: CHART_MARGIN_TOP,
              right: CHART_MARGIN_RIGHT,
              left: 0,
              bottom: CHART_MARGIN_BOTTOM,
            }}
          >
            <CartesianGrid
              stroke={palette.grid}
              strokeDasharray="3 3"
              vertical={false}
            />
            <XAxis
              dataKey="day"
              type="number"
              domain={[1, 28]}
              tick={false}
              axisLine={{ stroke: palette.grid }}
              tickLine={false}
              height={CHART_MARGIN_BOTTOM}
            />
            <YAxis
              tick={{
                fill: palette.axis,
                fontFamily: "var(--font-plex-mono)",
                fontSize: 10,
              }}
              tickFormatter={formatAxisTick}
              width={CHART_Y_AXIS_WIDTH}
              axisLine={{ stroke: palette.grid }}
              tickLine={{ stroke: palette.grid }}
            />
            <Tooltip
              contentStyle={{
                fontFamily: "var(--font-plex-mono)",
                fontSize: "12px",
                borderColor: "var(--color-border)",
                borderRadius: "4px",
              }}
              labelStyle={{
                fontFamily: "var(--font-plex-sans)",
                fontSize: "12px",
                color: "var(--color-secondary)",
              }}
              formatter={(value, name) => {
                if (value == null || typeof value !== "number") {
                  return ["n/a", String(name)];
                }
                return [value.toLocaleString("en-US"), String(name)];
              }}
              labelFormatter={(day) => `Day ${day}`}
            />
            {campaignDay != null ? (
              <ReferenceLine
                x={campaignDay}
                stroke={palette.accent}
                strokeOpacity={0.5}
                strokeWidth={1}
              />
            ) : null}
            <Area
              type="monotone"
              dataKey="locked"
              name="[LOCKED]"
              stackId="forecast"
              fill={palette.locked}
              stroke={palette.locked}
              fillOpacity={0.55}
              strokeWidth={1.25}
              isAnimationActive={false}
            />
            {hasMarqueeAds ? (
              <Area
                type="monotone"
                dataKey="marqueeAds"
                name="[MARQUEE]"
                stackId="forecast"
                fill={palette.marqueeAds}
                stroke={palette.marqueeAds}
                fillOpacity={0.55}
                strokeWidth={1}
                isAnimationActive={false}
              />
            ) : null}
            {hasShowcaseAds ? (
              <Area
                type="monotone"
                dataKey="showcaseAds"
                name="[SHOWCASE]"
                stackId="forecast"
                fill={palette.showcaseAds}
                stroke={palette.showcaseAds}
                fillOpacity={0.55}
                strokeWidth={1}
                isAnimationActive={false}
              />
            ) : null}
            {hasMetaAds ? (
              <Area
                type="monotone"
                dataKey="metaAds"
                name="[META ADS]"
                stackId="forecast"
                fill={palette.metaAds}
                stroke={palette.metaAds}
                fillOpacity={0.5}
                strokeWidth={1}
                isAnimationActive={false}
              />
            ) : null}
            {hasProjected ? (
              <Line
                type="monotone"
                dataKey="projected"
                name="[PROJECTED]"
                stroke={palette.projected}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: palette.projected }}
                isAnimationActive={false}
                {...projectedDraw}
              />
            ) : null}
            {hasActuals ? (
              <Line
                type="monotone"
                dataKey="actual"
                name="[ACTUAL]"
                stroke={palette.actual}
                strokeWidth={2.5}
                dot={{ r: 2, fill: palette.actual }}
                connectNulls={false}
                isAnimationActive={false}
                {...actualDraw}
              />
            ) : null}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {legendItems.length > 0 ? (
        <ul className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
          {legendItems.map((item, index) => (
            <li
              key={item.tag}
              className="motion-legend-tag-in flex items-center gap-2"
              style={{
                animationDelay: `${LEGEND_BASE_DELAY_MS + index * LEGEND_STAGGER_MS}ms`,
              }}
            >
              <span className={`bracket-tag bracket-tag--axis ${item.tagClass}`}>
                {item.tag}
              </span>
              <LegendSwatch color={item.color} kind={item.kind} />
              <span className="text-xs text-secondary">{item.label}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
