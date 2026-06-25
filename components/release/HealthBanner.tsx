import type { HealthStatus, HealthSummary, HealthTone } from "@/lib/monitoring";

export interface HealthBannerProps {
  health: HealthSummary;
}

const STATUS_CONFIG: Record<
  HealthStatus,
  { tag: string; tagClass: string }
> = {
  "on-track": {
    tag: "[ON TRACK]",
    tagClass: "bracket-tag--neutral",
  },
  outperforming: {
    tag: "[OUTPERFORMING]",
    tagClass: "bracket-tag--positive",
  },
  lagging: {
    tag: "[LAGGING]",
    tagClass: "bracket-tag--negative",
  },
  awaiting: {
    tag: "[AWAITING]",
    tagClass: "bracket-tag--neutral",
  },
};

const TONE_STYLES: Record<
  HealthTone,
  { ruleClass: string; titleClass: string }
> = {
  positive: {
    ruleClass: "bg-semantic-positive",
    titleClass: "text-semantic-positive",
  },
  warning: {
    ruleClass: "bg-semantic-warning",
    titleClass: "text-semantic-warning",
  },
  negative: {
    ruleClass: "bg-semantic-negative",
    titleClass: "text-semantic-negative",
  },
  neutral: {
    ruleClass: "bg-muted",
    titleClass: "text-muted",
  },
};

export function HealthBanner({ health }: HealthBannerProps) {
  const statusConfig = STATUS_CONFIG[health.status];
  const toneStyles = TONE_STYLES[health.tone];

  return (
    <section
      className="motion-fade-up relative overflow-hidden rounded-instrument border border-border bg-surface py-2 pl-3.5 pr-3.5"
      aria-label="Release health"
    >
      <span
        className={`instrument-health-rule pointer-events-none absolute inset-y-0 left-0 w-[3px] ${toneStyles.ruleClass}`}
        aria-hidden="true"
      />

      <div className="instrument-health-content flex flex-col gap-1 sm:flex-row sm:flex-wrap sm:items-baseline sm:gap-x-2">
        <span className="inline-flex flex-wrap items-baseline gap-x-1.5 text-sm font-semibold leading-snug">
          <span className={`bracket-tag ${statusConfig.tagClass}`}>
            {statusConfig.tag}
          </span>
          <span className={toneStyles.titleClass}>{health.title}</span>
        </span>
        <span
          className="hidden text-body-sm text-muted sm:inline"
          aria-hidden="true"
        >
          ·
        </span>
        <p className="text-body-sm leading-snug text-secondary sm:inline">
          {health.detail}
        </p>
      </div>
    </section>
  );
}
