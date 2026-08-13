"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  confirmAdResultsUpload,
  parseAdResultsUpload,
  previewAdUploadGaps,
} from "@/app/release/[id]/ad-upload/actions";
import {
  CANONICAL_FIELDS,
  META_UPLOAD_FIELDS,
  SPOTIFY_UPLOAD_FIELDS,
  type AdUploadColumnMappings,
  type AdUploadFileConstants,
  type AdUploadFormat,
  type AdUploadObjective,
  type AdUploadPlatform,
  type CanonicalField,
  type CanonicalRow,
  type ParsedTable,
} from "@/lib/ad-upload/canonical";
import {
  applyGapFill,
  type GapFillAction,
  type GapNeed,
} from "@/lib/ad-upload/gap-fill";
import { formatCount } from "@/lib/format";

type Step = "upload" | "mapping" | "gaps" | "done";

const FIELD_LABELS: Record<CanonicalField, string> = {
  spend: "Spend (required)",
  impressions: "Impressions",
  reach: "Reach",
  clicks: "Clicks",
  linkfire_visits: "Linkfire visits",
  linkfire_spotify_clicks: "Linkfire Spotify clicks",
  converted_listeners: "Converted listeners",
  attributed_streams: "Attributed streams",
  format: "Format",
  objective: "Objective",
  campaign_name: "Campaign name",
  start_date: "Start date",
  end_date: "End date",
  artist: "Artist",
  release_key: "Release key",
};

function mappingFieldOptions(platform: AdUploadPlatform): CanonicalField[] {
  if (platform === "meta") {
    return [...META_UPLOAD_FIELDS, "campaign_name", "objective", "start_date", "end_date"];
  }
  if (platform === "spotify") {
    return [
      ...SPOTIFY_UPLOAD_FIELDS,
      "converted_listeners",
      "format",
      "campaign_name",
      "artist",
      "release_key",
      "start_date",
      "end_date",
    ];
  }
  return [...CANONICAL_FIELDS];
}

