"use server";

import { requireAllowedUser } from "@/lib/auth/require-allowed-user";
import { canRetrain } from "@/lib/auth/retrain-allowed";
import { createClient } from "@/lib/supabase/server";

export type EnqueueRetrainResult =
  | { success: true; jobId: string }
  | { success: false; error: string };

/**
 * Insert a queued retrain_jobs row. GitHub Actions claims it (~every 30m).
 */
export async function enqueueRetrainJob(): Promise<EnqueueRetrainResult> {
  const auth = await requireAllowedUser();
  if (!auth.ok) {
    return { success: false, error: auth.error };
  }

  if (!canRetrain(auth.user.email)) {
    return {
      success: false,
      error: "Your account is not authorized to trigger retrain.",
    };
  }

  const supabase = await createClient();

  const { data: inflight, error: inflightError } = await supabase
    .from("retrain_jobs")
    .select("id, status")
    .in("status", ["queued", "running"])
    .limit(1)
    .maybeSingle();

  if (inflightError) {
    return {
      success: false,
      error: `Could not check job queue: ${inflightError.message}`,
    };
  }
  if (inflight) {
    return {
      success: false,
      error: `A retrain job is already ${inflight.status}. Wait for it to finish.`,
    };
  }

  const { data, error } = await supabase
    .from("retrain_jobs")
    .insert({
      status: "queued",
      triggered_by: auth.user.id,
      triggered_email: auth.user.email ?? null,
    })
    .select("id")
    .single();

  if (error || !data?.id) {
    const message = error?.message ?? "Insert failed";
    // Unique partial index race → friendly message
    if (message.toLowerCase().includes("retrain_jobs_one_inflight")) {
      return {
        success: false,
        error: "A retrain job is already queued or running.",
      };
    }
    return { success: false, error: message };
  }

  console.info(
    `[retrain-job] enqueued id=${data.id} by=${auth.user.email ?? "unknown"}`,
  );
  return { success: true, jobId: data.id };
}
