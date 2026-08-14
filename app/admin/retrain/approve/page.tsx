import type { Metadata } from "next";
import Link from "next/link";
import { PageBreadcrumbs } from "@/components/layout/PageBreadcrumbs";
import { SectionHeader } from "@/components/layout/SectionHeader";
import { StatusPill, type PillTone } from "@/components/ui/StatusPill";
import { requireAllowedUser } from "@/lib/auth/require-allowed-user";
import { formatLockTimestamp } from "@/lib/format";
import { loadDraftModelSummaries } from "@/lib/load-draft-model";
import { loadRecentRetrainJobs } from "@/lib/load-retrain-job";

export const metadata: Metadata = {
  title: "Approve drafts",
  description: "Review retrain jobs and draft models before promoting.",
};

function statusTone(status: string): PillTone {
  switch (status) {
    case "queued":
    case "draft":
      return "neutral";
    case "running":
      return "accent";
    case "completed":
    case "active":
      return "positive";
    case "failed":
      return "warning";
    default:
      return "neutral";
  }
}

export default async function ApproveDraftsPage() {
  const auth = await requireAllowedUser();
  if (!auth.ok) {
    return (
      <main className="mx-auto max-w-3xl px-5 py-8">
        <h1 className="font-serif text-release-title font-semibold text-foreground">
          Approve drafts
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

  const [jobs, drafts] = await Promise.all([
    loadRecentRetrainJobs(20),
    loadDraftModelSummaries(20).catch(() => []),
  ]);

  return (
    <main className="mx-auto max-w-6xl px-5 py-8">
      <PageBreadcrumbs
        items={[
          { label: "Model", href: "/admin/retrain" },
          { label: "Approve drafts" },
        ]}
      />
      <header className="mt-4 border-b border-border pb-4">
        <h1 className="font-serif text-release-title font-semibold text-foreground">
          Approve drafts
        </h1>
        <p className="mt-1 text-body-sm text-secondary">
          Open a completed job or a standing draft to compare against the
          active model.
        </p>
      </header>

      <section className="mt-8" aria-label="Retrain jobs">
        <SectionHeader>Jobs</SectionHeader>
        {jobs.length === 0 ? (
          <p className="mt-3 text-body-sm text-muted">No retrain jobs yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-border-subtle overflow-hidden rounded-instrument border border-border bg-surface">
            {jobs.map((job) => (
              <li
                key={job.id}
                className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3"
              >
                <span className="flex flex-wrap items-baseline gap-2">
                  <StatusPill tone={statusTone(job.status)}>
                    {job.status}
                  </StatusPill>
                  <span className="font-mono text-body-sm text-foreground">
                    {job.id.slice(0, 8)}
                  </span>
                  <span className="text-caption text-muted">
                    {formatLockTimestamp(job.createdAt)}
                  </span>
                </span>
                {job.draftModelId ? (
                  <Link
                    href={`/admin/retrain/approve/${job.draftModelId}`}
                    className="text-sm font-medium text-accent-readable hover:underline"
                  >
                    Review draft
                  </Link>
                ) : (
                  <span className="text-caption text-muted">No draft yet</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8" aria-label="Draft models">
        <SectionHeader>Drafts</SectionHeader>
        {drafts.length === 0 ? (
          <p className="mt-3 text-body-sm text-muted">No standing drafts.</p>
        ) : (
          <ul className="mt-3 divide-y divide-border-subtle overflow-hidden rounded-instrument border border-border bg-surface">
            {drafts.map((draft) => (
              <li key={draft.id}>
                <Link
                  href={`/admin/retrain/approve/${draft.id}`}
                  className="flex items-baseline justify-between gap-3 px-4 py-3 hover:bg-canvas"
                >
                  <span className="flex items-baseline gap-2">
                    <StatusPill tone={statusTone(draft.status)}>
                      {draft.status}
                    </StatusPill>
                    <span className="font-mono text-body-sm text-foreground">
                      {draft.id.slice(0, 8)}
                    </span>
                  </span>
                  <span className="font-mono text-caption text-muted">
                    {draft.fittedAt ? formatLockTimestamp(draft.fittedAt) : "—"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
