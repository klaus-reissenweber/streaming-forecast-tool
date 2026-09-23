import { describe, expect, it } from "vitest";
import {
  deriveDailyGrid,
  type SongstatsTotalReading,
} from "./derive-daily-grid";

function reading(
  date: string,
  streamsTotal: number,
): SongstatsTotalReading {
  return { streamsTotal, fetchedAt: `${date}T12:00:00.000Z` };
}

/** Offset 1: a reading dated D is attributed to D − 1. Release 2026-06-10 = day 1. */
const RELEASE = "2026-06-10";

describe("deriveDailyGrid", () => {
  it("reproduces a clean run, a stale+two-day lump, and a three-day lump", () => {
    const totals: SongstatsTotalReading[] = [
      // Clean days 1–4 (readings on 06-11…06-14 → attr 06-10…06-13)
      reading("2026-06-11", 1000),
      reading("2026-06-12", 2500),
      reading("2026-06-13", 4000),
      reading("2026-06-14", 5500),
      // Stale day 5 (06-15 → 06-14), then two-day lump landing day 6
      reading("2026-06-15", 5500),
      reading("2026-06-16", 8000),
      // Stale days 7–8, then three-day lump landing day 9
      reading("2026-06-17", 8000),
      reading("2026-06-18", 8000),
      reading("2026-06-19", 14_000),
    ];
    // Daily clean rises days 10–28 so day 28 cumulative = last total
    let total = 14_000;
    for (let day = 10; day <= 28; day++) {
      total += 100;
      // attributed day D ← reading date D+1 (offset 1); day 1 = 06-10
      const attributed = new Date(Date.UTC(2026, 5, 9 + day));
      const fetchDate = new Date(attributed);
      fetchDate.setUTCDate(fetchDate.getUTCDate() + 1);
      totals.push({
        streamsTotal: total,
        fetchedAt: fetchDate.toISOString(),
      });
    }

    const beforeLump = deriveDailyGrid(totals.slice(0, 5), RELEASE);
    expect(beforeLump[4]).toMatchObject({
      dayNumber: 5,
      streams: null,
      quality: "stale",
    });

    const grid = deriveDailyGrid(totals, RELEASE);
    expect(grid).toHaveLength(28);

    expect(grid[0]).toMatchObject({ dayNumber: 1, streams: 1000, quality: "clean" });
    expect(grid[1]).toMatchObject({ dayNumber: 2, streams: 1500, quality: "clean" });
    expect(grid[2]).toMatchObject({ dayNumber: 3, streams: 1500, quality: "clean" });
    expect(grid[3]).toMatchObject({ dayNumber: 4, streams: 1500, quality: "clean" });

    expect(grid[4]).toMatchObject({
      dayNumber: 5,
      streams: null,
      quality: "lumped",
    });
    expect(grid[5]).toMatchObject({
      dayNumber: 6,
      streams: 2500,
      quality: "lumped",
    });

    expect(grid[6]).toMatchObject({
      dayNumber: 7,
      streams: null,
      quality: "lumped",
    });
    expect(grid[7]).toMatchObject({
      dayNumber: 8,
      streams: null,
      quality: "lumped",
    });
    expect(grid[8]).toMatchObject({
      dayNumber: 9,
      streams: 6000,
      quality: "lumped",
    });

    expect(grid[9]).toMatchObject({
      dayNumber: 10,
      streams: 100,
      quality: "clean",
    });
    expect(grid[27]).toMatchObject({
      dayNumber: 28,
      streams: 100,
      quality: "clean",
    });

    const lastTotal = totals[totals.length - 1]!.streamsTotal;
    expect(grid[27]!.cumulative).toBe(lastTotal);
    expect(lastTotal).toBe(14_000 + 19 * 100);
  });

  it("uses the last pre-release total as baseline", () => {
    const grid = deriveDailyGrid(
      [
        reading("2026-06-08", 200),
        reading("2026-06-09", 500),
        reading("2026-06-11", 800),
      ],
      RELEASE,
    );
    expect(grid[0]).toMatchObject({
      dayNumber: 1,
      streams: 300,
      quality: "clean",
      cumulative: 800,
    });
  });

  it("marks days after the last reading as pending", () => {
    const grid = deriveDailyGrid([reading("2026-06-11", 100)], RELEASE);
    expect(grid[0]?.quality).toBe("clean");
    expect(grid[1]?.quality).toBe("pending");
    expect(grid[27]?.quality).toBe("pending");
  });
});
