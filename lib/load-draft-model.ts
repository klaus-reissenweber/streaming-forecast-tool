/**
 * Load a draft consolidated forecast_model row by id (service role).
 */

import {
  activeModelFromRow,
  type ActiveModel,
  type ActiveModelRow,
} from "@/lib/model/active-model";
import { createServiceClient } from "@/lib/supabase/service";

export type DraftModelRow = ActiveModelRow & {
  status: string;
  is_active: boolean;
};

export type DraftModel = ActiveModel & {
  status: "draft" | "active" | "superseded" | string;
  isActive: boolean;
  rawMetadata: Record<string, unknown> | null;
};

export async function loadDraftModelById(
  draftId: string,
): Promise<DraftModel | null> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("model_coefficients")
    .select("id, fitted_at, activated_at, payload, metadata, status, is_active")
    .eq("id", draftId)
    .not("payload", "is", null)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`model_coefficients draft: ${error.message}`);
  }
  if (!data?.payload) {
    return null;
  }

  const row = data as DraftModelRow;
  const model = activeModelFromRow(row);
  const rawMetadata =
    row.metadata != null &&
    typeof row.metadata === "object" &&
    !Array.isArray(row.metadata)
      ? (row.metadata as Record<string, unknown>)
      : null;

  return {
    ...model,
    status: row.status,
    isActive: Boolean(row.is_active),
    rawMetadata,
  };
}

export type CooksDropRelease = {
  id: string;
  trackName: string;
  artistName: string;
};

/** Resolve Cook's D dropped release ids to display names. */
export async function loadCooksDropReleases(
  releaseIds: string[],
): Promise<CooksDropRelease[]> {
  if (releaseIds.length === 0) {
    return [];
  }
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("releases")
    .select("id, track_name, artist_name")
    .in("id", releaseIds);

  if (error) {
    throw new Error(`releases cooks drops: ${error.message}`);
  }

  const byId = new Map(
    (data ?? []).map((row) => [
      String(row.id),
      {
        id: String(row.id),
        trackName: String(row.track_name ?? "Unknown"),
        artistName: String(row.artist_name ?? "Unknown"),
      },
    ]),
  );

  return releaseIds.map(
    (id) =>
      byId.get(id) ?? {
        id,
        trackName: id.slice(0, 8),
        artistName: "—",
      },
  );
}
