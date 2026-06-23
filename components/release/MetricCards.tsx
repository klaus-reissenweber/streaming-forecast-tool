import { formatCompactNumber } from "@/lib/format";

export interface MetricCardsProps {
  projectedWk1Streams: number;
  saveVelocity: string | null;
  algoBandLabel: string;
  modelConfidenceR2: number;
}

function formatR2(value: number): string {
  if (!Number.isFinite(value)) {
    return "n/a";
  }
  return value.toFixed(2);
}

function MetricCard({
  label,
  value,
  sublabel,
}: {
  label: string;
  value: string;
  sublabel?: string;
}) {
  return (
    <div className="rounded-lg border border-stone-200 bg-white p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-stone-500">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold tabular-nums text-stone-900">
        {value}
      </p>
      {sublabel ? (
        <p className="mt-1 text-xs text-stone-500">{sublabel}</p>
      ) : null}
    </div>
  );
}

export function MetricCards({
  projectedWk1Streams,
  saveVelocity,
  algoBandLabel,
  modelConfidenceR2,
}: MetricCardsProps) {
  return (
    <section aria-label="Key metrics">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Projected wk1"
          value={formatCompactNumber(projectedWk1Streams)}
          sublabel="Locked streams forecast"
        />
        <MetricCard
          label="Save velocity"
          value={saveVelocity ?? "Awaiting data"}
          sublabel={saveVelocity ? "Vs tier-typical pace" : "Needs daily saves"}
        />
        <MetricCard
          label="Algo positioning"
          value={algoBandLabel}
          sublabel="From locked forecast saves"
        />
        <MetricCard
          label="Model confidence"
          value={formatR2(modelConfidenceR2)}
          sublabel="streams_d0 R²"
        />
      </div>
    </section>
  );
}
