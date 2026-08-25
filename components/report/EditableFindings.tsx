"use client";

import { useEffect, useRef, useState } from "react";
import { saveAdReportNotes } from "@/app/report/[slug]/actions";
import { AnalysisSection } from "@/components/release/AnalysisBlock";
import {
  dismissedFindings,
  resolveFindings,
  visibleFindings,
  type AdReportNotes,
} from "@/lib/ad-report/notes";
import type { Finding } from "@/lib/analysis/types";

const chromeClass =
  "text-caption text-accent-readable hover:underline print:hidden";
const markerClass = "text-caption text-muted print:hidden";
const textareaClass =
  "w-full resize-y rounded-instrument border border-border bg-surface px-2 py-1.5 text-body-sm font-normal text-foreground focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent";

export function EditableFindings({
  slug,
  findings,
  notes,
  editable,
}: {
  slug: string;
  findings: Finding[];
  notes: AdReportNotes;
  editable: boolean;
}) {
  const [localNotes, setLocalNotes] = useState(notes);
  useEffect(() => {
    setLocalNotes(notes);
  }, [notes]);

  const resolved = resolveFindings(findings, localNotes);
  const visible = visibleFindings(resolved, { includeEmptyEdited: editable });
  const dismissed = editable ? dismissedFindings(resolved) : [];

  if (visible.length === 0 && dismissed.length === 0) {
    return null;
  }

  const body = (
    <AnalysisSection label="Analysis">
      {visible.length > 0 ? (
        <ul className="space-y-1.5">
          {visible.map((finding) => (
            <FindingItem
              key={finding.id}
              slug={slug}
              id={finding.id}
              text={finding.text}
              generatedText={finding.generatedText}
              state={finding.state}
              editable={editable}
              onNotes={setLocalNotes}
            />
          ))}
        </ul>
      ) : null}
      {dismissed.length > 0 ? (
        <ul className="mt-3 space-y-1 print:hidden">
          {dismissed.map((finding) => (
            <li key={finding.id} className="text-caption text-muted">
              Dismissed
              <span className="mx-1.5">·</span>
              <RestoreButton
                slug={slug}
                id={finding.id}
                onNotes={setLocalNotes}
              />
            </li>
          ))}
        </ul>
      ) : null}
    </AnalysisSection>
  );

  if (visible.length === 0) {
    return <div className="print:hidden">{body}</div>;
  }

  return body;
}

function RestoreButton({
  slug,
  id,
  onNotes,
}: {
  slug: string;
  id: string;
  onNotes: (notes: AdReportNotes) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <button
        type="button"
        className={chromeClass}
        disabled={saving}
        onClick={async () => {
          setSaving(true);
          setError(null);
          const result = await saveAdReportNotes(slug, {
            kind: "finding",
            id,
            override: null,
          });
          setSaving(false);
          if (!result.success) {
            setError(result.error);
            return;
          }
          onNotes(result.notes);
        }}
      >
        Restore
      </button>
      {saving ? <span className={markerClass}> Saving</span> : null}
      {error ? (
        <span className="ml-1.5 text-caption text-semantic-negative">
          {error}
        </span>
      ) : null}
    </>
  );
}

function FindingItem({
  slug,
  id,
  text,
  generatedText,
  state,
  editable,
  onNotes,
}: {
  slug: string;
  id: string;
  text: string;
  generatedText: string;
  state: "generated" | "edited";
  editable: boolean;
  onNotes: (notes: AdReportNotes) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(text);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!editing) setDraft(text);
  }, [text, editing]);

  useEffect(() => {
    if (editing) textareaRef.current?.focus();
  }, [editing]);

  async function persist(nextText: string) {
    if (nextText === text) {
      setEditing(false);
      return;
    }
    setSaving(true);
    setError(null);
    const result = await saveAdReportNotes(slug, {
      kind: "finding",
      id,
      override: { text: nextText, state: "edited" },
    });
    setSaving(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    onNotes(result.notes);
    setEditing(false);
  }

  async function dismiss() {
    setSaving(true);
    setError(null);
    const result = await saveAdReportNotes(slug, {
      kind: "finding",
      id,
      override: { text, state: "dismissed" },
    });
    setSaving(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    onNotes(result.notes);
    setEditing(false);
  }

  async function revert() {
    setSaving(true);
    setError(null);
    const result = await saveAdReportNotes(slug, {
      kind: "finding",
      id,
      override: null,
    });
    setSaving(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    onNotes(result.notes);
    setEditing(false);
    setDraft(generatedText);
  }

  if (!editable) {
    return <li className="whitespace-pre-wrap">{text}</li>;
  }

  if (editing) {
    return (
      <li>
        <textarea
          ref={textareaRef}
          value={draft}
          rows={Math.max(2, draft.split("\n").length)}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => {
            void persist(draft);
          }}
          className={textareaClass}
          disabled={saving}
        />
        <div className="mt-1 flex flex-wrap items-center gap-x-2 print:hidden">
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
      </li>
    );
  }

  return (
    <li>
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="block w-full cursor-text text-left whitespace-pre-wrap text-body-sm font-normal text-foreground"
      >
        {text.trim() ? text : "Click to edit"}
      </button>
      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 print:hidden">
        {state === "edited" ? <span className={markerClass}>Edited</span> : null}
        {state === "edited" ? (
          <button type="button" className={chromeClass} onClick={() => void revert()}>
            Revert
          </button>
        ) : null}
        <button type="button" className={chromeClass} onClick={() => void dismiss()}>
          Dismiss
        </button>
        {saving ? <span className={markerClass}>Saving</span> : null}
        {error ? (
          <span className="text-caption text-semantic-negative">{error}</span>
        ) : null}
      </div>
    </li>
  );
}
