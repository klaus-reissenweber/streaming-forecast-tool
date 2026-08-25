import type { ReactNode } from "react";
import type { Finding } from "@/lib/analysis/types";

export function AnalysisSection({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="mt-4 border-t border-border pt-4">
      <p className="text-[10.5px] font-medium uppercase tracking-[0.1em] text-foreground">
        {label}
      </p>
      <div className="mt-2 max-w-[70ch] space-y-1.5 text-body-sm font-normal text-foreground">
        {children}
      </div>
    </div>
  );
}

export function AnalysisBlock({ findings }: { findings: Finding[] }) {
  if (findings.length === 0) {
    return null;
  }

  return (
    <AnalysisSection label="Analysis">
      <ul className="space-y-1.5">
        {findings.map((finding) => (
          <li key={finding.id} className="whitespace-pre-wrap">
            {finding.text}
          </li>
        ))}
      </ul>
    </AnalysisSection>
  );
}
