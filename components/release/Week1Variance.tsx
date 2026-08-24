import { SectionHeader } from "@/components/layout/SectionHeader";
import { AnalysisBlock } from "@/components/release/AnalysisBlock";
import { VarianceRail } from "@/components/release/VarianceRail";
import { week1Findings } from "@/lib/analysis/findings";
import type { MetricOutcome } from "@/lib/analysis/types";
import { expectedStreamRange } from "@/lib/save-rate-band-label";

export interface Week1VarianceProps {
  streams: number;
  saves: number;
  forecastSaveRate: number;
  actualStreams?: number | null;
  actualSaves?: number | null;
  actualSaveRate?: number | null;
  expectedStreamRange: { lo: number; hi: number };
  streamBand: { lo: number; hi: number };
  saveRateBand: { lo: number; hi: number };
  lockedAtDisplay: string;
}

function hasActual(n: number | null | undefined): n is number {
  return n != null && Number.isFinite(n);
}

export function Week1Variance({
  streams,
  saves,
  forecastSaveRate,
  actualStreams = null,
  actualSaves = null,
  actualSaveRate = null,
  expectedStreamRange: streamRange,
  streamBand,
  saveRateBand,
  lockedAtDisplay,
}: Week1VarianceProps) {
  const saveRange = expectedStreamRange(saves, streamBand);

  const metrics: MetricOutcome[] = [];
  if (hasActual(actualStreams)) {
    metrics.push({
      key: "Streams",
      actual: actualStreams,
      forecast: streams,
      lo: streamRange.lo,
      hi: streamRange.hi,
    });
  }
  if (hasActual(actualSaves)) {
    metrics.push({
      key: "Saves",
      actual: actualSaves,
      forecast: saves,
      lo: saveRange.lo,
      hi: saveRange.hi,
    });
  }
  if (hasActual(actualSaveRate)) {
    metrics.push({
      key: "Save rate",
      actual: actualSaveRate,
      forecast: forecastSaveRate,
      lo: saveRateBand.lo,
      hi: saveRateBand.hi,
      derived: true,
      isRate: true,
    });
  }

  const findings = metrics.length > 0 ? week1Findings(metrics) : [];

  return (
    <section
      className="motion-fade-up relative min-w-0 overflow-hidden rounded-instrument border border-border bg-surface px-4 py-3.5 md:px-5"
      aria-label="Week-1 forecast"
    >
      <span
        className="pointer-events-none absolute inset-y-0 left-0 w-1 origin-top bg-projected animate-instrument-rule-grow"
        aria-hidden="true"
      />

      <SectionHeader description={lockedAtDisplay}>
        Week-1 forecast
      </SectionHeader>

      <div className="mt-4 flex flex-col gap-5">
        <VarianceRail
          label="Streams"
          forecast={streams}
          lo={streamRange.lo}
          hi={streamRange.hi}
          actual={hasActual(actualStreams) ? actualStreams : null}
        />
        <VarianceRail
          label="Saves"
          forecast={saves}
          lo={saveRange.lo}
          hi={saveRange.hi}
          actual={hasActual(actualSaves) ? actualSaves : null}
        />
        <VarianceRail
          label="Save rate"
          forecast={forecastSaveRate}
          lo={saveRateBand.lo}
          hi={saveRateBand.hi}
          actual={hasActual(actualSaveRate) ? actualSaveRate : null}
          isRate
          derived
        />
      </div>

      <AnalysisBlock findings={findings} />
    </section>
  );
}
