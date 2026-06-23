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
    <div className="mt-6 border-t border-stone-100 pt-5">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="text-sm font-medium text-orange-700 hover:text-orange-800 hover:underline"
      >
        {open ? "Hide import from spreadsheet" : "Import from spreadsheet"}
      </button>

      {open ? (
        <div className="mt-4 space-y-4 rounded-lg border border-stone-200 bg-stone-50/50 p-4">
          <p className="text-sm text-stone-600">
            Paste or upload CSV for this release only. Columns: day (optional),
            streams, saves, Other %.
          </p>

          <label className="flex items-center gap-2 text-sm text-stone-700">
            <input
              type="checkbox"
              checked={hasDayColumn}
              onChange={(event) => setHasDayColumn(event.target.checked)}
            />
            CSV includes day column
          </label>

          <div>
            <label className="text-xs font-medium uppercase tracking-wide text-stone-500">
              Upload file
            </label>
            <input
              type="file"
              accept=".csv,.txt,text/csv,text/plain"
              onChange={onFileChange}
              className="mt-1 block w-full text-sm text-stone-600 file:mr-3 file:rounded file:border-0 file:bg-stone-200 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-stone-800"
            />
          </div>

          <div>
            <label
              htmlFor="daily-import-paste"
              className="text-xs font-medium uppercase tracking-wide text-stone-500"
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
              className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 font-mono text-xs text-stone-800"
            />
          </div>

          {parsed.issues.length > 0 ? (
            <ul className="space-y-1 text-sm text-red-700">
              {parsed.issues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          ) : null}

          {raw.trim().length > 0 && parsed.issues.length === 0 ? (
            <p className="text-sm text-stone-600">
              {parsed.rows.length} day(s) ready to import.
            </p>
          ) : null}

          {error ? (
            <p className="text-sm text-red-700">{error}</p>
          ) : null}

          {errors.length > 0 ? (
            <ul className="space-y-1 text-sm text-red-700">
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
              "rounded-lg px-4 py-2 text-sm font-medium " +
              (canApply
                ? "bg-orange-700 text-white hover:bg-orange-800"
                : "cursor-not-allowed bg-stone-200 text-stone-500")
            }
          >
            {saving ? "Importing..." : "Apply to this release"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
