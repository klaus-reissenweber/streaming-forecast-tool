"use client";

import { useMemo, useState } from "react";
import { bulkUpsertDailyData } from "@/app/release/[id]/actions";
import { parseDailyData } from "@/lib/parse-daily-data";

export interface DailyDataImportProps {
  releaseId: string;
  readOnly?: boolean;
  onImportSuccess: () => void;
}

export function DailyDataImport({
  releaseId,
  readOnly = false,
  onImportSuccess,
}: DailyDataImportProps) {
  const [raw, setRaw] = useState("");
  const [hasDayColumn, setHasDayColumn] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);

  const parsed = useMemo(
    () => parseDailyData(raw, hasDayColumn),
    [raw, hasDayColumn],
  );

  const canApply =
    !readOnly &&
    !saving &&
    raw.trim().length > 0 &&
    parsed.issues.length === 0 &&
    parsed.rows.length > 0;

  function onFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setRaw(String(reader.result ?? ""));
      setError(null);
      setErrors([]);
    };
    reader.readAsText(file);
  }

  async function applyImport() {
    if (!canApply) {
      return;
    }

    setSaving(true);
    setError(null);
    setErrors([]);

    const result = await bulkUpsertDailyData(releaseId, parsed.rows);

    setSaving(false);

    if (!result.success) {
      setError(result.error);
      setErrors(result.errors ?? []);
      return;
    }

    setRaw("");
    setOpen(false);
    onImportSuccess();
  }

  if (readOnly) {
    return null;
  }

  return (
    <div className="mt-6 border-t border-border-subtle pt-5">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="text-sm font-medium text-accent-readable hover:text-accent-hover hover:underline"
      >
        {open ? "Hide import from spreadsheet" : "Import from spreadsheet"}
      </button>

      {open ? (
        <div className="mt-4 space-y-4 rounded-instrument border border-border bg-canvas p-4">
          <p className="text-body-sm text-secondary">
            Paste or upload CSV for this release only. Columns: day (optional),
            streams, saves, Other %.
          </p>

          <label className="flex items-center gap-2 text-body-sm text-secondary">
            <input
              type="checkbox"
              checked={hasDayColumn}
              onChange={(event) => setHasDayColumn(event.target.checked)}
            />
            CSV includes day column
          </label>

          <div>
            <label className="text-label text-muted">Upload file</label>
            <input
              type="file"
              accept=".csv,.txt,text/csv,text/plain"
              onChange={onFileChange}
              className="mt-1 block w-full text-body-sm text-secondary file:mr-3 file:rounded file:border-0 file:bg-bracket-bg file:px-3 file:py-1.5 file:text-body-sm file:font-medium file:text-foreground"
            />
          </div>

          <div>
            <label
              htmlFor="daily-import-paste"
              className="text-label text-muted"
            >
              Or paste rows
            </label>
            <textarea
              id="daily-import-paste"
              value={raw}
              onChange={(event) => {
                setRaw(event.target.value);
                setError(null);
                setErrors([]);
              }}
              rows={6}
              placeholder={"1,12000,850,12.5\n2,9800,720,11.0"}
              className="mt-1 w-full rounded-instrument border border-border bg-surface px-3 py-2 font-mono text-xs text-foreground focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>

          {parsed.issues.length > 0 ? (
            <ul className="space-y-1 text-body-sm text-semantic-negative">
              {parsed.issues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          ) : null}

          {raw.trim().length > 0 && parsed.issues.length === 0 ? (
            <p className="text-body-sm text-secondary">
              {parsed.rows.length} day(s) ready to import.
            </p>
          ) : null}

          {error ? (
            <p className="text-body-sm text-semantic-negative">{error}</p>
          ) : null}

          {errors.length > 0 ? (
            <ul className="space-y-1 text-body-sm text-semantic-negative">
              {errors.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : null}

          <button
            type="button"
            disabled={!canApply}
            onClick={applyImport}
            className={
              "rounded-instrument px-4 py-2 text-body-sm font-medium " +
              (canApply
                ? "bg-foreground text-canvas hover:bg-foreground/90"
                : "cursor-not-allowed bg-bracket-bg text-muted")
            }
          >
            {saving ? "Importing..." : "Apply to this release"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
