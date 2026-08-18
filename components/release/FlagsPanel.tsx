import { SectionHeader } from "@/components/layout/SectionHeader";
import { StatusPill, type PillTone } from "@/components/ui/StatusPill";
import type { ReleasePhase } from "@/lib/build-release-view-model";
import type { FlagType, ReleaseFlag } from "@/lib/flags";

export type { ReleaseFlag } from "@/lib/flags";

export interface FlagsPanelProps {
  phase: ReleasePhase;
  flags?: readonly ReleaseFlag[];
}

const FLAG_ROW_STAGGER_MS = 60;
const FLAG_ROW_INITIAL_DELAY_MS = 100;

const FLAG_TYPE_CONFIG: Record<
  FlagType,
  {
    label: string;
    tone: PillTone;
    ruleClass: string;
    titleClass: string;
  }
> = {
  positive: {
    label: "Positive",
    tone: "positive",
    ruleClass: "border-l-semantic-positive",
    titleClass: "text-semantic-positive",
  },
  warning: {
    label: "Warning",
    tone: "warning",
    ruleClass: "border-l-semantic-warning",
    titleClass: "text-semantic-warning",
  },
  info: {
    label: "Info",
    tone: "info",
    ruleClass: "border-l-semantic-info",
    titleClass: "text-semantic-info",
  },
};

export function FlagsPanel({ phase, flags = [] }: FlagsPanelProps) {
  if (phase === "pre-release" || flags.length === 0) {
    return null;
  }

  return (
    <section className="motion-fade-up" aria-label="Flags">
      <SectionHeader>Flags</SectionHeader>

      <ul className="mt-4 overflow-hidden rounded-instrument border border-border bg-surface">
        {flags.map((flag, index) => {
          const config = FLAG_TYPE_CONFIG[flag.type];
          const isLast = index === flags.length - 1;

          return (
            <li
              key={flag.id}
              className={`motion-flag-in border-l-[3px] py-2.5 pl-3.5 pr-3.5 ${config.ruleClass} ${
                isLast ? "" : "border-b border-border-subtle"
              }`}
              style={{
                animationDelay: `${
                  FLAG_ROW_INITIAL_DELAY_MS + index * FLAG_ROW_STAGGER_MS
                }ms`,
              }}
            >
              <p className="flex flex-wrap items-baseline gap-1.5 text-body-sm font-semibold">
                <StatusPill tone={config.tone}>{config.label}</StatusPill>
                <span className={`align-middle ${config.titleClass}`}>
                  {flag.title}
                </span>
              </p>
              <p className="mt-0.5 text-body-sm text-secondary">
                {flag.detail}
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
