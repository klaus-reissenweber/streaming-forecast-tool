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
    <section className="rounded-lg border border-stone-200 bg-white p-5">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-stone-900">
            Algorithmic positioning
          </h2>
          <p className="mt-1 text-sm text-stone-500">
            Week-1 save count vs {tier} tier benchmarks (locked forecast)
          </p>
        </div>
        <div className="mt-2 sm:mt-0 sm:text-right">
          <p className="text-xs font-medium uppercase tracking-wide text-stone-500">
            Current projection
          </p>
          <p className="text-2xl font-semibold tabular-nums text-stone-900">
            {formatCompactNumber(saves)}{" "}
            <span className="text-base font-medium text-stone-500">saves</span>
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
                "rounded-lg border p-4 transition " +
                (isActive
                  ? "border-orange-700 bg-orange-50 ring-1 ring-orange-700/20"
                  : "border-stone-200 bg-stone-50/50")
              }
              aria-current={isActive ? "true" : undefined}
            >
              <div className="flex items-center justify-between gap-2">
                <h3
                  className={
                    "text-sm font-semibold " +
                    (isActive ? "text-orange-900" : "text-stone-800")
                  }
                >
                  {display.label}
                </h3>
                {isActive ? (
                  <span className="rounded-full bg-orange-700 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                    You
                  </span>
                ) : null}
              </div>
              <p
                className={
                  "mt-1 text-xs tabular-nums " +
                  (isActive ? "text-orange-800/80" : "text-stone-500")
                }
              >
                {rangeLabel} saves
              </p>
              <p
                className={
                  "mt-2 text-xs leading-relaxed " +
                  (isActive ? "text-orange-950/90" : "text-stone-600")
                }
              >
                {display.description}
              </p>
            </div>
          );
        })}
      </div>

      <p className="mt-4 text-sm text-stone-700">
        Locked forecast places this release in the{" "}
        <span className="font-semibold text-stone-900">{active.label}</span> band.
      </p>
    </section>
  );
}
