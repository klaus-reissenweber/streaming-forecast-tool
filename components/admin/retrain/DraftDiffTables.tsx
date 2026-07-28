import type { DiffRow, ModelDiff } from "@/lib/model/draft-review";

function fmt(value: number, digits = 3): string {
  if (!Number.isFinite(value)) {
    return "—";
  }
  return Number.isInteger(value) && Math.abs(value) >= 100
    ? value.toLocaleString("en-US")
    : value.toFixed(digits);
}

function fmtDelta(value: number, digits = 3): string {
  if (!Number.isFinite(value)) {
    return "—";
  }
  if (Math.abs(value) < 1e-9) {
    return "0";
  }
  const sign = value > 0 ? "+" : "";
  return `${sign}${fmt(value, digits)}`;
}

function DiffTable({
  title,
  rows,
  digits = 3,
  compact = false,
}: {
  title: string;
  rows: DiffRow[];
  digits?: number;
  compact?: boolean;
}) {
  const visible = compact
    ? rows.filter((row) => Math.abs(row.delta) > 1e-9).slice(0, 12)
    : rows;
  const hidden = compact ? rows.length - visible.length : 0;

  return (
    <div className="rounded-instrument border border-border bg-surface p-4">
      <h3 className="font-serif text-sm font-semibold text-foreground">
        {title}
      </h3>
      {compact && visible.length === 0 ? (
        <p className="mt-2 text-body-sm text-secondary">No deltas (identical).</p>
      ) : (
        <table className="mt-3 w-full text-left text-xs">
          <thead>
            <tr className="text-secondary">
              <th className="pb-1 font-normal">Param</th>
              <th className="pb-1 font-normal">New</th>
              <th className="pb-1 font-normal">Active</th>
              <th className="pb-1 font-normal">Δ</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr key={row.label} className="border-t border-border/60">
                <td className="py-1 font-mono text-foreground">{row.label}</td>
                <td className="py-1 font-mono">{fmt(row.draft, digits)}</td>
                <td className="py-1 font-mono text-secondary">
                  {fmt(row.active, digits)}
                </td>
                <td className="py-1 font-mono">{fmtDelta(row.delta, digits)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {hidden > 0 ? (
        <p className="mt-2 text-caption text-secondary">
          +{hidden} unchanged rows omitted
        </p>
      ) : null}
    </div>
  );
}

export function DraftDiffTables({ diff }: { diff: ModelDiff }) {
  return (
    <section className="motion-fade-up">
      <div className="mb-3 flex flex-wrap items-baseline gap-2">
        <h2 className="font-serif text-section font-semibold text-foreground">
          Diff vs active
        </h2>
        <span className="bracket-tag bracket-tag--accent">NEW / ACTIVE / Δ</span>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <DiffTable title="DOW" rows={diff.dow} digits={3} />
        <DiffTable title="Editorial kernel" rows={diff.editorialKernel} digits={2} />
        <DiffTable
          title="Trend median"
          rows={diff.trendMedian}
          digits={1}
          compact
        />
        <DiffTable title="Trend p25" rows={diff.trendP25} digits={1} compact />
        <DiffTable title="Trend p75" rows={diff.trendP75} digits={1} compact />
        <DiffTable
          title="Release-type multipliers"
          rows={diff.releaseTypeMagnitude}
          digits={3}
        />
        <DiffTable
          title="Save-rate bands"
          rows={diff.saveRateBands}
          digits={1}
          compact
        />
        <DiffTable
          title="Save-count bands"
          rows={diff.saveCountBands}
          digits={0}
          compact
        />
      </div>
    </section>
  );
}
