"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { refreshReleaseReport } from "@/app/release/[id]/report-actions";

export function ReleaseReportActions({
  releaseId,
  reportPath,
  reportUrl,
}: {
  releaseId: string;
  reportPath: string | null;
  reportUrl: string | null;
}) {
  const [path, setPath] = useState(reportPath);
  const [url, setUrl] = useState(reportUrl);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function copyLink() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Could not copy link.");
    }
  }

  function onRefresh() {
    setError(null);
    startTransition(async () => {
      const result = await refreshReleaseReport(releaseId);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setPath(result.path);
      setUrl(result.url);
    });
  }

  if (!path || !url) {
    return (
      <div className="flex flex-col items-start gap-1 sm:items-end">
        <button
          type="button"
          disabled={pending}
          onClick={onRefresh}
          className="text-sm font-medium text-accent-readable hover:text-accent-hover hover:underline disabled:opacity-40"
        >
          {pending ? "Generating…" : "Generate report"}
        </button>
        {error ? (
          <p className="max-w-xs text-right text-xs text-semantic-warning">
            {error}
          </p>
        ) : (
          <p className="max-w-xs text-right text-xs text-muted">
            Snapshot paid + forecast metrics for a shareable link
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-start gap-1 sm:items-end">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-medium">
        <Link
          href={path}
          target="_blank"
          rel="noopener noreferrer"
          className="text-accent-readable hover:text-accent-hover hover:underline"
        >
          View report
        </Link>
        <button
          type="button"
          onClick={() => void copyLink()}
          className="text-accent-readable hover:text-accent-hover hover:underline"
        >
          {copied ? "Copied" : "Copy link"}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={onRefresh}
          className="text-muted hover:text-foreground hover:underline disabled:opacity-40"
        >
          {pending ? "Refreshing…" : "Refresh snapshot"}
        </button>
      </div>
      {error ? (
        <p className="max-w-xs text-right text-xs text-semantic-warning">
          {error}
        </p>
      ) : null}
    </div>
  );
}
