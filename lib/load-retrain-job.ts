import { createClient } from "@/lib/supabase/server";

export type RetrainJobStatus = "queued" | "running" | "completed" | "failed";

export type RetrainJobSummary = {
  id: string;
  status: RetrainJobStatus;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  draftModelId: string | null;
  error: string | null;
  triggeredEmail: string | null;
};

function isStatus(value: unknown): value is RetrainJobStatus {
  return (
    value === "queued" ||
    value === "running" ||
    value === "completed" ||
    value === "failed"
  );
}

function mapRow(row: Record<string, unknown>): RetrainJobSummary | null {
  if (typeof row.id !== "string" || !isStatus(row.status)) {
    return null;
  }
  if (typeof row.created_at !== "string") {
    return null;
  }
  return {
    id: row.id,
    status: row.status,
    createdAt: row.created_at,
    startedAt: typeof row.started_at === "string" ? row.started_at : null,
    completedAt:
      typeof row.completed_at === "string" ? row.completed_at : null,
    draftModelId:
      typeof row.draft_model_id === "string" ? row.draft_model_id : null,
    error: typeof row.error === "string" ? row.error : null,
    triggeredEmail:
      typeof row.triggered_email === "string" ? row.triggered_email : null,
  };
}

/** Latest job (any status) for the archive panel chip. */
export async function loadLatestRetrainJob(): Promise<RetrainJobSummary | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("retrain_jobs")
    .select(
      "id, status, created_at, started_at, completed_at, draft_model_id, error, triggered_email",
    )
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    // Table may not exist until migration is applied.
    console.info(`[retrain-job] loadLatest: ${error.message}`);
    return null;
  }
  if (!data) {
    return null;
  }
  return mapRow(data as Record<string, unknown>);
}

export async function loadRetrainJobById(
  jobId: string,
): Promise<RetrainJobSummary | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("retrain_jobs")
    .select(
      "id, status, created_at, started_at, completed_at, draft_model_id, error, triggered_email",
    )
    .eq("id", jobId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }
  return mapRow(data as Record<string, unknown>);
}
