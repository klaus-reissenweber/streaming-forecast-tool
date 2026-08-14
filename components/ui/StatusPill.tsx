import type { ReactNode } from "react";

export type PillTone =
  | "neutral"
  | "positive"
  | "warning"
  | "negative"
  | "info"
  | "accent";

const TONE_CLASS: Record<PillTone, string> = {
  neutral: "bg-canvas text-secondary",
  positive: "bg-semantic-positive-bg text-semantic-positive",
  warning: "bg-semantic-warning-bg text-semantic-warning",
  negative: "bg-semantic-negative-bg text-semantic-negative",
  info: "bg-semantic-info-bg text-semantic-info",
  accent: "bg-accent-tint text-accent-readable",
};

export function StatusPill({
  tone = "neutral",
  children,
}: {
  tone?: PillTone;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${TONE_CLASS[tone]}`}
    >
      {children}
    </span>
  );
}
