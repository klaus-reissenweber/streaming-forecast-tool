import Link from "next/link";
import {
  formatAdResultsSummary,
  hasAdResults,
  type AdResultsSummary,
} from "@/lib/ad-results-summary";

export function AdResultsStatus({
  summary,
  href,
}: {
  summary: AdResultsSummary;
  /** When set, the primary action is a link (release page). Omit on the upload page. */
  href?: string;
}) {
  const entered = hasAdResults(summary);

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <p
        className={
          entered
            ? "text-sm font-medium text-foreground"
            : "text-sm text-secondary"
        }
      >
        {entered
          ? formatAdResultsSummary(summary)
          : "No ad results yet"}
      </p>
      {href ? (
        <Link
          href={href}
          className={
            entered
              ? "text-sm font-medium text-accent-readable hover:underline"
              : "inline-flex rounded-instrument bg-foreground px-3 py-1.5 text-sm font-medium text-canvas hover:bg-foreground/90"
          }
        >
          {entered ? "Add or edit results" : "Enter ad results"}
        </Link>
      ) : null}
    </div>
  );
}
