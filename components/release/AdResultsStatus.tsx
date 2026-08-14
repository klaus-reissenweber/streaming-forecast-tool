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

  if (!entered) {
    return (
      <div className="rounded-instrument border border-dashed border-border bg-canvas px-4 py-4">
        <p className="text-sm font-medium text-foreground">No ad results yet</p>
        <p className="mt-1 text-sm text-muted">
          Enter campaign numbers or upload a partner export.
        </p>
        {href ? (
          <p className="mt-3">
            <Link
              href={href}
              className="inline-flex rounded-instrument bg-foreground px-3 py-1.5 text-sm font-medium text-canvas hover:bg-foreground/90"
            >
              Enter ad results
            </Link>
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="rounded-instrument border border-border bg-surface px-4 py-4">
      <p className="text-sm font-medium text-foreground">
        {formatAdResultsSummary(summary)}
      </p>
      <p className="mt-1 text-sm text-muted">
        {href
          ? "Add more campaigns or update existing ones."
          : "Add more below, or re-upload to update existing campaigns."}
      </p>
      {href ? (
        <p className="mt-3">
          <Link
            href={href}
            className="text-sm font-medium text-accent-readable hover:underline"
          >
            Add or edit results
          </Link>
        </p>
      ) : null}
    </div>
  );
}
