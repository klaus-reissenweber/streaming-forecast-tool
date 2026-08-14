"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { activateDraftModel } from "@/app/admin/retrain/approve/actions";
import { StatusPill } from "@/components/ui/StatusPill";

export interface ApproveActivateFormProps {
  draftId: string;
  allHardPassed: boolean;
  canActivate: boolean;
}

export function ApproveActivateForm({
  draftId,
  allHardPassed,
  canActivate,
}: ApproveActivateFormProps) {
  const router = useRouter();
  const [overrideNotes, setOverrideNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const overrideRequired = !allHardPassed;
  const overrideOk = !overrideRequired || overrideNotes.trim().length > 0;
  const enabled = canActivate && overrideOk && !isPending;

  function onActivate() {
    setError(null);
    startTransition(async () => {
      const result = await activateDraftModel(
        draftId,
        overrideRequired ? overrideNotes : overrideNotes.trim() || null,
      );
      if (!result.success) {
        setError(result.error);
        return;
      }
      router.push("/archive");
      router.refresh();
    });
  }

  return (
    <section className="rounded-instrument border border-border bg-surface p-5 motion-fade-up">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-section font-semibold text-foreground">
          Use this model
        </h2>
        <StatusPill tone={allHardPassed ? "positive" : "warning"}>
          {allHardPassed ? "Hard pass" : "Override required"}
        </StatusPill>
      </div>

      {!allHardPassed ? (
        <p className="mt-2 text-body-sm text-secondary">
          One or more HARD guardrails failed. Type an override reason to enable
          Use this model — stored on the model row as{" "}
          <span className="font-mono text-xs">metadata.override_notes</span>.
        </p>
      ) : (
        <p className="mt-2 text-body-sm text-secondary">
          All HARD guardrails passed. Use this model promotes the draft to the
          live consolidated model (no deploy).
        </p>
      )}

      <label className="mt-4 block">
        <span className="text-caption uppercase tracking-wide text-secondary">
          Override reason{overrideRequired ? " (required)" : " (optional)"}
        </span>
        <textarea
          className="mt-1 w-full rounded-instrument border border-border bg-canvas px-3 py-2 font-mono text-sm text-foreground"
          rows={3}
          value={overrideNotes}
          onChange={(event) => setOverrideNotes(event.target.value)}
          placeholder={
            overrideRequired
              ? "Why promote despite HARD failures…"
              : "Optional note…"
          }
          disabled={!canActivate || isPending}
        />
      </label>

      {!canActivate ? (
        <p className="mt-3 text-body-sm text-semantic-warning">
          Your account is not authorized to promote retrain drafts.
        </p>
      ) : null}

      {error ? (
        <p className="mt-3 text-body-sm text-semantic-warning" role="alert">
          {error}
        </p>
      ) : null}

      <button
        type="button"
        className="mt-4 rounded-instrument bg-foreground px-4 py-2 text-sm font-medium text-canvas disabled:opacity-40"
        disabled={!enabled}
        onClick={onActivate}
      >
        {isPending ? "Promoting…" : "Use this model"}
      </button>
    </section>
  );
}
