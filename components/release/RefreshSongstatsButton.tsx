"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { refreshSongstatsTotals } from "@/app/release/[id]/actions";

export interface RefreshSongstatsButtonProps {
  releaseId: string;
}

export function RefreshSongstatsButton({
  releaseId,
}: RefreshSongstatsButtonProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onClick() {
    setError(null);
    startTransition(async () => {
      const result = await refreshSongstatsTotals(releaseId);
      if (!result.success) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-start gap-1 sm:items-end">
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className={
          "rounded-instrument border border-border px-3 py-1.5 text-body-sm font-medium " +
          (pending
            ? "cursor-not-allowed bg-bracket-bg text-secondary"
            : "bg-surface text-foreground hover:border-accent")
        }
      >
        {pending ? "Refreshing…" : "Refresh from Songstats"}
      </button>
      {error ? (
        <p className="max-w-xs text-body-sm text-semantic-negative">{error}</p>
      ) : null}
    </div>
  );
}
