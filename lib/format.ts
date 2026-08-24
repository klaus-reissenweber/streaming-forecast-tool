/** Full thousands formatting (e.g. 1163 → "1,163") — distinguishes nearby values. */
export function formatCount(value: number): string {
  if (!Number.isFinite(value)) {
    return "n/a";
  }
  return Math.round(value).toLocaleString("en-US");
}

/** Compact display for large counts (e.g. 451000 → "451K"). */
export function formatCompactNumber(
  value: number,
  fractionDigits = 0,
): string {
  if (!Number.isFinite(value)) {
    return "n/a";
  }

  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";

  if (abs >= 1_000_000) {
    const millions = abs / 1_000_000;
    if (fractionDigits > 0) {
      return `${sign}${millions.toFixed(fractionDigits)}M`;
    }
    const formatted =
      millions >= 10
        ? Math.round(millions).toString()
        : millions.toFixed(1).replace(/\.0$/, "");
    return `${sign}${formatted}M`;
  }

  if (abs >= 1_000) {
    const thousands = abs / 1_000;
    if (fractionDigits > 0) {
      return `${sign}${thousands.toFixed(fractionDigits)}K`;
    }
    return `${sign}${Math.round(thousands)}K`;
  }

  if (fractionDigits > 0) {
    return `${sign}${abs.toFixed(fractionDigits)}`;
  }

  return `${sign}${abs.toLocaleString("en-US")}`;
}

/**
 * Compact labels for a forecast and its interval. When default rounding
 * would make the forecast read the same as a band edge (9K and 9K),
 * raise precision on the colliding pair until they differ (8.7K, 9.2K).
 */
export function formatCompactRailLabels(
  forecast: number,
  lo: number,
  hi: number,
): { forecast: string; lo: string; hi: string } {
  let digits = 0;
  let forecastLabel = formatCompactNumber(forecast, digits);
  let loLabel = formatCompactNumber(lo, digits);
  let hiLabel = formatCompactNumber(hi, digits);

  while (
    digits < 2 &&
    (forecastLabel === loLabel || forecastLabel === hiLabel)
  ) {
    digits += 1;
    if (forecastLabel === hiLabel) {
      forecastLabel = formatCompactNumber(forecast, digits);
      hiLabel = formatCompactNumber(hi, digits);
    }
    if (forecastLabel === loLabel) {
      forecastLabel = formatCompactNumber(forecast, digits);
      loLabel = formatCompactNumber(lo, digits);
    }
  }

  if (forecastLabel === loLabel || forecastLabel === hiLabel) {
    return {
      forecast: formatCount(forecast),
      lo: formatCount(lo),
      hi: formatCount(hi),
    };
  }

  return { forecast: forecastLabel, lo: loLabel, hi: hiLabel };
}

/**
 * Percent labels with the same collision rule as compact counts.
 */
export function formatPercentRailLabels(
  forecast: number,
  lo: number,
  hi: number,
): { forecast: string; lo: string; hi: string } {
  let digits = 1;
  let forecastLabel = formatPercent(forecast, digits);
  let loLabel = formatPercent(lo, digits);
  let hiLabel = formatPercent(hi, digits);

  while (
    digits < 2 &&
    (forecastLabel === loLabel || forecastLabel === hiLabel)
  ) {
    digits += 1;
    if (forecastLabel === hiLabel) {
      forecastLabel = formatPercent(forecast, digits);
      hiLabel = formatPercent(hi, digits);
    }
    if (forecastLabel === loLabel) {
      forecastLabel = formatPercent(forecast, digits);
      loLabel = formatPercent(lo, digits);
    }
  }

  return { forecast: forecastLabel, lo: loLabel, hi: hiLabel };
}

export function formatPercent(value: number, decimals = 1): string {
  if (!Number.isFinite(value)) {
    return "n/a";
  }
  return `${value.toFixed(decimals)}%`;
}

export function formatUsd(value: number, decimals = 0): string {
  if (!Number.isFinite(value)) {
    return "n/a";
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

export function formatReleaseDate(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return isoDate;
  }
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

export function formatLockTimestamp(isoTimestamp: string): string {
  const date = new Date(isoTimestamp);
  if (Number.isNaN(date.getTime())) {
    return isoTimestamp;
  }
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

/** Date only from a timestamptz (no time). */
export function formatTimestampDate(isoTimestamp: string): string {
  const date = new Date(isoTimestamp);
  if (Number.isNaN(date.getTime())) {
    return isoTimestamp;
  }
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}
