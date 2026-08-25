"use server";

import { revalidatePath } from "next/cache";
import { persistAdReportNotes } from "@/lib/ad-report/save-notes";
import {
  AD_REPORT_NOTE_KEYS,
  type AdReportNotes,
  type AdReportNotesPatch,
} from "@/lib/ad-report/notes";
import { requireAllowedUser } from "@/lib/auth/require-allowed-user";

export type SaveAdReportNotesResult =
  | { success: true; notes: AdReportNotes }
  | { success: false; error: string };

function parsePatch(raw: unknown): AdReportNotesPatch | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  if (row.kind === "section") {
    if (
      typeof row.key !== "string" ||
      !AD_REPORT_NOTE_KEYS.includes(row.key as (typeof AD_REPORT_NOTE_KEYS)[number])
    ) {
      return null;
    }
    if (typeof row.value !== "string") return null;
    return { kind: "section", key: row.key as (typeof AD_REPORT_NOTE_KEYS)[number], value: row.value };
  }
  if (row.kind === "finding") {
    if (typeof row.id !== "string") return null;
    if (row.override == null) {
      return { kind: "finding", id: row.id, override: null };
    }
    if (
      typeof row.override !== "object" ||
      Array.isArray(row.override)
    ) {
      return null;
    }
    const override = row.override as Record<string, unknown>;
    if (override.state !== "edited" && override.state !== "dismissed") {
      return null;
    }
    if (typeof override.text !== "string") return null;
    return {
      kind: "finding",
      id: row.id,
      override: { text: override.text, state: override.state },
    };
  }
  return null;
}

export async function saveAdReportNotes(
  slug: string,
  patch: AdReportNotesPatch,
): Promise<SaveAdReportNotesResult> {
  const auth = await requireAllowedUser();
  if (!auth.ok) return { success: false, error: auth.error };

  if (typeof slug !== "string" || slug.trim().length < 16) {
    return { success: false, error: "Invalid report." };
  }

  const parsed = parsePatch(patch);
  if (!parsed) {
    return { success: false, error: "Invalid notes patch." };
  }

  try {
    const notes = await persistAdReportNotes(slug.trim(), parsed);
    revalidatePath(`/report/${slug.trim()}`);
    return { success: true, notes };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
