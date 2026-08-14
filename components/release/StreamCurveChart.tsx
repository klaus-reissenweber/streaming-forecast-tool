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
import { CampaignFlightBands } from "@/components/charts/CampaignFlightBands";
import { SectionHeader } from "@/components/layout/SectionHeader";
import {
  ChartSeriesCards,
  type ChartSeriesCardModel,
  type ChartSeriesId,
} from "@/components/release/ChartSeriesCards";
import type { ReleasePhase } from "@/lib/build-release-view-model";
import {
  flightsToChartBands,
  type CampaignFlight,
} from "@/lib/campaign-flights";
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
  campaignFlights?: CampaignFlight[];
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
const CHART_MARGIN_BOTTOM = 40;
const CAMPAIGN_WINDOW_DAYS = 28;
const TODAY_LABEL_OFFSET = 42;
const AXIS_BRACKET_LABEL_BOTTOM = 8;
const AXIS_BRACKET_LABEL_HALF_WIDTH = 14;
const DRAW_PATH_LENGTH = 2000;
const DRAW_STAGGER_MS = { projected: 200, actual: 400 } as const;

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

function getPlotDayLeft(
  day: number,
  labelOffsetPx: number,
  rightMargin: number,
): string {
  const plotProgress = (day - 1) / (CAMPAIGN_WINDOW_DAYS - 1);
  const horizontalInset = CHART_Y_AXIS_WIDTH + rightMargin;

  return `calc(${CHART_Y_AXIS_WIDTH}px + (100% - ${horizontalInset}px) * ${plotProgress} - ${labelOffsetPx}px)`;
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
  const [dashPattern, setDashPattern] = useState<string | number>(
    DRAW_PATH_LENGTH,
  );

  useEffect(() => {
    const durationMs = getMotionDurationChartMs();
    const startDelay = durationMs === 0 ? 0 : delayMs;

    const drawTimer = window.setTimeout(() => {
      setOffset(0);
    }, startDelay);

    let dashTimer = 0;
    if (dashedWhenDone) {
      dashTimer = window.setTimeout(() => {
        setDashPattern("6 4");
      }, startDelay + durationMs);
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

function yMaxForVisible(rows: ChartRow[], enabled: Set<ChartSeriesId>): number {
  let max = 0;
  for (const row of rows) {
    let stacked = 0;
    if (enabled.has("locked")) stacked += row.locked;
    if (enabled.has("marqueeAds")) stacked += row.marqueeAds;
    if (enabled.has("showcaseAds")) stacked += row.showcaseAds;
    if (enabled.has("metaAds")) stacked += row.metaAds;
    max = Math.max(max, stacked);
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
  phase,
  releaseDate,
  campaignFlights = [],
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
  const flightBands = useMemo(
    () => flightsToChartBands(campaignFlights, releaseDate),
    [campaignFlights, releaseDate],
  );

  const availableIds = useMemo(() => {
    const ids: ChartSeriesId[] = ["locked"];
    if (hasMarqueeAds) ids.push("marqueeAds");
    if (hasShowcaseAds) ids.push("showcaseAds");
    if (hasMetaAds) ids.push("metaAds");
    if (hasProjected) ids.push("projected");
    if (hasActuals) ids.push("actual");
    return ids;
  }, [hasMarqueeAds, hasShowcaseAds, hasMetaAds, hasProjected, hasActuals]);

  const [hiddenIds, setHiddenIds] = useState<Set<ChartSeriesId>>(new Set());

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
    ? palette.locked
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
  const leftAxisTag = showLocked
    ? "Forecast"
    : showMarquee
      ? "Marquee"
      : showShowcase
        ? "Showcase"
        : showMeta
          ? "Meta ads"
          : null;
  const rightAxisTag = showActual
    ? "Actual"
    : showProjected
      ? "Projected"
      : null;

  const seriesCards: ChartSeriesCardModel[] = [
    {
      id: "locked",
      label: "Organic forecast",
      value: sumNumbers(lockedStreamCurve.dailyStreams),
      sublabel: "D1–D28",
      color: palette.locked,
      enabled: showLocked,
    },
  ];
  if (hasMarqueeAds) {
    seriesCards.push({
      id: "marqueeAds",
      label: "Marquee lift",
      value: sumNumbers(marqueeAdDaily ?? []),
      sublabel: "D1–D28",
      color: palette.marqueeAds,
      enabled: showMarquee,
    });
  }
  if (hasShowcaseAds) {
    seriesCards.push({
      id: "showcaseAds",
      label: "Showcase lift",
      value: sumNumbers(showcaseAdDaily ?? []),
      sublabel: "D1–D28",
      color: palette.showcaseAds,
      enabled: showShowcase,
    });
  }
  if (hasMetaAds) {
    seriesCards.push({
      id: "metaAds",
      label: "Meta lift",
      value: sumNumbers(metaAdDaily ?? []),
      sublabel: "D1–D28",
      color: palette.metaAds,
      enabled: showMeta,
    });
  }
  if (hasProjected) {
    seriesCards.push({
      id: "projected",
      label: "Live pace",
      value: sumNumbers(projectedStreamCurve?.dailyStreams ?? []),
      sublabel: "D1–D28",
      color: palette.projected,
      enabled: showProjected,
    });
  }
  if (hasActuals) {
    seriesCards.push({
      id: "actual",
      label: "Daily actuals",
      value: sumPresent(actualStreamsByDay),
      sublabel: lastActualDay > 0 ? `D1–D${lastActualDay}` : "Entered days",
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
      className="motion-fade-up relative overflow-hidden rounded-instrument border border-border bg-surface p-5"
      aria-label="Stream curve"
    >
      <span
        className="pointer-events-none absolute inset-y-0 left-0 w-1 origin-top bg-accent animate-instrument-rule-grow"
        aria-hidden="true"
      />

      <div>
        <SectionHeader description="Organic forecast curve with additive ad bands. Toggle a series from the cards.">
          Stream curve
        </SectionHeader>
      </div>

      <ChartSeriesCards series={seriesCards} onToggle={onToggleSeries} />

      <div className="motion-chart-grid-in relative mt-5 h-72 w-full">
        {leftAxisTag ? (
          <div
            className="pointer-events-none absolute z-10"
            style={{ top: 4, left: 4 }}
            aria-hidden="true"
          >
            <span
              className="chart-axis-bracket"
              style={{ color: leftAxisColor }}
            >
              {leftAxisTag}
            </span>
          </div>
        ) : null}
        {rightAxisTag ? (
          <div
            className="pointer-events-none absolute z-10"
            style={{ top: 4, right: 4 }}
            aria-hidden="true"
          >
            <span
              className="chart-axis-bracket"
              style={{ color: rightAxisColor }}
            >
              {rightAxisTag}
            </span>
          </div>
        ) : null}
        {campaignDay != null ? (
          <div
            className="pointer-events-none absolute z-10 w-10"
            style={{
              top: CHART_MARGIN_TOP - 22,
              left: getPlotDayLeft(
                campaignDay,
                TODAY_LABEL_OFFSET,
                rightMargin,
              ),
            }}
            aria-hidden="true"
          >
            <span className="chart-today-label mx-auto block w-fit">
              Today
            </span>
          </div>
        ) : null}
        {BRACKET_AXIS_DAYS.map((day) => (
          <div
            key={day}
            className="pointer-events-none absolute z-10 w-7"
            style={{
              bottom: AXIS_BRACKET_LABEL_BOTTOM,
              left: getPlotDayLeft(
                day,
                AXIS_BRACKET_LABEL_HALF_WIDTH,
                rightMargin,
              ),
            }}
            aria-hidden="true"
          >
            <span className="chart-axis-bracket mx-auto block w-fit">
              D{day}
            </span>
          </div>
        ))}
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={chartData}
            margin={{
              top: CHART_MARGIN_TOP,
              right: rightMargin,
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
                if (value == null || typeof value !== "number") {
                  return ["n/a", String(name)];
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
              />
            ) : null}
            {showLocked ? (
              <Area
                yAxisId="left"
                type="monotone"
                dataKey="locked"
                name="Forecast"
                stackId="forecast"
                fill={palette.locked}
                stroke={palette.locked}
                fillOpacity={0.55}
                strokeWidth={1.25}
                isAnimationActive={false}
              />
            ) : null}
            {showMarquee ? (
              <Area
                yAxisId="left"
                type="monotone"
                dataKey="marqueeAds"
                name="Marquee"
                stackId="forecast"
                fill={palette.marqueeAds}
                stroke={palette.marqueeAds}
                fillOpacity={0.55}
                strokeWidth={1}
                isAnimationActive={false}
              />
            ) : null}
            {showShowcase ? (
              <Area
                yAxisId="left"
                type="monotone"
                dataKey="showcaseAds"
                name="Showcase"
                stackId="forecast"
                fill={palette.showcaseAds}
                stroke={palette.showcaseAds}
                fillOpacity={0.55}
                strokeWidth={1}
                isAnimationActive={false}
              />
            ) : null}
            {showMeta ? (
              <Area
                yAxisId="left"
                type="monotone"
                dataKey="metaAds"
                name="Meta ads"
                stackId="forecast"
                fill={palette.metaAds}
                stroke={palette.metaAds}
                fillOpacity={0.5}
                strokeWidth={1}
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
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: palette.projected }}
                isAnimationActive={false}
                {...projectedDraw}
              />
            ) : null}
            {showActual ? (
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="actual"
                name="Actual"
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

      <CampaignFlightBands
        bands={flightBands}
        axisWidth={CHART_Y_AXIS_WIDTH}
        rightMargin={rightMargin}
      />
    </section>
  );
}
