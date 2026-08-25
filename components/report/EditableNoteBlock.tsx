"use client";

import { useEffect, useRef, useState } from "react";
import { saveAdReportNotes } from "@/app/report/[slug]/actions";
import { AnalysisSection } from "@/components/release/AnalysisBlock";
import {
  sectionText,
  type AdReportNoteKey,
  type AdReportNotes,
} from "@/lib/ad-report/notes";

const chromeClass =
  "text-caption text-accent-readable hover:underline print:hidden";
const markerClass = "text-caption text-muted print:hidden";
const textareaClass =
  "w-full resize-y rounded-instrument border border-border bg-surface px-2 py-1.5 text-body-sm font-normal text-foreground focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent";

const LABELS: Record<AdReportNoteKey, string> = {
  creative: "Creative",
  audience: "Audience",
  recommendations: "Recommendations",
};

export function EditableNoteBlock({
  slug,
  noteKey,
  notes,
  editable,
}: {
  slug: string;
  noteKey: AdReportNoteKey;
  notes: AdReportNotes;
  editable: boolean;
}) {
  const stored = sectionText(notes, noteKey);
  const [local, setLocal] = useState(stored);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(stored);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const next = sectionText(notes, noteKey);
    setLocal(next);
    if (!editing) setDraft(next);
  }, [notes, noteKey, editing]);

  useEffect(() => {
    if (editing) textareaRef.current?.focus();
  }, [editing]);

  if (!editable && !local.trim()) {
    return null;
  }

  async function persist(next: string) {
    if (next === local) {
      setEditing(false);
      return;
    }
    setSaving(true);
    setError(null);
    const result = await saveAdReportNotes(slug, {
      kind: "section",
      key: noteKey,
      value: next,
    });
    setSaving(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    const saved = sectionText(result.notes, noteKey);
    setLocal(saved);
    setDraft(saved);
    setEditing(false);
  }

  if (editing) {
    return (
      <AnalysisSection label={LABELS[noteKey]}>
        <textarea
          ref={textareaRef}
          value={draft}
          rows={Math.max(3, draft.split("\n").length)}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => {
            void persist(draft);
          }}
          className={textareaClass}
          disabled={saving}
        />
        <div className="flex flex-wrap items-center gap-x-2 print:hidden">
          <button
            type="button"
            className={chromeClass}
            disabled={saving}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              void persist(draft);
            }}
          >
            Save
          </button>
          {saving ? <span className={markerClass}>Saving</span> : null}
          {error ? (
            <span className="text-caption text-semantic-negative">{error}</span>
          ) : null}
        </div>
      </AnalysisSection>
    );
  }

  if (!editable) {
    return (
      <AnalysisSection label={LABELS[noteKey]}>
        <p className="whitespace-pre-wrap">{local}</p>
      </AnalysisSection>
    );
  }

  return (
    <AnalysisSection label={LABELS[noteKey]}>
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="block w-full cursor-text text-left text-body-sm font-normal text-foreground"
      >
        {local.trim() ? (
          <span className="whitespace-pre-wrap">{local}</span>
        ) : (
          <span className="text-muted print:hidden">Click to add</span>
        )}
      </button>
      {saving || error ? (
        <div className="flex flex-wrap items-center gap-x-2 print:hidden">
          {saving ? <span className={markerClass}>Saving</span> : null}
          {error ? (
            <span className="text-caption text-semantic-negative">{error}</span>
          ) : null}
        </div>
      ) : null}
    </AnalysisSection>
  );
}
