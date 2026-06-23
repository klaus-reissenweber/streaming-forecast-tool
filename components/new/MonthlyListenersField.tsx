"use client";

import { TIER_ML_THRESHOLDS } from "@/lib/constants";
import {
  artistTierFromMonthlyListeners,
  type ArtistTier,
} from "@/lib/forecast";
import { DEFAULT_MONTHLY_LISTENERS } from "@/lib/validate-new-release";

const SLIDER_MIN = 10_000;
const SLIDER_MAX = 15_000_000;
const SLIDER_STEP = 10_000;

const ARTIST_TIER_LABELS: Record<ArtistTier, string> = {
  developing: "Developing",
  mid: "Mid",
  established: "Established",
};

interface MonthlyListenersFieldProps {
  value: number | string;
  onChange: (value: number | string) => void;
  disabled?: boolean;
  error?: string;
}

function coerceDisplayValue(value: number | string): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : DEFAULT_MONTHLY_LISTENERS;
  }
  const trimmed = value.trim();
  if (trimmed === "") {
    return DEFAULT_MONTHLY_LISTENERS;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : DEFAULT_MONTHLY_LISTENERS;
}

function formatListeners(value: number): string {
  if (value >= 1_000_000) {
    const millions = value / 1_000_000;
    return `${millions % 1 === 0 ? millions.toFixed(0) : millions.toFixed(1)}M`;
  }
  if (value >= 1_000) {
    const thousands = value / 1_000;
    return `${thousands % 1 === 0 ? thousands.toFixed(0) : thousands.toFixed(1)}K`;
  }
  return value.toLocaleString();
}

function clampForSlider(value: number): number {
  return Math.min(SLIDER_MAX, Math.max(SLIDER_MIN, value));
}

export function MonthlyListenersField({
  value,
  onChange,
  disabled = false,
  error,
}: MonthlyListenersFieldProps) {
  const displayValue = coerceDisplayValue(value);
  const artistTier = artistTierFromMonthlyListeners(displayValue);
  const sliderValue = clampForSlider(displayValue);

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor="monthlyListeners" className="text-sm font-medium text-stone-700">
        Monthly listeners
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <input
          id="monthlyListeners"
          type="range"
          min={SLIDER_MIN}
          max={SLIDER_MAX}
          step={SLIDER_STEP}
          value={sliderValue}
          disabled={disabled}
          onChange={(event) => onChange(Number(event.target.value))}
          className="h-2 min-w-[12rem] flex-1 cursor-pointer accent-orange-700 disabled:cursor-not-allowed disabled:opacity-50"
        />
        <input
          type="text"
          inputMode="numeric"
          disabled={disabled}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={String(DEFAULT_MONTHLY_LISTENERS)}
          className="w-32 rounded border border-stone-300 px-3 py-2 font-mono text-sm text-stone-900 disabled:cursor-not-allowed disabled:opacity-50"
          aria-label="Monthly listeners exact value"
        />
      </div>

      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs text-stone-500">
        <span>
          <span className="font-mono text-sm text-stone-800">
            {formatListeners(displayValue)}
          </span>{" "}
          monthly listeners
        </span>
        <span className="text-stone-400">·</span>
        <span>
          Artist tier:{" "}
          <span className="font-medium text-orange-700">
            {ARTIST_TIER_LABELS[artistTier]}
          </span>
        </span>
      </div>

      <p className="text-xs text-stone-400">
        Developing &lt; {formatListeners(TIER_ML_THRESHOLDS.mid)} · Mid{" "}
        {formatListeners(TIER_ML_THRESHOLDS.mid)}–
        {formatListeners(TIER_ML_THRESHOLDS.established - 1)} · Established ≥{" "}
        {formatListeners(TIER_ML_THRESHOLDS.established)}
      </p>

      {error ? (
        <p className="text-xs text-red-600" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
