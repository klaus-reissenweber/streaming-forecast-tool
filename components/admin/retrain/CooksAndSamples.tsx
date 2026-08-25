import { StatusPill } from "@/components/ui/StatusPill";
import type { CooksDropRelease } from "@/lib/load-draft-model";
import type { ActiveModelMetadata } from "@/lib/model/active-model";

export function CooksAndSamples({
  metadata,
  drops,
}: {
  metadata: ActiveModelMetadata | null;
  drops: CooksDropRelease[];
}) {
  const samples = metadata?.sampleSizes;

  return (
    <section className="motion-fade-up grid gap-3 md:grid-cols-2">
      <div className="rounded-instrument border border-border bg-surface p-4">
        <div className="flex flex-wrap items-baseline gap-2">
          <h2 className="text-section font-semibold text-foreground">
            Sample Sizes
          </h2>
        </div>
        {samples ? (
          <dl className="mt-3 grid grid-cols-2 gap-2 text-body-sm">
            {(
              [
                ["Eligible", samples.eligible],
                ["Clean", samples.clean],
                ["Regression", samples.regression],
                ["Derived", samples.derived],
              ] as const
            ).map(([label, value]) => (
              <div key={label}>
                <dt className="text-caption text-secondary">{label}</dt>
                <dd className="text-foreground">{value}</dd>
              </div>
            ))}
            <div>
              <dt className="text-caption text-secondary">Cook&apos;s D drops</dt>
              <dd className="text-foreground">
                {metadata?.cooksDDrops ?? drops.length}
              </dd>
            </div>
          </dl>
        ) : (
          <p className="mt-2 text-body-sm text-secondary">No sample metadata.</p>
        )}
      </div>

      <div className="rounded-instrument border border-border bg-surface p-4">
        <div className="flex flex-wrap items-baseline gap-2">
          <h2 className="text-section font-semibold text-foreground">
            Cook&apos;s D Drops
          </h2>
          <StatusPill tone="warning">{drops.length}</StatusPill>
        </div>
        {drops.length === 0 ? (
          <p className="mt-2 text-body-sm text-secondary">None excluded.</p>
        ) : (
          <ul className="mt-3 max-h-64 space-y-1 overflow-y-auto text-body-sm">
            {drops.map((drop) => (
              <li key={drop.id} className="flex justify-between gap-2">
                <span className="text-foreground">
                  {drop.trackName}{" "}
                  <span className="text-secondary">— {drop.artistName}</span>
                </span>
                <span className="shrink-0 text-caption text-secondary">
                  {drop.id.slice(0, 8)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
