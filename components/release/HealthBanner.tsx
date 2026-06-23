import type { ReleasePhase } from "@/lib/build-release-view-model";

export interface HealthBannerProps {
  phase: ReleasePhase;
}

type HealthTone = "neutral" | "positive" | "warning" | "negative";

interface HealthContent {
  tone: HealthTone;
  title: string;
  detail: string;
}

function healthContentForPhase(phase: ReleasePhase): HealthContent {
  if (phase === "pre-release") {
    return {
      tone: "neutral",
      title: "Awaiting day 1 data",
      detail:
        "Health scoring activates once daily streams and saves are entered after release.",
    };
  }

  return {
    tone: "neutral",
    title: "Monitoring active",
    detail:
      "On-track / outperforming / lagging states will compare actuals to the locked forecast in step 6.",
  };
}

const TONE_STYLES: Record<
  HealthTone,
  { container: string; title: string; detail: string }
> = {
  neutral: {
    container: "border-stone-200 bg-stone-50",
    title: "text-stone-900",
    detail: "text-stone-600",
  },
  positive: {
    container: "border-emerald-200 bg-emerald-50",
    title: "text-emerald-900",
    detail: "text-emerald-800",
  },
  warning: {
    container: "border-amber-200 bg-amber-50",
    title: "text-amber-900",
    detail: "text-amber-800",
  },
  negative: {
    container: "border-red-200 bg-red-50",
    title: "text-red-900",
    detail: "text-red-800",
  },
};

export function HealthBanner({ phase }: HealthBannerProps) {
  const content = healthContentForPhase(phase);
  const styles = TONE_STYLES[content.tone];

  return (
    <section
      className={`rounded-lg border p-4 ${styles.container}`}
      aria-label="Release health"
    >
      <p className={`text-sm font-semibold ${styles.title}`}>{content.title}</p>
      <p className={`mt-1 text-sm ${styles.detail}`}>{content.detail}</p>
    </section>
  );
}
