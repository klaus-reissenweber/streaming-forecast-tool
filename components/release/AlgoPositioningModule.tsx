import {
  ALGO_BAND_DISPLAY,
  ALGO_BAND_ORDER,
} from "@/lib/algo-positioning-display";
import { formatCompactNumber } from "@/lib/format";
import type { AlgoPositioningResult } from "@/lib/forecast";

export interface AlgoPositioningModuleProps {
  positioning: AlgoPositioningResult;
}

function formatThreshold(value: number): string {
  return formatCompactNumber(value);
}

export function AlgoPositioningModule({
  positioning,
}: AlgoPositioningModuleProps) {
  const { band, tier, saves, thresholds } = positioning;
  const active = ALGO_BAND_DISPLAY[band];

  return (
    <section
      className="motion-fade-up rounded-instrument border border-border bg-surface p-5"
      aria-label="Algorithmic positioning"
    >
      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="font-serif text-section font-semibold text-foreground">
            <span className="bracket-tag bracket-tag--accent bracket-tag--section instrument-section-title">
              [ALGO POSITIONING]
            </span>
          </h2>
          <p className="mt-1 text-body-sm text-muted">
            Week-1 save count vs {tier} tier benchmarks (locked forecast)
          </p>
        </div>
        <div className="mt-2 sm:mt-0 sm:text-right">
          <p className="text-label text-muted">Current projection</p>
          <p className="font-mono text-metric-value tabular-nums text-foreground">
            {formatCompactNumber(saves)}{" "}
            <span className="text-base font-sans font-medium text-muted">
              saves
            </span>
          </p>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {ALGO_BAND_ORDER.map((bandKey) => {
          const display = ALGO_BAND_DISPLAY[bandKey];
          const isActive = bandKey === band;

          let rangeLabel = "";
          if (bandKey === "weak") {
            rangeLabel = `< ${formatThreshold(thresholds.p25)}`;
          } else if (bandKey === "typical") {
            rangeLabel = `${formatThreshold(thresholds.p25)} – ${formatThreshold(thresholds.p75)}`;
          } else if (bandKey === "strong") {
            rangeLabel = `${formatThreshold(thresholds.p75)} – ${formatThreshold(thresholds.p90)}`;
          } else {
            rangeLabel = `≥ ${formatThreshold(thresholds.p90)}`;
          }

          return (
            <div
              key={bandKey}
              className={
                "rounded-instrument border p-4 transition " +
                (isActive
                  ? "border-l-[3px] border-l-accent border-border bg-accent-tint"
                  : "border-border bg-canvas")
              }
              aria-current={isActive ? "true" : undefined}
            >
              <div className="flex items-center justify-between gap-2">
                <h3
                  className={
                    "text-body-sm font-semibold " +
                    (isActive ? "text-accent-readable" : "text-foreground")
                  }
                >
                  {display.label}
                </h3>
                {isActive ? (
                  <span className="bracket-tag bracket-tag--accent">[YOU]</span>
                ) : null}
              </div>
              <p
                className={
                  "mt-1 font-mono text-xs tabular-nums " +
                  (isActive ? "text-accent-readable" : "text-muted")
                }
              >
                {rangeLabel} saves
              </p>
              <p className="mt-2 text-xs leading-relaxed text-secondary">
                {display.description}
              </p>
            </div>
          );
        })}
      </div>

      <p className="mt-4 text-body-sm text-secondary">
        Locked forecast places this release in the{" "}
        <span className="font-semibold text-foreground">{active.label}</span>{" "}
        band.
      </p>
    </section>
  );
}