export function AdResultsUploadWizard({
  releaseId,
  artistName,
  trackName,
}: {
  releaseId: string;
  artistName: string;
  trackName: string;
}) {
  const [step, setStep] = useState<Step>("upload");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [partnerLabel, setPartnerLabel] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const [table, setTable] = useState<ParsedTable | null>(null);
  const [columnMappings, setColumnMappings] = useState<AdUploadColumnMappings>(
    {},
  );
  const [fileConstants, setFileConstants] = useState<AdUploadFileConstants>({
    partnerLabel: "",
    platform: "unknown",
    format: null,
    objective: null,
    artist: artistName,
    releaseKey: null,
  });
  const [mappingNotes, setMappingNotes] = useState<string[]>([]);

  const [rows, setRows] = useState<CanonicalRow[]>([]);
  const [gaps, setGaps] = useState<GapNeed[]>([]);
  const [gapDecisions, setGapDecisions] = useState<
    Record<number, GapFillAction[]>
  >({});
  const [saveProfile, setSaveProfile] = useState(true);
  const [doneSummary, setDoneSummary] = useState<string | null>(null);
  const [reportPath, setReportPath] = useState<string | null>(null);
  const [reportUrl, setReportUrl] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);

  const previewRows = useMemo(() => {
    if (!table) return [];
    return table.rows.slice(0, 5).map((cells, ri) => {
      const out: Partial<Record<CanonicalField, string>> = {};
      for (const [header, field] of Object.entries(columnMappings)) {
        if (!field) continue;
        const idx = table.headers.indexOf(header);
        if (idx < 0) continue;
        out[field] = cells[idx] ?? "";
      }
      if (fileConstants.format && !out.format) {
        out.format = fileConstants.format;
      }
      if (fileConstants.objective && !out.objective) {
        out.objective = fileConstants.objective;
      }
      if (fileConstants.artist && !out.artist) {
        out.artist = fileConstants.artist;
      }
      if (fileConstants.releaseKey && !out.release_key) {
        out.release_key = fileConstants.releaseKey;
      }
      return { ri, out };
    });
  }, [table, columnMappings, fileConstants]);

  async function onParse() {
    if (!file) {
      setError("Choose a file.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("file", file);
      fd.set("partnerLabel", partnerLabel);
      const result = await parseAdResultsUpload(releaseId, fd);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setTable(result.table);
      setColumnMappings(result.proposal.columnMappings);
      setFileConstants({
        ...result.proposal.fileConstants,
        partnerLabel:
          result.proposal.fileConstants.partnerLabel || partnerLabel,
        artist: result.proposal.fileConstants.artist || artistName,
        releaseKey:
          result.proposal.fileConstants.releaseKey ||
          result.release.releaseKey,
      });
      setMappingNotes(result.proposal.notes);
      setStep("mapping");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Parse failed unexpectedly. Check the file encoding and try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function onConfirmMapping() {
    if (!table) return;
    setBusy(true);
    setError(null);
    const result = await previewAdUploadGaps({
      releaseId,
      table,
      columnMappings,
      fileConstants,
    });
    setBusy(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    setRows(result.rows);
    setGaps(result.gaps);
    setGapDecisions({});
    if (result.gaps.length === 0) {
      // Mapping confirm is the write gate when nothing to gap-fill.
      await onConfirmWrite(result.rows, {});
    } else {
      setStep("gaps");
    }
  }

  async function onConfirmWrite(
    rowsOverride?: CanonicalRow[],
    decisionsOverride?: Record<number, GapFillAction[]>,
  ) {
    if (!table) return;
    setBusy(true);
    setError(null);
    const decisions = decisionsOverride ?? gapDecisions;
    const baseRows = rowsOverride ?? rows;
    // Merge accepted benchmark/manual values into canonical rows before write
    // so the server upserts the same payload the gap-fill UI confirmed.
    const resolvedRows = applyGapFill(
      baseRows,
      fileConstants.platform,
      decisions,
    );
    const result = await confirmAdResultsUpload({
      releaseId,
      table,
      columnMappings,
      fileConstants,
      gapDecisions: decisions,
      resolvedRows,
      saveProfile,
    });
    setBusy(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    const parts = [
      result.spotifyUpserted > 0
        ? `${result.spotifyUpserted} Spotify`
        : null,
      result.metaUpserted > 0 ? `${result.metaUpserted} Meta` : null,
    ].filter(Boolean);
    setDoneSummary(
      `Wrote ${parts.join(" + ") || "0 rows"}${
        result.skipped ? ` · ${result.skipped} skipped (report-only)` : ""
      }${result.profileSaved ? " · partner profile saved" : ""}.`,
    );
    setReportPath(result.reportPath);
    setReportUrl(result.reportUrl);
    setLinkCopied(false);
    if (result.warnings.length > 0) {
      setError(result.warnings.join(" "));
    }
    setStep("done");
  }

  function setGapAction(rowIndex: number, actions: GapFillAction[]) {
    setGapDecisions((prev) => ({ ...prev, [rowIndex]: actions }));
  }

  const gapsReady = gaps.every((g) => {
    const acts = gapDecisions[g.rowIndex];
    if (!acts || acts.length === 0) return false;
    if (acts.some((a) => a.type === "skip")) return true;
    return g.missing.every((field) =>
      acts.some(
        (a) =>
          (a.type === "manual" || a.type === "benchmark") && a.field === field,
      ),
    );
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="bracket-tag bracket-tag--accent">
          {step === "upload"
            ? "1 · UPLOAD"
            : step === "mapping"
              ? "2 · MAP"
              : step === "gaps"
                ? "3 · GAP-FILL"
                : "DONE"}
        </span>
        <p className="text-body-sm text-secondary">
          {trackName} · {artistName}
        </p>
      </div>

      {error ? (
        <p className="rounded-instrument border border-border bg-surface px-3 py-2 text-body-sm text-semantic-warning">
          {error}
        </p>
      ) : null}

      {step === "upload" ? (
        <section className="space-y-4 rounded-instrument border border-border bg-surface p-4">
          <p className="text-body-sm text-secondary">
            Accept any partner/label export — CSV, XLSX, PDF, or screenshot.
            Only spend is required. Meta: impressions, clicks, Linkfire visits /
            Spotify clicks optional. Spotify: attributed streams optional.
            Rows without model-complete fields still save with{" "}
            <span className="font-mono text-xs">usable_for_modeling=false</span>.
          </p>
          <label className="block">
            <span className="text-label text-muted">Partner / label</span>
            <input
              type="text"
              value={partnerLabel}
              onChange={(e) => setPartnerLabel(e.target.value)}
              placeholder="e.g. Create Music Group, DistroKid, in-house"
              className="mt-1 w-full rounded border border-border bg-canvas px-3 py-2 text-body-sm text-foreground"
            />
          </label>
          <label className="block">
            <span className="text-label text-muted">File</span>
            <input
              type="file"
              accept=".csv,.xlsx,.xls,.pdf,image/*,.png,.jpg,.jpeg,.webp"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="mt-1 block w-full text-body-sm text-secondary file:mr-3 file:rounded file:border-0 file:bg-bracket-bg file:px-3 file:py-1.5 file:text-body-sm file:font-medium file:text-foreground"
            />
          </label>
          <button
            type="button"
            disabled={busy || !file || !partnerLabel.trim()}
            onClick={() => void onParse()}
            className="rounded bg-foreground px-4 py-2 text-sm font-medium text-canvas disabled:opacity-40"
          >
            {busy ? "Parsing…" : "Parse & propose mapping"}
          </button>
        </section>
      ) : null}

      {step === "mapping" && table ? (
        <section className="space-y-5">
          {mappingNotes.length > 0 ? (
            <ul className="text-caption text-muted">
              {mappingNotes.map((n) => (
                <li key={n}>· {n}</li>
              ))}
            </ul>
          ) : null}

          <div className="rounded-instrument border border-border bg-surface p-4">
            <h3 className="font-serif text-sm font-semibold text-foreground">
              File-level constants
            </h3>
            <p className="mt-1 text-caption text-muted">
              Apply when the file doesn&apos;t state platform / format /
              objective on each row.
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <ConstantSelect
                label="Platform"
                value={fileConstants.platform}
                options={[
                  ["unknown", "Unknown"],
                  ["spotify", "Spotify"],
                  ["meta", "Meta"],
                ]}
                onChange={(v) =>
                  setFileConstants((c) => ({
                    ...c,
                    platform: v as AdUploadPlatform,
                  }))
                }
              />
              <ConstantSelect
                label="Format (whole file)"
                value={fileConstants.format ?? ""}
                options={[
                  ["", "— from columns —"],
                  ["marquee", "Marquee"],
                  ["showcase", "Showcase"],
                ]}
                onChange={(v) =>
                  setFileConstants((c) => ({
                    ...c,
                    format: (v || null) as AdUploadFormat | null,
                  }))
                }
              />
              <ConstantSelect
                label="Objective (whole file)"
                value={fileConstants.objective ?? ""}
                options={[
                  ["", "— from columns —"],
                  ["traffic", "Traffic"],
                  ["awareness", "Awareness"],
                  ["streaming", "Streaming"],
                ]}
                onChange={(v) =>
                  setFileConstants((c) => ({
                    ...c,
                    objective: (v || null) as AdUploadObjective | null,
                  }))
                }
              />
              <label className="block text-body-sm">
                <span className="text-label text-muted">Artist</span>
                <input
                  className="mt-1 w-full rounded border border-border bg-canvas px-2 py-1.5 font-mono text-xs"
                  value={fileConstants.artist ?? ""}
                  onChange={(e) =>
                    setFileConstants((c) => ({
                      ...c,
                      artist: e.target.value || null,
                    }))
                  }
                />
              </label>
              <label className="block text-body-sm sm:col-span-2">
                <span className="text-label text-muted">Release key</span>
                <input
                  className="mt-1 w-full rounded border border-border bg-canvas px-2 py-1.5 font-mono text-xs"
                  value={fileConstants.releaseKey ?? ""}
                  onChange={(e) =>
                    setFileConstants((c) => ({
                      ...c,
                      releaseKey: e.target.value || null,
                    }))
                  }
                />
              </label>
            </div>
          </div>

          <div className="rounded-instrument border border-border bg-surface p-4">
            <h3 className="font-serif text-sm font-semibold text-foreground">
              Column mapping
            </h3>
            <table className="mt-3 w-full text-left text-xs">
              <thead>
                <tr className="text-secondary">
                  <th className="pb-1 font-normal">Source column</th>
                  <th className="pb-1 font-normal">Canonical field</th>
                </tr>
              </thead>
              <tbody>
                {table.headers.map((header) => (
                  <tr key={header} className="border-t border-border/60">
                    <td className="py-1.5 font-mono text-foreground">
                      {header}
                    </td>
                    <td className="py-1.5">
                      <select
                        className="w-full rounded border border-border bg-canvas px-2 py-1"
                        value={columnMappings[header] ?? ""}
                        onChange={(e) => {
                          const v = e.target.value;
                          setColumnMappings((m) => ({
                            ...m,
                            [header]: (v || null) as CanonicalField | null,
                          }));
                        }}
                      >
                        <option value="">— ignore —</option>
                        {mappingFieldOptions(fileConstants.platform).map(
                          (f) => (
                            <option key={f} value={f}>
                              {FIELD_LABELS[f]}
                            </option>
                          ),
                        )}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="rounded-instrument border border-border bg-surface p-4">
            <h3 className="font-serif text-sm font-semibold text-foreground">
              Preview (first {previewRows.length} rows)
            </h3>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="text-secondary">
                    {CANONICAL_FIELDS.map((f) => (
                      <th key={f} className="pb-1 pr-2 font-normal">
                        {FIELD_LABELS[f]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map(({ ri, out }) => (
                    <tr key={ri} className="border-t border-border/60">
                      {CANONICAL_FIELDS.map((f) => (
                        <td
                          key={f}
                          className="py-1 pr-2 font-mono text-foreground"
                        >
                          {out[f] || "—"}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-caption text-muted">
              {table.rows.length} data rows · source {table.sourceKind}
            </p>
          </div>

          <label className="flex items-center gap-2 text-body-sm text-secondary">
            <input
              type="checkbox"
              checked={saveProfile}
              onChange={(e) => setSaveProfile(e.target.checked)}
            />
            Save mapping as partner profile for next time
          </label>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              disabled={busy}
              onClick={() => setStep("upload")}
              className="text-sm font-medium text-accent-readable hover:underline"
            >
              ← Back
            </button>
            <button
              type="button"
              disabled={busy || fileConstants.platform === "unknown"}
              onClick={() => void onConfirmMapping()}
              className="rounded bg-foreground px-4 py-2 text-sm font-medium text-canvas disabled:opacity-40"
            >
              {busy ? "Working…" : "Confirm mapping"}
            </button>
          </div>
          {fileConstants.platform === "unknown" ? (
            <p className="text-caption text-semantic-warning">
              Set platform to Spotify or Meta before confirming.
            </p>
          ) : null}
        </section>
      ) : null}

      {step === "gaps" ? (
        <section className="space-y-4">
          <p className="text-body-sm text-secondary">
            Some rows are missing model-required fields. Supply a value, accept
            a benchmark (tagged derived), or skip (report-only).
          </p>
          {gaps.map((gap) => {
            const row = rows.find((r) => r.source_row_index === gap.rowIndex);
            const acts = gapDecisions[gap.rowIndex] ?? [];
            const skipped = acts.some((a) => a.type === "skip");
            return (
              <div
                key={gap.rowIndex}
                className="rounded-instrument border border-border bg-surface p-4"
              >
                <p className="font-mono text-xs text-secondary">
                  Row {gap.displayRow}
                  {row?.campaign_name ? ` · ${row.campaign_name}` : ""}
                  {row?.spend != null
                    ? ` · spend ${formatCount(Math.round(row.spend))}`
                    : ""}
                </p>
                <div className="mt-3 space-y-3">
                  {gap.missing.map((field) => {
                    const bench = gap.benchmarks[field];
                    const chosen = acts.find(
                      (a) =>
                        a.type !== "skip" &&
                        "field" in a &&
                        a.field === field,
                    );
                    return (
                      <div key={field} className="text-body-sm">
                        <p className="font-medium text-foreground">
                          {FIELD_LABELS[field]}
                        </p>
                        <div className="mt-1 flex flex-wrap gap-2">
                          {bench ? (
                            <button
                              type="button"
                              disabled={skipped}
                              onClick={() => {
                                const rest = acts.filter(
                                  (a) =>
                                    a.type === "skip" ||
                                    ("field" in a && a.field !== field),
                                );
                                setGapAction(gap.rowIndex, [
                                  ...rest.filter((a) => a.type !== "skip"),
                                  {
                                    type: "benchmark",
                                    field,
                                    value: bench.value,
                                  },
                                ]);
                              }}
                              className={`rounded border px-2 py-1 text-xs ${
                                chosen?.type === "benchmark"
                                  ? "border-foreground bg-bracket-bg"
                                  : "border-border"
                              }`}
                            >
                              Benchmark: {formatCount(bench.value)}
                              <span className="ml-1 text-muted">
                                ({bench.label})
                              </span>
                            </button>
                          ) : null}
                          <label className="flex items-center gap-1 text-xs">
                            Manual
                            <input
                              type="number"
                              disabled={skipped}
                              className="w-28 rounded border border-border bg-canvas px-1 py-0.5 font-mono"
                              value={
                                chosen?.type === "manual" ? chosen.value : ""
                              }
                              onChange={(e) => {
                                const value = Number(e.target.value);
                                if (!Number.isFinite(value)) return;
                                const rest = acts.filter(
                                  (a) =>
                                    a.type === "skip" ||
                                    ("field" in a && a.field !== field),
                                );
                                setGapAction(gap.rowIndex, [
                                  ...rest.filter((a) => a.type !== "skip"),
                                  { type: "manual", field, value },
                                ]);
                              }}
                            />
                          </label>
                        </div>
                      </div>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() =>
                      setGapAction(gap.rowIndex, [{ type: "skip" }])
                    }
                    className={`text-xs ${
                      skipped
                        ? "font-medium text-foreground"
                        : "text-accent-readable hover:underline"
                    }`}
                  >
                    {skipped ? "Skipped (report-only)" : "Skip this row"}
                  </button>
                </div>
              </div>
            );
          })}

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              disabled={busy}
              onClick={() => setStep("mapping")}
              className="text-sm font-medium text-accent-readable hover:underline"
            >
              ← Back to mapping
            </button>
            <button
              type="button"
              disabled={busy || !gapsReady}
              onClick={() => void onConfirmWrite()}
              className="rounded bg-foreground px-4 py-2 text-sm font-medium text-canvas disabled:opacity-40"
            >
              {busy ? "Writing…" : "Confirm & write to ad tables"}
            </button>
          </div>
        </section>
      ) : null}

      {step === "done" ? (
        <section className="space-y-4 rounded-instrument border border-border bg-surface p-4">
          <p className="text-body-sm text-foreground">{doneSummary}</p>
          {reportPath && reportUrl ? (
            <div className="rounded border border-accent-border bg-accent-tint px-3 py-3">
              <p className="text-label text-accent-readable">Shareable report</p>
              <p className="mt-1 font-mono text-xs text-secondary break-all">
                {reportUrl}
              </p>
              <div className="mt-2 flex flex-wrap gap-3 text-sm font-medium">
                <Link
                  href={reportPath}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent-readable hover:underline"
                >
                  View report
                </Link>
                <button
                  type="button"
                  className="text-accent-readable hover:underline"
                  onClick={() => {
                    void navigator.clipboard.writeText(reportUrl).then(() => {
                      setLinkCopied(true);
                      window.setTimeout(() => setLinkCopied(false), 2000);
                    });
                  }}
                >
                  {linkCopied ? "Copied" : "Copy link"}
                </button>
              </div>
            </div>
          ) : null}
          <div className="flex flex-wrap gap-3 text-sm font-medium">
            <Link
              href={`/release/${releaseId}`}
              className="text-accent-readable hover:underline"
            >
              ← Back to release
            </Link>
            <button
              type="button"
              onClick={() => {
                setStep("upload");
                setTable(null);
                setDoneSummary(null);
                setReportPath(null);
                setReportUrl(null);
                setError(null);
                setFile(null);
              }}
              className="text-accent-readable hover:underline"
            >
              Upload another file
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function ConstantSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<[string, string]>;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block text-body-sm">
      <span className="text-label text-muted">{label}</span>
      <select
        className="mt-1 w-full rounded border border-border bg-canvas px-2 py-1.5"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map(([v, lab]) => (
          <option key={v || "empty"} value={v}>
            {lab}
          </option>
        ))}
      </select>
    </label>
  );
}
