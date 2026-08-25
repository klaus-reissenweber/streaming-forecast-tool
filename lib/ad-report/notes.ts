/**
 * ad_reports.notes — editorial JSON outside metrics_snapshot.
 * Generated findings are computed at render; this file only stores overrides.
 */

import type { Finding } from "@/lib/analysis/types";

export const AD_REPORT_NOTE_KEYS = [
  "creative",
  "audience",
  "recommendations",
] as const;

export type AdReportNoteKey = (typeof AD_REPORT_NOTE_KEYS)[number];

export type AdReportFindingState = "generated" | "edited" | "dismissed";

export type AdReportFindingOverride = {
  text: string;
  state: "edited" | "dismissed";
};

export type AdReportNotes = {
  creative?: string;
  audience?: string;
  recommendations?: string;
  findings?: Record<string, AdReportFindingOverride>;
};

export type AdReportNotesPatch =
  | { kind: "section"; key: AdReportNoteKey; value: string }
  | {
      kind: "finding";
      id: string;
      /** null reverts to generated (deletes the override). */
      override: AdReportFindingOverride | null;
    };

export type ResolvedFinding = {
  id: string;
  text: string;
  generatedText: string;
  state: AdReportFindingState;
};

const MAX_TEXT = 20_000;
const MAX_FINDING_ID = 200;

export function hasUsableBudget(
  budgetTotal: number | null | undefined,
): budgetTotal is number {
  return (
    budgetTotal != null && Number.isFinite(budgetTotal) && budgetTotal > 0
  );
}

export function parseAdReportNotes(raw: unknown): AdReportNotes {
  if (raw == null) return {};
  if (typeof raw !== "object" || Array.isArray(raw)) return {};
  const row = raw as Record<string, unknown>;
  const notes: AdReportNotes = {};

  for (const key of AD_REPORT_NOTE_KEYS) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) {
      notes[key] = value;
    }
  }

  if (row.findings && typeof row.findings === "object" && !Array.isArray(row.findings)) {
    const findings: Record<string, AdReportFindingOverride> = {};
    for (const [id, value] of Object.entries(
      row.findings as Record<string, unknown>,
    )) {
      const override = parseFindingOverride(value);
      if (override) findings[id] = override;
    }
    if (Object.keys(findings).length > 0) {
      notes.findings = findings;
    }
  }

  return notes;
}

function parseFindingOverride(raw: unknown): AdReportFindingOverride | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  if (row.state !== "edited" && row.state !== "dismissed") return null;
  const text = typeof row.text === "string" ? row.text : "";
  return { text, state: row.state };
}

export function compactAdReportNotes(notes: AdReportNotes): AdReportNotes {
  const next: AdReportNotes = {};
  for (const key of AD_REPORT_NOTE_KEYS) {
    const value = notes[key];
    if (typeof value === "string" && value.trim()) {
      next[key] = value;
    }
  }
  const findings: Record<string, AdReportFindingOverride> = {};
  for (const [id, override] of Object.entries(notes.findings ?? {})) {
    if (!id || !override) continue;
    if (override.state !== "edited" && override.state !== "dismissed") continue;
    findings[id] = {
      text: override.text,
      state: override.state,
    };
  }
  if (Object.keys(findings).length > 0) {
    next.findings = findings;
  }
  return next;
}

/** Null when there is nothing to store — keeps the column empty. */
export function notesToJson(notes: AdReportNotes): AdReportNotes | null {
  const compact = compactAdReportNotes(notes);
  return Object.keys(compact).length === 0 ? null : compact;
}

export function applyNotesPatch(
  notes: AdReportNotes,
  patch: AdReportNotesPatch,
): AdReportNotes {
  if (patch.kind === "section") {
    if (!AD_REPORT_NOTE_KEYS.includes(patch.key)) {
      throw new Error("Unknown notes section.");
    }
    const value = clampText(patch.value);
    return compactAdReportNotes({
      ...notes,
      [patch.key]: value.trim() ? value : undefined,
    });
  }

  const id = patch.id.trim();
  if (!id || id.length > MAX_FINDING_ID) {
    throw new Error("Invalid finding id.");
  }

  const findings = { ...(notes.findings ?? {}) };
  if (patch.override == null) {
    delete findings[id];
  } else {
    if (patch.override.state !== "edited" && patch.override.state !== "dismissed") {
      throw new Error("Invalid finding override.");
    }
    findings[id] = {
      text: clampText(patch.override.text),
      state: patch.override.state,
    };
  }

  return compactAdReportNotes({
    ...notes,
    findings: Object.keys(findings).length > 0 ? findings : undefined,
  });
}

/**
 * Generator output wins the id set. Overrides for missing ids are ignored
 * (not rendered as orphan sentences).
 */
export function resolveFindings(
  generated: Finding[],
  notes: AdReportNotes | null | undefined,
): ResolvedFinding[] {
  const overrides = notes?.findings ?? {};
  return generated.map((finding) => {
    const override = overrides[finding.id];
    if (!override) {
      return {
        id: finding.id,
        text: finding.text,
        generatedText: finding.text,
        state: "generated" as const,
      };
    }
    if (override.state === "dismissed") {
      return {
        id: finding.id,
        text: finding.text,
        generatedText: finding.text,
        state: "dismissed" as const,
      };
    }
    return {
      id: finding.id,
      text: override.text,
      generatedText: finding.text,
      state: "edited" as const,
    };
  });
}

export function visibleFindings(
  resolved: ResolvedFinding[],
  options?: { includeEmptyEdited?: boolean },
): Array<ResolvedFinding & { state: "generated" | "edited" }> {
  return resolved.filter((finding): finding is ResolvedFinding & { state: "generated" | "edited" } => {
    if (finding.state === "dismissed") return false;
    if (finding.text.trim()) return true;
    return Boolean(options?.includeEmptyEdited && finding.state === "edited");
  });
}

export function dismissedFindings(
  resolved: ResolvedFinding[],
): ResolvedFinding[] {
  return resolved.filter((finding) => finding.state === "dismissed");
}

export function sectionText(
  notes: AdReportNotes | null | undefined,
  key: AdReportNoteKey,
): string {
  const value = notes?.[key];
  return typeof value === "string" ? value : "";
}

function clampText(value: string): string {
  if (value.length <= MAX_TEXT) return value;
  return value.slice(0, MAX_TEXT);
}
