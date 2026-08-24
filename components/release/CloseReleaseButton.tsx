"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { closeRelease } from "@/app/release/[id]/actions";

export interface CloseReleaseButtonProps {
  releaseId: string;
}

export function CloseReleaseButton({ releaseId }: CloseReleaseButtonProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onCloseClick() {
    const confirmed = window.confirm(
      "Close this release? Daily entry becomes read-only and it moves to Archive. This cannot be undone from the app.",
    );
    if (!confirmed) {
      return;
    }

    setError(null);
    startTransition(async () => {
      const result = await closeRelease(releaseId);
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
        onClick={onCloseClick}
        disabled={pending}
        className={
          "rounded-instrument border border-border px-3 py-1.5 text-body-sm font-medium " +
          (pending
            ? "cursor-not-allowed bg-bracket-bg text-secondary"
            : "bg-surface text-secondary hover:border-semantic-negative/40 hover:text-semantic-negative")
        }
      >
        {pending ? "Closing…" : "Close release"}
      </button>
      {error ? (
        <p className="max-w-xs text-body-sm text-semantic-negative">{error}</p>
      ) : null}
    </div>
  );
}
