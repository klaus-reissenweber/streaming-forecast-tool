import type { ArchiveSummary } from "@/lib/build-archive-view-model";

export interface ArchiveSummaryBarProps {
  summary: ArchiveSummary;
}

export function ArchiveSummaryBar({ summary }: ArchiveSummaryBarProps) {
  return (
    <p className="text-sm text-stone-600">
      <span className="font-semibold text-stone-900">{summary.totalClosed}</span>{" "}
      closed release{summary.totalClosed === 1 ? "" : "s"}
      <span className="text-stone-400"> · </span>
      <span className="font-semibold text-stone-900">
        {summary.retrainEligible}
      </span>{" "}
      with complete wk1 data (retrain-eligible)
    </p>
  );
}
