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
import { SectionHeader } from "@/components/layout/SectionHeader";
import {
  ChartSeriesCards,
  type ChartSeriesCardModel,
  type ChartSeriesId,
} from "@/components/release/ChartSeriesCards";
import type { ReleasePhase } from "@/lib/build-release-view-model";
import { formatCompactNumber } from "@/lib/format";
import type { StreamCurveForecast } from "@/lib/forecast";
import type { ReleaseStatus } from "@/lib/map-release-row";

const SERIES_OFF_BY_DEFAULT: ChartSeriesId[] = [
  "marqueeAds",
  "showcaseAds",
  "metaAds",
  "projected",
];

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
  streamBand: { lo: number; hi: number };
  phase: ReleasePhase;
  status: ReleaseStatus;
  releaseDate: string;
}

interface ChartRow {
  day: number;
  locked: number;
  rangeLo: number;
  rangeSpan: number;
  rangeHi: number;
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

const WEEK_MARKS = [1, 7, 14, 21, 28] as const;
const CHART_Y_AXIS_WIDTH = 48;
const CHART_MARGIN_TOP = 28;
const CHART_X_AXIS_HEIGHT = 40;
const CAMPAIGN_WINDOW_DAYS = 28;
/** Inset so the first/last dots and their labels sit inside the plot, not on the clip edge. */
const AXIS_POINT_PAD = 12;
const DRAW_PATH_LENGTH = 2000;
const DRAW_STAGGER_MS = { projected: 200, actual: 400 } as const;
const SERIES_STROKE = 2.5;
const RANGE_FILL_OPACITY = 0.16;

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

function sumNumbers(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function sumPresent(values: (number | null)[]): number {
  let total = 0;
  for (const value of values) {
    if (value != null) {
      total += value;
    }
  }
  return total;
}

function buildChartRows(
  lockedStreamCurve: StreamCurveForecast,
  projectedStreamCurve: StreamCurveForecast | null | undefined,
  marqueeAdDaily: number[] | undefined,
  showcaseAdDaily: number[] | undefined,
  metaAdDaily: number[] | undefined,
  actualStreamsByDay: (number | null)[],
  streamBand: { lo: number; hi: number },
): ChartRow[] {
  return lockedStreamCurve.dailyStreams.map((locked, index) => {
    const rangeLo = locked * streamBand.lo;
    const rangeHi = locked * streamBand.hi;
    return {
      day: index + 1,
      locked,
      rangeLo,
      rangeHi,
      rangeSpan: Math.max(0, rangeHi - rangeLo),
      marqueeAds: marqueeAdDaily?.[index] ?? 0,
      showcaseAds: showcaseAdDaily?.[index] ?? 0,
      metaAds: metaAdDaily?.[index] ?? 0,
      projected: projectedStreamCurve?.dailyStreams[index] ?? null,
      actual: actualStreamsByDay[index] ?? null,
    };
  });
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
    actual: read("--color-foreground", DEFAULT_PALETTE.actual),
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

/** Week marks that fall inside 1…endDay, always including both ends. */
function xAxisTicks(endDay: number, marks: readonly number[]): number[] {
  const end = Math.max(1, Math.min(CAMPAIGN_WINDOW_DAYS, endDay));
  const ticks: number[] = marks.filter((day) => day < end);
  if (ticks[0] !== 1) {
    ticks.unshift(1);
  }
  if (ticks[ticks.length - 1] !== end) {
    ticks.push(end);
  }
  return ticks;
}

function useChartPalette(): ChartPalette {
  if (typeof window === "undefined") {
    return DEFAULT_PALETTE;
  }
  return readChartPalette();
}

function useLineDrawIn(
  delayMs: number,
  options?: { dashedWhenDone?: boolean },
) {
  const { dashedWhenDone = false } = options ?? {};
  const [offset, setOffset] = useState(DRAW_PATH_LENGTH);
  const [dashPattern, setDashPattern] = useState<string | number | undefined>(
    DRAW_PATH_LENGTH,
  );

  useEffect(() => {
    const durationMs = getMotionDurationChartMs();
    const startDelay = durationMs === 0 ? 0 : delayMs;

    const drawTimer = window.setTimeout(() => {
      setOffset(0);
    }, startDelay);

    const dashTimer = window.setTimeout(() => {
      setDashPattern(dashedWhenDone ? "6 4" : undefined);
    }, startDelay + durationMs);

    return () => {
      window.clearTimeout(drawTimer);
      window.clearTimeout(dashTimer);
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

function yMaxForVisible(rows: ChartRow[], enabled: Set<ChartSeriesId>): number {
  let max = 0;
  for (const row of rows) {
    if (enabled.has("locked")) {
      max = Math.max(max, row.locked, row.rangeHi);
    }
    if (enabled.has("marqueeAds")) {
      max = Math.max(max, row.marqueeAds);
    }
    if (enabled.has("showcaseAds")) {
      max = Math.max(max, row.showcaseAds);
    }
    if (enabled.has("metaAds")) {
      max = Math.max(max, row.metaAds);
    }
    if (enabled.has("projected") && row.projected != null) {
      max = Math.max(max, row.projected);
    }
    if (enabled.has("actual") && row.actual != null) {
      max = Math.max(max, row.actual);
    }
  }
  return max > 0 ? max : 1;
}

export function StreamCurveChart({
  lockedStreamCurve,
  projectedStreamCurve,
  marqueeAdDaily,
  showcaseAdDaily,
  metaAdDaily,
  actualStreamsByDay,
  streamBand,
  phase,
  status,
  releaseDate,
}: StreamCurveChartProps) {
  const palette = useChartPalette();
  const projectedDraw = useLineDrawIn(DRAW_STAGGER_MS.projected, {
    dashedWhenDone: true,
  });
  const actualDraw = useLineDrawIn(DRAW_STAGGER_MS.actual);

  const lastActualDay = getLastActualDay(actualStreamsByDay);
  const xMax = Math.min(
    CAMPAIGN_WINDOW_DAYS,
    Math.max(1, lastActualDay),
  );
  const chartData = buildChartRows(
    lockedStreamCurve,
    projectedStreamCurve,
    marqueeAdDaily,
    showcaseAdDaily,
    metaAdDaily,
    actualStreamsByDay,
    streamBand,
  ).slice(0, xMax);
  const axisTicks = xAxisTicks(xMax, WEEK_MARKS);
  const hasActuals = actualStreamsByDay.some((value) => value != null);
  const hasProjected =
    projectedStreamCurve != null && status !== "closed";
  const hasMarqueeAds = (marqueeAdDaily ?? []).some((v) => v > 0);
  const hasShowcaseAds = (showcaseAdDaily ?? []).some((v) => v > 0);
  const hasMetaAds = (metaAdDaily ?? []).some((v) => v > 0);
  const campaignDay = useMemo(() => {
    if (status === "closed" || phase !== "monitoring") {
      return null;
    }
    const day = getCampaignDay(releaseDate);
    if (day == null || day > xMax) {
      return null;
    }
    return day;
  }, [phase, releaseDate, status, xMax]);

  const availableIds = useMemo(() => {
    const ids: ChartSeriesId[] = ["locked"];
    if (hasMarqueeAds) ids.push("marqueeAds");
    if (hasShowcaseAds) ids.push("showcaseAds");
    if (hasMetaAds) ids.push("metaAds");
    if (hasProjected) ids.push("projected");
    if (hasActuals) ids.push("actual");
    return ids;
  }, [hasMarqueeAds, hasShowcaseAds, hasMetaAds, hasProjected, hasActuals]);

  const [hiddenIds, setHiddenIds] = useState<Set<ChartSeriesId>>(
    () => new Set(SERIES_OFF_BY_DEFAULT),
  );

  const enabledIds = useMemo(() => {
    return new Set(availableIds.filter((id) => !hiddenIds.has(id)));
  }, [availableIds, hiddenIds]);

  const showLocked = enabledIds.has("locked");
  const showMarquee = enabledIds.has("marqueeAds");
  const showShowcase = enabledIds.has("showcaseAds");
  const showMeta = enabledIds.has("metaAds");
  const showProjected = enabledIds.has("projected");
  const showActual = enabledIds.has("actual");

  const yMax = yMaxForVisible(chartData, enabledIds);
  const showRightAxis = showActual || showProjected;
  const rightMargin = showRightAxis ? CHART_Y_AXIS_WIDTH : 12;
  const leftAxisColor = showLocked
    ? palette.projected
    : showMarquee
      ? palette.marqueeAds
      : showShowcase
        ? palette.showcaseAds
        : showMeta
          ? palette.metaAds
          : palette.axis;
  const rightAxisColor = showActual
    ? palette.actual
    : showProjected
      ? palette.projected
      : palette.axis;

  const seriesCards: ChartSeriesCardModel[] = [
    {
      id: "locked",
      label: "Organic forecast",
      value: sumNumbers(lockedStreamCurve.dailyStreams),
      sublabel: "Days 1–28",
      color: palette.projected,
      enabled: showLocked,
    },
  ];
  if (hasMarqueeAds) {
    seriesCards.push({
      id: "marqueeAds",
      label: "Marquee lift",
      value: sumNumbers(marqueeAdDaily ?? []),
      sublabel: "Days 1–28",
      color: palette.marqueeAds,
      enabled: showMarquee,
    });
  }
  if (hasShowcaseAds) {
    seriesCards.push({
      id: "showcaseAds",
      label: "Showcase lift",
      value: sumNumbers(showcaseAdDaily ?? []),
      sublabel: "Days 1–28",
      color: palette.showcaseAds,
      enabled: showShowcase,
    });
  }
  if (hasMetaAds) {
    seriesCards.push({
      id: "metaAds",
      label: "Meta lift",
      value: sumNumbers(metaAdDaily ?? []),
      sublabel: "Days 1–28",
      color: palette.metaAds,
      enabled: showMeta,
    });
  }
  if (hasProjected) {
    seriesCards.push({
      id: "projected",
      label: "Live pace",
      value: sumNumbers(projectedStreamCurve?.dailyStreams ?? []),
      sublabel: "Days 1–28",
      color: palette.projected,
      enabled: showProjected,
    });
  }
  if (hasActuals) {
    seriesCards.push({
      id: "actual",
      label: "Daily actuals",
      value: sumPresent(actualStreamsByDay),
      sublabel: lastActualDay > 0 ? `Days 1–${lastActualDay}` : "Entered days",
      color: palette.actual,
      enabled: showActual,
    });
  }

  function onToggleSeries(id: ChartSeriesId) {
    setHiddenIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  return (
    <section
      className="motion-fade-up relative min-w-0 overflow-hidden rounded-instrument border border-border bg-surface p-4 md:p-5"
      aria-label="Stream Curve"
    >
      <span
        className="pointer-events-none absolute inset-y-0 left-0 w-1 origin-top bg-projected animate-instrument-rule-grow"
        aria-hidden="true"
      />

      <div>
        <SectionHeader>Stream Curve</SectionHeader>
      </div>

      <ChartSeriesCards series={seriesCards} onToggle={onToggleSeries} />

      <div className="motion-chart-grid-in relative mt-5 h-52 w-full min-w-0 md:h-72">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={chartData}
            margin={{
              top: CHART_MARGIN_TOP,
              right: rightMargin,
              left: 0,
              bottom: 4,
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
              domain={[1, xMax]}
              ticks={axisTicks}
              interval={0}
              padding={{ left: AXIS_POINT_PAD, right: AXIS_POINT_PAD }}
              allowDecimals={false}
              niceTicks="none"
              tickFormatter={(day) => String(day)}
              tick={{
                fill: palette.axis,
                fontFamily: "var(--font-plex-mono)",
                fontSize: 10,
              }}
              axisLine={{ stroke: palette.grid }}
              tickLine={false}
              height={CHART_X_AXIS_HEIGHT}
              label={{
                value: "Day",
                position: "insideBottom",
                offset: -4,
                fill: palette.axis,
                fontFamily: "var(--font-plex-sans)",
                fontSize: 10,
              }}
            />
            <YAxis
              yAxisId="left"
              orientation="left"
              domain={[0, yMax]}
              tick={{
                fill: leftAxisColor,
                fontFamily: "var(--font-plex-mono)",
                fontSize: 10,
              }}
              tickFormatter={formatAxisTick}
              width={CHART_Y_AXIS_WIDTH}
              axisLine={{ stroke: palette.grid }}
              tickLine={{ stroke: palette.grid }}
            />
            {showRightAxis ? (
              <YAxis
                yAxisId="right"
                orientation="right"
                domain={[0, yMax]}
                tick={{
                  fill: rightAxisColor,
                  fontFamily: "var(--font-plex-mono)",
                  fontSize: 10,
                }}
                tickFormatter={formatAxisTick}
                width={CHART_Y_AXIS_WIDTH}
                axisLine={{ stroke: palette.grid }}
                tickLine={{ stroke: palette.grid }}
              />
            ) : null}
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
                if (
                  name === "Expected range" ||
                  name === "rangeLo" ||
                  name === "rangeSpan"
                ) {
                  return [null, null];
                }
                if (value == null || typeof value !== "number") {
                  return ["Not available", String(name)];
                }
                return [value.toLocaleString("en-US"), String(name)];
              }}
              labelFormatter={(day) => `Day ${day}`}
            />
            {campaignDay != null ? (
              <ReferenceLine
                yAxisId="left"
                x={campaignDay}
                stroke={palette.accent}
                strokeOpacity={0.5}
                strokeWidth={1}
                label={{
                  value: "Today",
                  position: "top",
                  fontSize: 9,
                  fontWeight: 600,
                  fontFamily: "var(--font-plex-mono)",
                  fill: "var(--color-accent-readable)",
                }}
              />
            ) : null}
            {showLocked ? (
              <>
                <Area
                  yAxisId="left"
                  type="monotone"
                  dataKey="rangeLo"
                  stackId="expected"
                  stroke="none"
                  fill="transparent"
                  fillOpacity={0}
                  legendType="none"
                  tooltipType="none"
                  isAnimationActive={false}
                />
                <Area
                  yAxisId="left"
                  type="monotone"
                  dataKey="rangeSpan"
                  stackId="expected"
                  name="Expected range"
                  stroke="none"
                  fill={palette.projected}
                  fillOpacity={RANGE_FILL_OPACITY}
                  legendType="none"
                  tooltipType="none"
                  isAnimationActive={false}
                />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="locked"
                  name="Forecast"
                  stroke={palette.projected}
                  strokeWidth={SERIES_STROKE}
                  strokeDasharray="6 4"
                  dot={false}
                  activeDot={{ r: 4, fill: palette.projected }}
                  isAnimationActive={false}
                />
              </>
            ) : null}
            {showMarquee ? (
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="marqueeAds"
                name="Marquee"
                stroke={palette.marqueeAds}
                strokeWidth={SERIES_STROKE}
                dot={false}
                isAnimationActive={false}
              />
            ) : null}
            {showShowcase ? (
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="showcaseAds"
                name="Showcase"
                stroke={palette.showcaseAds}
                strokeWidth={SERIES_STROKE}
                dot={false}
                isAnimationActive={false}
              />
            ) : null}
            {showMeta ? (
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="metaAds"
                name="Meta ads"
                stroke={palette.metaAds}
                strokeWidth={SERIES_STROKE}
                dot={false}
                isAnimationActive={false}
              />
            ) : null}
            {showRightAxis ? (
              <Line
                yAxisId="right"
                dataKey="locked"
                hide
                stroke="none"
                dot={false}
                legendType="none"
                isAnimationActive={false}
              />
            ) : null}
            {showProjected ? (
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="projected"
                name="Projected"
                stroke={palette.projected}
                strokeWidth={SERIES_STROKE}
                dot={false}
                activeDot={{ r: 4, fill: palette.projected }}
                isAnimationActive={false}
                {...projectedDraw}
                strokeDasharray="6 4"
              />
            ) : null}
            {showActual ? (
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="actual"
                name="Actual"
                stroke={palette.actual}
                strokeWidth={SERIES_STROKE}
                dot={{ r: 3, fill: palette.actual }}
                connectNulls={false}
                isAnimationActive={false}
                {...actualDraw}
              />
            ) : null}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
