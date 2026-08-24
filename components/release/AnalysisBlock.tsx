import type { Finding } from "@/lib/analysis/types";

export function AnalysisBlock({ findings }: { findings: Finding[] }) {
  if (findings.length === 0) {
    return null;
  }

  return (
    <div className="mt-4 border-t border-border pt-4">
      <p className="text-[10.5px] font-medium uppercase tracking-[0.1em] text-foreground">
        Analysis
      </p>
      <ul className="mt-2 max-w-[70ch] space-y-1.5 text-body-sm font-normal text-foreground">
        {findings.map((finding) => (
          <li key={finding.id}>{finding.text}</li>
        ))}
      </ul>
    </div>
  );
}
