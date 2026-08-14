/**
 * Map campaign start/end dates onto the D1–D28 monitoring window.
 * Pure — used by the release chart and the public report chart.
 */

export const CAMPAIGN_FLIGHT_WINDOW_DAYS = 28;

export type CampaignFlight = {
  id: string;
  name: string;
  startDate: string | null;
  endDate: string | null;
  platform?: "spotify" | "meta";
  spendUsd?: number;
};

export type CampaignFlightBand = {
  id: string;
  name: string;
  startDay: number;
  endDay: number;
};

export function isoDateToCampaignDay(
  releaseDate: string,
  isoDate: string,
): number | null {
  const release = Date.parse(`${releaseDate}T00:00:00`);
  const date = Date.parse(`${isoDate}T00:00:00`);
  if (!Number.isFinite(release) || !Number.isFinite(date)) {
    return null;
  }
  return Math.floor((date - release) / 86_400_000) + 1;
}

export function clampFlightToWindow(
  startDay: number,
  endDay: number,
  windowDays = CAMPAIGN_FLIGHT_WINDOW_DAYS,
): { startDay: number; endDay: number } | null {
  const start = Math.max(1, Math.min(startDay, endDay));
  const end = Math.min(windowDays, Math.max(startDay, endDay));
  if (end < 1 || start > windowDays) {
    return null;
  }
  return { startDay: start, endDay: end };
}

export function flightsToChartBands(
  flights: CampaignFlight[],
  releaseDate: string,
  windowDays = CAMPAIGN_FLIGHT_WINDOW_DAYS,
): CampaignFlightBand[] {
  const bands: CampaignFlightBand[] = [];

  for (const flight of flights) {
    if (!flight.startDate || !flight.endDate) {
      continue;
    }
    const startDay = isoDateToCampaignDay(releaseDate, flight.startDate);
    const endDay = isoDateToCampaignDay(releaseDate, flight.endDate);
    if (startDay == null || endDay == null) {
      continue;
    }
    const clamped = clampFlightToWindow(startDay, endDay, windowDays);
    if (!clamped) {
      continue;
    }
    bands.push({
      id: flight.id,
      name: flight.name.trim() || "Campaign",
      startDay: clamped.startDay,
      endDay: clamped.endDay,
    });
  }

  bands.sort((a, b) => a.startDay - b.startDay || a.endDay - b.endDay);
  return bands;
}

/** Plot-area left/width as percentages of the inner plot (day 1..window). */
export function flightBandPlotStyle(
  startDay: number,
  endDay: number,
  windowDays = CAMPAIGN_FLIGHT_WINDOW_DAYS,
): { left: string; width: string } {
  const span = Math.max(1, windowDays - 1);
  const left = ((startDay - 1) / span) * 100;
  const width = Math.max(((endDay - startDay) / span) * 100, 100 / span);
  return {
    left: `${left}%`,
    width: `${width}%`,
  };
}
