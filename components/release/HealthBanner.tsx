import type { HealthSummary } from "@/lib/monitoring";

export interface HealthBannerProps {
  health: HealthSummary;
}

type HealthTone = HealthSummary["tone"];

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

export function HealthBanner({ health }: HealthBannerProps) {
  const styles = TONE_STYLES[health.tone];

  return (
    <section
      className={`rounded-lg border p-4 ${styles.container}`}
      aria-label="Release health"
    >
      <p className={`text-sm font-semibold ${styles.title}`}>{health.title}</p>
      <p className={`mt-1 text-sm ${styles.detail}`}>{health.detail}</p>
    </section>
  );
}
