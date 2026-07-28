import type { Metadata } from "next";
import Link from "next/link";
import { ApproveActivateForm } from "@/components/admin/retrain/ApproveActivateForm";
import { ComposedCurvePreview } from "@/components/admin/retrain/ComposedCurvePreview";
import { CooksAndSamples } from "@/components/admin/retrain/CooksAndSamples";
import { DraftDiffTables } from "@/components/admin/retrain/DraftDiffTables";
import { GuardrailPanel } from "@/components/admin/retrain/GuardrailPanel";
import { canRetrain } from "@/lib/auth/retrain-allowed";
import { requireAllowedUser } from "@/lib/auth/require-allowed-user";
import { loadActiveModel } from "@/lib/load-active-model";
import {
  loadCooksDropReleases,
  loadDraftModelById,
} from "@/lib/load-draft-model";
import {
  buildDraftReview,
  parseCooksDroppedIds,
  parseRawGuardrails,
} from "@/lib/model/draft-review";
import {
  formatActiveModelSource,
  logActiveModelSource,
} from "@/lib/model/forecast-model";

interface ApprovePageProps {
  params: Promise<{ draftId: string }>;
}

export const metadata: Metadata = {
  title: "Approve draft model",
  description: "Review and activate a draft retrain model version.",
};

function fmtBias(value: number): string {
  const pct = value * 100;
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(1)}%`;
}

export default async function ApproveDraftPage({ params }: ApprovePageProps) {
  const { draftId } = await params;
  const auth = await requireAllowedUser();
  const canActivate = auth.ok && canRetrain(auth.user.email);

  if (!auth.ok) {
    return (
      <main className="mx-auto max-w-3xl px-5 py-8">
        <h1 className="font-serif text-release-title font-semibold text-foreground">
          Approve draft model
        </h1>
        <p className="mt-3 text-body-sm text-secondary">{auth.error}</p>
        <p className="mt-6">
          <Link href="/login" className="text-accent-readable hover:underline">
            Sign in
          </Link>
        </p>
      </main>
    );
  }

  if (!canRetrain(auth.user.email)) {
    return (
      <main className="mx-auto max-w-3xl px-5 py-8">
        <h1 className="font-serif text-release-title font-semibold text-foreground">
          Approve draft model
        </h1>
        <p className="mt-3 text-body-sm text-secondary">
          Your account is not authorized to review retrain drafts.
        </p>
        <p className="mt-6">
          <Link href="/archive" className="text-accent-readable hover:underline">
            ← Back to archive
          </Link>
        </p>
      </main>
    );
  }

  const [draft, active] = await Promise.all([
    loadDraftModelById(draftId),
    loadActiveModel(),
  ]);

  if (!draft) {
    return (
      <main className="mx-auto max-w-3xl px-5 py-8">
        <h1 className="font-serif text-release-title font-semibold text-foreground">
          Approve draft model
        </h1>
        <p className="mt-3 text-body-sm text-secondary">
          No consolidated model found for{" "}
          <span className="font-mono">{draftId}</span>.
        </p>
        <p className="mt-6">
          <Link href="/archive" className="text-accent-readable hover:underline">
            ← Back to archive
          </Link>
        </p>
      </main>
    );
  }

  logActiveModelSource(active, "approve-draft");

  const rawGuardrails = parseRawGuardrails(draft.rawMetadata);
  const review = buildDraftReview({ ...draft, rawGuardrails }, active);
  const cooksIds = parseCooksDroppedIds(draft.rawMetadata);
  const cooksDrops = await loadCooksDropReleases(cooksIds);
  const fb = draft.metadata?.forwardBias;

  return (
    <main className="mx-auto max-w-6xl px-5 py-8">
      <header className="motion-fade-up">
        <p className="text-caption uppercase tracking-wide text-secondary">
          <Link href="/archive" className="hover:underline">
            Archive
          </Link>
          {" / "}
          Retrain approve
        </p>
        <h1 className="mt-2 font-serif text-release-title font-semibold text-foreground">
          Approve draft model
        </h1>
        <div className="mt-3 flex flex-wrap gap-3 text-body-sm text-secondary">
          <span>
            Draft{" "}
            <span className="font-mono text-foreground">
              {draft.id?.slice(0, 8)}
            </span>
            <span className="ml-2 bracket-tag bracket-tag--neutral">
              {draft.status.toUpperCase()}
            </span>
          </span>
          <span>
            Fitted{" "}
            <span className="font-mono text-foreground">{draft.fittedAt}</span>
          </span>
          <span>
            Active{" "}
            <span className="font-mono text-foreground">
              {formatActiveModelSource(active)}
            </span>
          </span>
        </div>
        {fb ? (
          <p className="mt-3 font-mono text-xs text-secondary">
            forward_bias all live {fmtBias(fb.all.live)} / new{" "}
            {fmtBias(fb.all.new)} · clean {fmtBias(fb.clean.live)} /{" "}
            {fmtBias(fb.clean.new)} · newest_10 {fmtBias(fb.newest10.live)} /{" "}
            {fmtBias(fb.newest10.new)}
          </p>
        ) : null}
      </header>

      <div className="mt-8 space-y-8">
        <GuardrailPanel hard={review.hard} soft={review.soft} />
        <DraftDiffTables diff={review.diff} />
        <ComposedCurvePreview curves={review.curves} />
        <CooksAndSamples metadata={draft.metadata} drops={cooksDrops} />
        {draft.status === "draft" ? (
          <ApproveActivateForm
            draftId={draftId}
            allHardPassed={review.allHardPassed}
            canActivate={canActivate}
          />
        ) : (
          <section className="rounded-instrument border border-border bg-surface p-5">
            <p className="text-body-sm text-secondary">
              This model is already <span className="font-mono">{draft.status}</span>
              — Activate is unavailable.
            </p>
          </section>
        )}
      </div>
    </main>
  );
}
