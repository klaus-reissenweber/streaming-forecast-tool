"use client";

import { formatCompactNumber } from "@/lib/format";

export type ChartSeriesId =
  | "locked"
  | "marqueeAds"
  | "showcaseAds"
  | "metaAds"
  | "projected"
  | "actual";

export type ChartSeriesCardModel = {
  id: ChartSeriesId;
  label: string;
  value: number;
  sublabel?: string;
  color: string;
  enabled: boolean;
};

function SeriesCheckbox({
  color,
  checked,
}: {
  color: string;
  checked: boolean;
}) {
  const luminance = hexLuminance(color);
  const checkColor = luminance > 0.55 ? "#12151a" : "#ffffff";

  return (
    <span
      className="flex size-3.5 shrink-0 items-center justify-center rounded-tag border-2"
      style={{
        borderColor: color,
        backgroundColor: checked ? color : "transparent",
      }}
      aria-hidden="true"
    >
      {checked ? (
        <svg viewBox="0 0 12 12" className="size-2.5" fill="none">
          <path
            d="M2.5 6.2 5 8.5 9.5 3.5"
            stroke={checkColor}
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : null}
    </span>
  );
}

function hexLuminance(color: string): number {
  const hex = color.trim().replace("#", "");
  if (hex.length !== 6 || /[^0-9a-f]/i.test(hex)) {
    return 0.4;
  }
  const r = Number.parseInt(hex.slice(0, 2), 16) / 255;
  const g = Number.parseInt(hex.slice(2, 4), 16) / 255;
  const b = Number.parseInt(hex.slice(4, 6), 16) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function ChartSeriesCards({
  series,
  onToggle,
}: {
  series: ChartSeriesCardModel[];
  onToggle: (id: ChartSeriesId) => void;
}) {
  if (series.length === 0) {
    return null;
  }

  return (
    <div
      className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6"
      role="group"
      aria-label="Chart series"
    >
      {series.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onToggle(item.id)}
          aria-pressed={item.enabled}
          className={
            "rounded-instrument border border-border bg-surface px-3 py-3 text-left transition-opacity " +
            (item.enabled ? "opacity-100" : "opacity-50")
          }
        >
          <span className="flex items-center gap-1.5">
            <SeriesCheckbox color={item.color} checked={item.enabled} />
            <span className="text-[10px] font-medium uppercase tracking-[0.06em] text-muted">
              {item.label}
            </span>
          </span>
          <span
            className="mt-1 block font-mono text-lg font-semibold tabular-nums leading-none tracking-[-0.02em]"
            style={{ color: item.enabled ? item.color : undefined }}
          >
            {formatCompactNumber(item.value)}
          </span>
          {item.sublabel ? (
            <span className="mt-1 block text-caption text-muted">
              {item.sublabel}
            </span>
          ) : null}
        </button>
      ))}
    </div>
  );
}
