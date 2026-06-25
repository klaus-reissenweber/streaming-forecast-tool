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
    tag: string;
    tagClass: string;
    ruleClass: string;
    titleClass: string;
  }
> = {
  positive: {
    tag: "[+]",
    tagClass: "bracket-tag--positive",
    ruleClass: "border-l-semantic-positive",
    titleClass: "text-semantic-positive",
  },
  warning: {
    tag: "[WARN]",
    tagClass: "bracket-tag--warning",
    ruleClass: "border-l-semantic-warning",
    titleClass: "text-semantic-warning",
  },
  info: {
    tag: "[INFO]",
    tagClass: "bracket-tag--info",
    ruleClass: "border-l-semantic-info",
    titleClass: "text-semantic-info",
  },
};

export function FlagsPanel({ phase, flags = [] }: FlagsPanelProps) {
  const isEmpty = phase === "pre-release" || flags.length === 0;

  return (
    <section className="motion-fade-up" aria-label="Flags">
      <h2 className="font-serif text-section font-semibold text-foreground">
        <span className="bracket-tag bracket-tag--accent bracket-tag--section instrument-section-title">
          [FLAGS]
        </span>
      </h2>

      {isEmpty ? (
        <p className="mt-4 border border-dashed border-border bg-canvas px-4 py-8 text-center text-caption text-muted">
          Flags appear once daily data is entered
        </p>
      ) : (
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
                <p className="text-body-sm font-semibold">
                  <span
                    className={`bracket-tag mr-1.5 align-middle ${config.tagClass}`}
                  >
                    {config.tag}
                  </span>
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
      )}
    </section>
  );
}
