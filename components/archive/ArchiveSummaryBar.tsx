import { SectionHeader } from "@/components/layout/SectionHeader";
import type { ArchiveSummary } from "@/lib/build-archive-view-model";

export interface ArchiveSummaryBarProps {
  summary: ArchiveSummary;
}

export function ArchiveSummaryBar({ summary }: ArchiveSummaryBarProps) {
  return (
    <section
      className="motion-fade-up rounded-instrument border border-border bg-surface p-5"
      aria-label="Archive Summary"
    >
      <SectionHeader>Summary</SectionHeader>

      <p className="mt-3 text-body-sm text-secondary">
        <span className="font-semibold tabular-nums text-foreground">
          {summary.totalClosed}
        </span>{" "}
        closed release{summary.totalClosed === 1 ? "" : "s"}
        <span className="text-secondary"> · </span>
        <span className="font-semibold tabular-nums text-foreground">
          {summary.retrainEligible}
        </span>{" "}
        with complete week 1 data (retrain-eligible)
      </p>
    </section>
  );
}
