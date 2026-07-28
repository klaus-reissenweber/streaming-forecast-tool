"use server";

import { requireAllowedUser } from "@/lib/auth/require-allowed-user";
import { canRetrain } from "@/lib/auth/retrain-allowed";
import {
  clearActiveModelCache,
  loadActiveModel,
} from "@/lib/load-active-model";
import { loadDraftModelById } from "@/lib/load-draft-model";
import {
  buildDraftReview,
  parseRawGuardrails,
} from "@/lib/model/draft-review";
import { createServiceClient } from "@/lib/supabase/service";

export type ActivateDraftResult =
  | { success: true; activatedId: string }
  | { success: false; error: string };

/**
 * Activate a draft consolidated forecast_model (Phase 2b).
 * Requires canRetrain. HARD failures need a non-empty override reason.
 */
export async function activateDraftModel(
  draftId: string,
  overrideNotes: string | null,
): Promise<ActivateDraftResult> {
  const auth = await requireAllowedUser();
  if (!auth.ok) {
    return { success: false, error: auth.error };
  }
  if (!canRetrain(auth.user.email)) {
    return {
      success: false,
      error: "Your account is not authorized to activate retrain drafts.",
    };
  }

  const draft = await loadDraftModelById(draftId);
  if (!draft) {
    return { success: false, error: "Draft model not found." };
  }
  if (draft.status !== "draft") {
    return {
      success: false,
      error: `Model is status=${draft.status}, expected draft.`,
    };
  }

  const active = await loadActiveModel();
  const review = buildDraftReview(
    {
      ...draft,
      rawGuardrails: parseRawGuardrails(draft.rawMetadata),
    },
    active,
  );

  const trimmedOverride = overrideNotes?.trim() ?? "";
  if (!review.allHardPassed && trimmedOverride.length === 0) {
    return {
      success: false,
      error:
        "HARD guardrails failed — type an override reason to activate anyway.",
    };
  }

  const service = createServiceClient();
  const overridePayload =
    trimmedOverride.length > 0 ? trimmedOverride : null;

  const { data, error } = await service.rpc("activate_draft_forecast_model", {
    p_draft_id: draftId,
    p_override_notes: overridePayload,
  });

  if (error) {
    const missingRpc =
      /activate_draft_forecast_model|Could not find the function|PGRST202/i.test(
        error.message,
      );
    if (!missingRpc) {
      return { success: false, error: `Activate failed: ${error.message}` };
    }

    // Fallback until 202607280003 migration is applied.
    const fallback = await activateDraftSequentially(
      draftId,
      draft.rawMetadata,
      overridePayload,
    );
    if (!fallback.ok) {
      return { success: false, error: fallback.error };
    }
  } else {
    void data;
  }

  clearActiveModelCache();
  console.info(
    `[active-model] activated draft=${draftId} by=${auth.user.email ?? "unknown"}` +
      (trimmedOverride ? ` override=${JSON.stringify(trimmedOverride)}` : ""),
  );

  return { success: true, activatedId: draftId };
}

async function activateDraftSequentially(
  draftId: string,
  rawMetadata: Record<string, unknown> | null,
  overrideNotes: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const service = createServiceClient();
  const nextMetadata: Record<string, unknown> = { ...(rawMetadata ?? {}) };
  if (overrideNotes != null) {
    nextMetadata.override_notes = overrideNotes;
  }

  const { error: demoteError } = await service
    .from("model_coefficients")
    .update({ status: "superseded", is_active: false })
    .eq("status", "active")
    .not("payload", "is", null)
    .neq("id", draftId);

  if (demoteError) {
    return {
      ok: false,
      error: `Activate demote failed: ${demoteError.message}`,
    };
  }

  const { data, error: promoteError } = await service
    .from("model_coefficients")
    .update({
      status: "active",
      is_active: true,
      activated_at: new Date().toISOString(),
      metadata: nextMetadata,
    })
    .eq("id", draftId)
    .eq("status", "draft")
    .select("id")
    .limit(1);

  if (promoteError) {
    return {
      ok: false,
      error: `Activate promote failed: ${promoteError.message}`,
    };
  }
  if (!data?.length) {
    return {
      ok: false,
      error: "Activate promote matched no draft row.",
    };
  }
  return { ok: true };
}
