import {
  CAMPAIGN_FLIGHT_WINDOW_DAYS,
  flightBandPlotStyle,
  type CampaignFlightBand,
} from "@/lib/campaign-flights";

const BAND_COLORS = [
  "color-mix(in srgb, var(--color-accent) 35%, var(--color-border))",
  "color-mix(in srgb, var(--color-chart-locked) 40%, var(--color-border))",
  "color-mix(in srgb, var(--color-chart-projected) 35%, var(--color-border))",
  "color-mix(in srgb, var(--color-secondary) 22%, var(--color-border))",
];

export function CampaignFlightBands({
  bands,
  axisWidth,
  rightMargin,
  windowDays = CAMPAIGN_FLIGHT_WINDOW_DAYS,
  plotInset = 0,
}: {
  bands: CampaignFlightBand[];
  axisWidth: number;
  rightMargin: number;
  windowDays?: number;
  /** Match Recharts XAxis padding so bands share the plot scale. */
  plotInset?: number;
}) {
  if (bands.length === 0) {
    return null;
  }

  return (
    <div
      className="mt-1 space-y-1"
      style={{
        paddingLeft: axisWidth + plotInset,
        paddingRight: rightMargin + plotInset,
      }}
      aria-label="Campaign flight windows"
    >
      {bands.map((band, index) => {
        const plot = flightBandPlotStyle(band.startDay, band.endDay, windowDays);
        const color = BAND_COLORS[index % BAND_COLORS.length];
        return (
          <div key={band.id} className="relative h-4">
            <div
              className="absolute inset-y-0 overflow-hidden rounded-tag"
              style={{
                left: plot.left,
                width: plot.width,
                backgroundColor: color,
              }}
              title={`${band.name} · D${band.startDay}–D${band.endDay}`}
            >
              <span className="block truncate px-1.5 text-[10px] font-medium leading-4 text-secondary">
                {band.name}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
