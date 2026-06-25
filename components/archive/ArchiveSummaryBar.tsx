import type { ArchiveSummary } from "@/lib/build-archive-view-model";

export interface ArchiveSummaryBarProps {
  summary: ArchiveSummary;
}

export function ArchiveSummaryBar({ summary }: ArchiveSummaryBarProps) {
  return (
    <section
      className="motion-fade-up rounded-instrument border border-border bg-surface p-5"
      aria-label="Archive summary"
    >
      <h2 className="font-serif text-section font-semibold text-foreground">
        <span className="bracket-tag bracket-tag--accent bracket-tag--section instrument-section-title">
          [SUMMARY]
        </span>
      </h2>

      <p className="mt-3 text-body-sm text-muted">
        <span className="font-mono font-semibold tabular-nums text-foreground">
          {summary.totalClosed}
        </span>{" "}
        closed release{summary.totalClosed === 1 ? "" : "s"}
        <span className="text-muted"> · </span>
        <span className="font-mono font-semibold tabular-nums text-foreground">
          {summary.retrainEligible}
        </span>{" "}
        with complete wk1 data (retrain-eligible)
      </p>
    </section>
  );
}
