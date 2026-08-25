import type { Metadata } from "next";
import Link from "next/link";
import { PageBreadcrumbs } from "@/components/layout/PageBreadcrumbs";
import { StatusPill } from "@/components/ui/StatusPill";
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
  title: "Check Retrain",
  description: "Review diffs of the draft against the active model and use a retrain model.",
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
        <h1 className="text-release-title font-semibold text-foreground">
          Check Retrain
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
        <h1 className="text-release-title font-semibold text-foreground">
          Check Retrain
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
        <h1 className="text-release-title font-semibold text-foreground">
          Check Retrain
        </h1>
        <div className="mt-4 rounded-instrument border border-accent-border bg-accent-tint px-4 py-4">
          <p className="text-body-sm font-medium text-foreground">
            Retrain still pending
          </p>
          <p className="mt-2 text-body-sm text-secondary">
            No draft model is ready for{" "}
            <span>{draftId}</span> yet. A queued or
            running job can take up to 30 minutes. Check back from the archive
            when the draft link appears.
          </p>
        </div>
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
        <PageBreadcrumbs
          items={[
            { label: "Model", href: "/admin/retrain" },
            { label: "Approve Drafts", href: "/admin/retrain/approve" },
            { label: "Draft Against Active" },
          ]}
        />
        <h1 className="mt-4 text-release-title font-semibold text-foreground">
          Draft Against Active
        </h1>
      </header>

      <div className="mt-8 space-y-8">
        <DraftDiffTables diff={review.diff} />
        <GuardrailPanel hard={review.hard} soft={review.soft} />
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
              This model is already{" "}
              <span>{draft.status}</span> — Use this
              model is unavailable.
            </p>
          </section>
        )}

        <details className="rounded-instrument border border-border bg-surface p-5">
          <summary className="cursor-pointer text-section font-semibold text-foreground">
            Details
          </summary>
          <div className="mt-3 flex flex-wrap gap-3 text-body-sm text-secondary">
            <span>
              Draft id{" "}
              <span className="text-foreground">
                {draft.id?.slice(0, 8)}
              </span>
              <StatusPill tone="neutral">{draft.status}</StatusPill>
            </span>
            <span>
              Fitted{" "}
              <span className="text-foreground">{draft.fittedAt}</span>
            </span>
            <span>
              Active{" "}
              <span className="text-foreground">
                {formatActiveModelSource(active)}
              </span>
            </span>
          </div>
          {fb ? (
            <p className="mt-3 text-xs text-secondary">
              forward_bias all live {fmtBias(fb.all.live)} / new{" "}
              {fmtBias(fb.all.new)} · clean {fmtBias(fb.clean.live)} /{" "}
              {fmtBias(fb.clean.new)} · newest_10 {fmtBias(fb.newest10.live)} /{" "}
              {fmtBias(fb.newest10.new)}
            </p>
          ) : null}
        </details>
      </div>
    </main>
  );
}
