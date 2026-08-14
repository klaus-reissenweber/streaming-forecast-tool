"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  confirmAdResultsUpload,
  confirmManualAdResults,
  parseAdResultsUpload,
  previewAdUploadGaps,
  uploadAdCreative,
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
import { StatusPill } from "@/components/ui/StatusPill";
import {
  applyGapFill,
  type GapFillAction,
  type GapNeed,
} from "@/lib/ad-upload/gap-fill";
import {
  emptyManualDraft,
  manualDraftsHaveSpend,
  type ManualCampaignDraft,
} from "@/lib/ad-upload/manual-rows";
import type { UpsertedCampaignRef } from "@/lib/ad-upload/campaign-ref";
import { formatCount } from "@/lib/format";
import { withInternalReportPreview } from "@/lib/ad-report/load";

type EntryMode = "manual" | "upload";
type Step = "entry" | "mapping" | "gaps" | "done";

const FIELD_LABELS: Record<CanonicalField, string> = {
  spend: "Spend (required)",
  impressions: "Impressions",
  reach: "Reach",
  clicks: "Clicks",
  linkfire_visits: "Link visits",
  linkfire_spotify_clicks: "Spotify clicks",
  converted_listeners: "Converted listeners",
  attributed_streams: "Streams",
  streams_per_listener: "Streams per listener",
  saves: "Saves",
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
    return [
      ...META_UPLOAD_FIELDS,
      "campaign_name",
      "objective",
      "start_date",
      "end_date",
    ];
  }
  if (platform === "spotify") {
    return [
      ...SPOTIFY_UPLOAD_FIELDS,
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
  const [entryMode, setEntryMode] = useState<EntryMode>("manual");
  const [step, setStep] = useState<Step>("entry");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Manual entry state
  const [manualPlatform, setManualPlatform] = useState<"meta" | "spotify">(
    "meta",
  );
  const [manualObjective, setManualObjective] =
    useState<AdUploadObjective>("traffic");
  const [manualDrafts, setManualDrafts] = useState<ManualCampaignDraft[]>([
    emptyManualDraft(),
  ]);

  // Upload state
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
  const [savedCampaigns, setSavedCampaigns] = useState<UpsertedCampaignRef[]>(
    [],
  );
  const [savedReleaseKey, setSavedReleaseKey] = useState<string | null>(null);
  const [creativeCaptions, setCreativeCaptions] = useState<
    Record<string, string>
  >({});
  const [creativeStatus, setCreativeStatus] = useState<string | null>(null);

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

  function switchMode(mode: EntryMode) {
    setEntryMode(mode);
    setStep("entry");
    setError(null);
    setDoneSummary(null);
    setReportPath(null);
    setReportUrl(null);
    setSavedCampaigns([]);
    setSavedReleaseKey(null);
    setCreativeStatus(null);
  }

  function updateDraft(
    index: number,
    patch: Partial<ManualCampaignDraft>,
  ) {
    setManualDrafts((prev) =>
      prev.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    );
  }

  async function onSaveManual() {
    if (!manualDraftsHaveSpend(manualDrafts)) {
      setError("Enter spend on at least one campaign row.");
      return;
    }
    if (
      manualPlatform === "spotify" &&
      manualDrafts.some((d) => {
        const spend = Number(String(d.spend).replace(/[$,\s]/g, ""));
        return Number.isFinite(spend) && spend > 0 && !d.format;
      })
    ) {
      setError("Spotify rows with spend need a format (Marquee or Showcase).");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const result = await confirmManualAdResults({
        releaseId,
        platform: manualPlatform,
        partnerLabel: "Manual entry",
        objective: manualPlatform === "meta" ? manualObjective : null,
        drafts: manualDrafts,
      });
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
          result.skipped ? ` · ${result.skipped} skipped` : ""
        }.`,
      );
      setReportPath(result.reportPath);
      setReportUrl(result.reportUrl);
      setSavedCampaigns(result.campaigns);
      setSavedReleaseKey(result.releaseKey);
      setLinkCopied(false);
      if (result.warnings.length > 0) {
        setError(result.warnings.join(" "));
      }
      setStep("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

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
    setSavedCampaigns(result.campaigns);
    setSavedReleaseKey(result.releaseKey);
    setLinkCopied(false);
    if (result.warnings.length > 0) {
      setError(result.warnings.join(" "));
    }
    setStep("done");
  }

  async function onUploadCreative(
    campaign: UpsertedCampaignRef,
    file: File | null,
  ) {
    if (!file || !savedReleaseKey) return;
    setBusy(true);
    setCreativeStatus(null);
    setError(null);
    try {
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binary = "";
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]!);
      }
      const base64 = btoa(binary);
      const result = await uploadAdCreative({
        releaseId,
        releaseKey: savedReleaseKey,
        campaignUid: campaign.campaignUid,
        platform: campaign.platform,
        caption: creativeCaptions[campaign.campaignUid] ?? "",
        fileName: file.name,
        contentType: file.type || "image/jpeg",
        base64,
      });
      if (!result.success) {
        setError(result.error);
        return;
      }
      setCreativeStatus(`Uploaded creative for ${campaign.campaignName}.`);
      if (result.reportPath) setReportPath(result.reportPath);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
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

  const stepLabel =
    step === "entry"
      ? entryMode === "manual"
        ? "1 · MANUAL"
        : "1 · UPLOAD"
      : step === "mapping"
        ? "2 · MAP"
        : step === "gaps"
          ? "3 · GAP-FILL"
          : "DONE";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline gap-2">
        <StatusPill tone="accent">{stepLabel}</StatusPill>
        <p className="text-body-sm text-secondary">
          {trackName} · {artistName}
        </p>
      </div>

      {step === "entry" ? (
        <div
          className="flex flex-wrap gap-2"
          role="tablist"
          aria-label="Entry mode"
        >
          <ModeTab
            active={entryMode === "manual"}
            onClick={() => switchMode("manual")}
            label="Enter manually"
          />
          <ModeTab
            active={entryMode === "upload"}
            onClick={() => switchMode("upload")}
            label="Upload file"
          />
        </div>
      ) : null}

      {error ? (
        <p className="rounded-instrument border border-border bg-surface px-3 py-2 text-body-sm text-semantic-warning">
          {error}
        </p>
      ) : null}

      {step === "entry" && entryMode === "manual" ? (
        <section className="space-y-4 rounded-instrument border border-border bg-surface p-4">
          <p className="text-body-sm text-secondary">
            Type campaign numbers from the dashboard. Only spend is required.
            Incomplete model fields still save as report-only.
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            <ConstantSelect
              label="Platform"
              value={manualPlatform}
              options={[
                ["meta", "Meta"],
                ["spotify", "Spotify"],
              ]}
              onChange={(v) => setManualPlatform(v as "meta" | "spotify")}
            />
            {manualPlatform === "meta" ? (
              <ConstantSelect
                label="Objective"
                value={manualObjective}
                options={[
                  ["traffic", "Traffic"],
                  ["awareness", "Awareness"],
                  ["streaming", "Streaming"],
                ]}
                onChange={(v) =>
                  setManualObjective(v as AdUploadObjective)
                }
              />
            ) : null}
          </div>

          <div className="space-y-4">
            {manualDrafts.map((draft, index) => (
              <div
                key={index}
                className="rounded border border-border-subtle bg-canvas p-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-label text-muted">
                    Campaign {index + 1}
                  </p>
                  {manualDrafts.length > 1 ? (
                    <button
                      type="button"
                      className="text-xs text-accent-readable hover:underline"
                      onClick={() =>
                        setManualDrafts((prev) =>
                          prev.filter((_, i) => i !== index),
                        )
                      }
                    >
                      Remove
                    </button>
                  ) : null}
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <FieldInput
                    label="Campaign name"
                    value={draft.campaign_name}
                    onChange={(v) =>
                      updateDraft(index, { campaign_name: v })
                    }
                  />
                  <FieldInput
                    label="Spend (required)"
                    value={draft.spend}
                    onChange={(v) => updateDraft(index, { spend: v })}
                    inputMode="decimal"
                  />
                  <FieldInput
                    label="Start date"
                    value={draft.start_date}
                    onChange={(v) => updateDraft(index, { start_date: v })}
                    type="date"
                  />
                  <FieldInput
                    label="End date"
                    value={draft.end_date}
                    onChange={(v) => updateDraft(index, { end_date: v })}
                    type="date"
                  />
                  {manualPlatform === "meta" ? (
                    <>
                      <FieldInput
                        label="Impressions"
                        value={draft.impressions}
                        onChange={(v) =>
                          updateDraft(index, { impressions: v })
                        }
                        inputMode="numeric"
                      />
                      <FieldInput
                        label="Clicks"
                        value={draft.clicks}
                        onChange={(v) => updateDraft(index, { clicks: v })}
                        inputMode="numeric"
                      />
                      <FieldInput
                        label="Link visits"
                        value={draft.linkfire_visits}
                        onChange={(v) =>
                          updateDraft(index, { linkfire_visits: v })
                        }
                        inputMode="numeric"
                      />
                      <FieldInput
                        label="Spotify clicks"
                        value={draft.linkfire_spotify_clicks}
                        onChange={(v) =>
                          updateDraft(index, {
                            linkfire_spotify_clicks: v,
                          })
                        }
                        inputMode="numeric"
                      />
                    </>
                  ) : (
                    <>
                      <ConstantSelect
                        label="Format"
                        value={draft.format}
                        options={[
                          ["", "— select —"],
                          ["marquee", "Marquee"],
                          ["showcase", "Showcase"],
                        ]}
                        onChange={(v) =>
                          updateDraft(index, {
                            format: v as "" | AdUploadFormat,
                          })
                        }
                      />
                      <FieldInput
                        label="Reach"
                        value={draft.reach}
                        onChange={(v) => updateDraft(index, { reach: v })}
                        inputMode="numeric"
                      />
                      <FieldInput
                        label="Clicks"
                        value={draft.clicks}
                        onChange={(v) => updateDraft(index, { clicks: v })}
                        inputMode="numeric"
                      />
                      <FieldInput
                        label="Converted listeners"
                        value={draft.converted_listeners}
                        onChange={(v) =>
                          updateDraft(index, { converted_listeners: v })
                        }
                        inputMode="numeric"
                      />
                      <FieldInput
                        label="Streams"
                        value={draft.est_attributed_streams}
                        onChange={(v) =>
                          updateDraft(index, {
                            est_attributed_streams: v,
                          })
                        }
                        inputMode="numeric"
                      />
                      <FieldInput
                        label="Saves"
                        value={draft.saves}
                        onChange={(v) => updateDraft(index, { saves: v })}
                        inputMode="numeric"
                      />
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() =>
                setManualDrafts((prev) => [...prev, emptyManualDraft()])
              }
              className="rounded-tag border border-border bg-canvas px-3 py-1.5 text-sm font-medium text-foreground hover:border-accent"
            >
              Add campaign
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void onSaveManual()}
              className="rounded bg-foreground px-4 py-2 text-sm font-medium text-canvas disabled:opacity-40"
            >
              {busy ? "Saving…" : "Save to ad tables"}
            </button>
          </div>
        </section>
      ) : null}

      {step === "entry" && entryMode === "upload" ? (
        <section className="space-y-4 rounded-instrument border border-border bg-surface p-4">
          <p className="text-body-sm text-secondary">
            Accept any partner/label export — CSV, XLSX, PDF, or screenshot.
            Only spend is required. Meta: impressions, clicks, link visits /
            Spotify clicks optional. Spotify: reach, clicks, converted
            listeners, streams, saves optional. Rows without model-complete
            fields still save as report-only.
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
              onClick={() => setStep("entry")}
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
                  href={withInternalReportPreview(reportPath)}
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

          {savedCampaigns.length > 0 ? (
            <div className="space-y-3 rounded border border-border-subtle bg-canvas p-3">
              <div>
                <p className="text-label text-muted">Creatives (optional)</p>
                <p className="mt-1 text-caption text-secondary">
                  Upload one or more images per campaign. They appear on the
                  report next to spend, impressions, clicks, and CTR.
                </p>
              </div>
              {creativeStatus ? (
                <p className="text-caption text-accent-readable">
                  {creativeStatus}
                </p>
              ) : null}
              {savedCampaigns.map((camp) => (
                <div
                  key={camp.campaignUid}
                  className="rounded border border-border bg-surface p-3"
                >
                  <p className="text-body-sm font-medium text-foreground">
                    {camp.campaignName}
                    <span className="ml-2 text-caption font-normal text-muted">
                      {camp.platform}
                      {camp.format ? ` · ${camp.format}` : ""}
                      {camp.objective ? ` · ${camp.objective}` : ""}
                    </span>
                  </p>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    <label className="block text-caption text-muted">
                      Caption
                      <input
                        type="text"
                        value={creativeCaptions[camp.campaignUid] ?? ""}
                        onChange={(e) =>
                          setCreativeCaptions((prev) => ({
                            ...prev,
                            [camp.campaignUid]: e.target.value,
                          }))
                        }
                        placeholder="Optional label"
                        className="mt-1 w-full rounded border border-border bg-canvas px-2 py-1.5 text-body-sm text-foreground"
                      />
                    </label>
                    <label className="block text-caption text-muted">
                      Image
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/gif"
                        disabled={busy}
                        onChange={(e) => {
                          const f = e.target.files?.[0] ?? null;
                          void onUploadCreative(camp, f);
                          e.target.value = "";
                        }}
                        className="mt-1 block w-full text-body-sm text-secondary file:mr-3 file:rounded file:border-0 file:bg-bracket-bg file:px-3 file:py-1.5 file:text-body-sm file:font-medium file:text-foreground"
                      />
                    </label>
                  </div>
                </div>
              ))}
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
                setStep("entry");
                setTable(null);
                setDoneSummary(null);
                setReportPath(null);
                setReportUrl(null);
                setSavedCampaigns([]);
                setSavedReleaseKey(null);
                setCreativeStatus(null);
                setError(null);
                setFile(null);
                setManualDrafts([emptyManualDraft()]);
              }}
              className="text-accent-readable hover:underline"
            >
              Enter more results
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function ModeTab({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`rounded-tag border px-3 py-1.5 text-sm font-medium ${
        active
          ? "border-foreground bg-foreground text-canvas"
          : "border-border bg-canvas text-foreground hover:border-accent"
      }`}
    >
      {label}
    </button>
  );
}

function FieldInput({
  label,
  value,
  onChange,
  inputMode,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  inputMode?: "decimal" | "numeric" | "text";
  type?: "text" | "date";
}) {
  return (
    <label className="block text-body-sm">
      <span className="text-label text-muted">{label}</span>
      <input
        type={type}
        inputMode={type === "date" ? undefined : inputMode}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded border border-border bg-surface px-2 py-1.5 font-mono text-xs text-foreground"
      />
    </label>
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
