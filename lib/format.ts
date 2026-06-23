/** Compact display for large counts (e.g. 451000 → "451K"). */
export function formatCompactNumber(value: number): string {
  if (!Number.isFinite(value)) {
    return "n/a";
  }

  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";

  if (abs >= 1_000_000) {
    const millions = abs / 1_000_000;
    const formatted =
      millions >= 10
        ? Math.round(millions).toString()
        : millions.toFixed(1).replace(/\.0$/, "");
    return `${sign}${formatted}M`;
  }

  if (abs >= 1_000) {
    return `${sign}${Math.round(abs / 1_000)}K`;
  }

  return `${sign}${abs.toLocaleString("en-US")}`;
}

export function formatPercent(value: number, decimals = 1): string {
  if (!Number.isFinite(value)) {
    return "n/a";
  }
  return `${value.toFixed(decimals)}%`;
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
