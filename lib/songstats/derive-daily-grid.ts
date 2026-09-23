/**
 * Turn a time-ordered Songstats totals series into a 28-day grid.
 * Never splits a lumped increment across skipped days.
 */

export const SPOTIFY_COUNT_THROUGH_OFFSET_DAYS = 1;

export type SongstatsQuality = "clean" | "lumped" | "stale" | "pending";

export type SongstatsTotalReading = {
  streamsTotal: number;
  fetchedAt: string;
  popularity?: number | null;
};

export type DerivedDay = {
  dayNumber: number;
  streams: number | null;
  cumulative: number;
  quality: SongstatsQuality;
};

export type DeriveDailyGridOptions = {
  offsetDays?: number;
};

const WINDOW_DAYS = 28;

export function addUtcDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate.slice(0, 10)}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`date: ${isoDate}`);
  }
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function utcDateOf(iso: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`fetchedAt: ${iso}`);
  }
  return date.toISOString().slice(0, 10);
}

function utcDayDiff(later: string, earlier: string): number {
  const a = Date.parse(`${earlier}T00:00:00.000Z`);
  const b = Date.parse(`${later}T00:00:00.000Z`);
  return Math.round((b - a) / 86_400_000);
}

function dayNumberOf(releaseDate: string, calendarDate: string): number {
  return utcDayDiff(calendarDate, releaseDate) + 1;
}

export function deriveDailyGrid(
  totals: readonly SongstatsTotalReading[],
  releaseDate: string,
  options?: DeriveDailyGridOptions,
): DerivedDay[] {
  const offset = options?.offsetDays ?? SPOTIFY_COUNT_THROUGH_OFFSET_DAYS;
  const release = releaseDate.slice(0, 10);
  const sorted = [...totals].sort((a, b) =>
    a.fetchedAt.localeCompare(b.fetchedAt),
  );

  const beforeRelease = sorted.filter(
    (row) => utcDateOf(row.fetchedAt) < release,
  );
  const baseline =
    beforeRelease.length > 0
      ? beforeRelease[beforeRelease.length - 1]!.streamsTotal
      : 0;

  type Rise = { dayNumber: number; increment: number };
  const incrementByDay = new Map<number, number>();
  let prevDistinct = baseline;
  let lastAttributedDay: number | null = null;

  for (const row of sorted) {
    const calDate = utcDateOf(row.fetchedAt);
    const attributed = addUtcDays(calDate, -offset);
    const dayNumber = dayNumberOf(release, attributed);
    if (lastAttributedDay == null || dayNumber > lastAttributedDay) {
      lastAttributedDay = dayNumber;
    }
    if (row.streamsTotal > prevDistinct) {
      const increment = row.streamsTotal - prevDistinct;
      if (dayNumber >= 1 && dayNumber <= WINDOW_DAYS) {
        incrementByDay.set(
          dayNumber,
          (incrementByDay.get(dayNumber) ?? 0) + increment,
        );
      }
      prevDistinct = row.streamsTotal;
    }
  }

  const riseDays = [...incrementByDay.keys()].sort((a, b) => a - b);
  const streams = new Map<number, number | null>();
  const quality = new Map<number, SongstatsQuality>();

  let prevRiseDay = 0;
  for (const riseDay of riseDays) {
    const increment = incrementByDay.get(riseDay)!;
    if (riseDay > prevRiseDay + 1) {
      for (let day = prevRiseDay + 1; day < riseDay; day++) {
        if (day >= 1 && day <= WINDOW_DAYS) {
          streams.set(day, null);
          quality.set(day, "lumped");
        }
      }
      streams.set(riseDay, increment);
      quality.set(riseDay, "lumped");
    } else {
      streams.set(riseDay, increment);
      quality.set(riseDay, "clean");
    }
    prevRiseDay = riseDay;
  }

  for (let day = 1; day <= WINDOW_DAYS; day++) {
    if (quality.has(day)) continue;
    if (lastAttributedDay == null || day > lastAttributedDay) {
      streams.set(day, null);
      quality.set(day, "pending");
      continue;
    }
    streams.set(day, null);
    quality.set(day, "stale");
  }

  let cumulative = baseline;
  const grid: DerivedDay[] = [];
  for (let day = 1; day <= WINDOW_DAYS; day++) {
    const dayStreams = streams.get(day) ?? null;
    if (dayStreams != null) cumulative += dayStreams;
    grid.push({
      dayNumber: day,
      streams: dayStreams,
      cumulative,
      quality: quality.get(day) ?? "pending",
    });
  }
  return grid;
}
