// pages/upload.tsx
// Intern-facing import page. Captures one closed release (metadata + daily data)
// and writes it to Supabase. Does NO model math — retraining is run separately
// via retrain/retrain.py.
//
// Depends on:
//   lib/supabase.ts      -> exports `supabase` (the configured client, per SCOPE.md)
//   lib/parseRelease.ts  -> parse + validation (accompanying file)
//
// Schema note: this insert sets only the columns retraining needs plus status/dates.
// locked_forecast_streams, locked_forecast_saves, meta_spend_planned,
// spotify_spend_planned, meta_objective and model_version_used are left null on
// import. If your `releases` table marks any of those NOT NULL, either relax the
// constraint or add a DEFAULT — the retrain script reads none of them.

import React, { useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import {
  GENRES,
  parseDailyData,
  validateRelease,
  type ReleaseMeta,
} from "../lib/parseRelease";

const TIERS = [
  { v: 0, label: "None" },
  { v: 1, label: "Small" },
  { v: 2, label: "Medium" },
  { v: 3, label: "Large" },
];

type SaveState =
  | { phase: "idle" }
  | { phase: "saving" }
  | { phase: "done"; track: string; status: string; days: number }
  | { phase: "error"; message: string };

export default function UploadPage() {
  const [meta, setMeta] = useState<ReleaseMeta>({
    track_name: "",
    artist_name: "",
    genre: "",
    monthly_listeners: "",
    is_feature: false,
    editorial_tier: 0,
    release_date: "",
  });
  const [raw, setRaw] = useState("");
  const [hasDayColumn, setHasDayColumn] = useState(true);
  const [forceClosed, setForceClosed] = useState(false);
  const [save, setSave] = useState<SaveState>({ phase: "idle" });

  const parsed = useMemo(() => parseDailyData(raw, hasDayColumn), [raw, hasDayColumn]);
  const v = useMemo(() => validateRelease(meta, parsed, forceClosed), [meta, parsed, forceClosed]);
  const canSubmit = v.errors.length === 0 && save.phase !== "saving";

  const set =
    (k: keyof ReleaseMeta) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      const t = e.target as HTMLInputElement;
      const val = t.type === "checkbox" ? t.checked : t.value;
      setMeta((m) => ({ ...m, [k]: val }));
    };

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => setRaw(String(r.result || ""));
    r.readAsText(f);
  }

  async function submit() {
    if (!canSubmit) return;
    setSave({ phase: "saving" });

    const releaseRow = {
      track_name: meta.track_name.trim(),
      artist_name: meta.artist_name.trim(),
      genre: meta.genre,
      monthly_listeners: Number(meta.monthly_listeners),
      is_feature: meta.is_feature,
      editorial_tier: Number(meta.editorial_tier),
      release_date: meta.release_date,
      status: v.closed ? "closed" : "active",
      closed_at: v.closed ? new Date().toISOString() : null,
    };

    // 1) Insert the release, get its id back.
    const { data: rel, error: relErr } = await supabase
      .from("releases")
      .insert(releaseRow)
      .select("id")
      .single();

    if (relErr || !rel) {
      setSave({ phase: "error", message: relErr?.message ?? "Could not create the release row." });
      return;
    }

    // 2) Insert daily rows for that release.
    const dailyRows = parsed.rows.map((r) => ({
      release_id: rel.id,
      day_number: r.day_number,
      streams: r.streams,
      saves: r.saves,
      other_pct: r.other_pct,
    }));

    const { error: dayErr } = await supabase.from("daily_data").insert(dailyRows);

    if (dayErr) {
      // The release exists but its days failed — surface clearly so it can be
      // fixed rather than leaving a silent half-write.
      setSave({
        phase: "error",
        message:
          `Release "${releaseRow.track_name}" was created (id ${rel.id}) but its daily rows ` +
          `failed: ${dayErr.message}. Delete that release in Supabase, fix the data, and re-import.`,
      });
      return;
    }

    setSave({
      phase: "done",
      track: releaseRow.track_name,
      status: releaseRow.status,
      days: dailyRows.length,
    });
    setMeta({
      track_name: "",
      artist_name: "",
      genre: "",
      monthly_listeners: "",
      is_feature: false,
      editorial_tier: 0,
      release_date: "",
    });
    setRaw("");
    setForceClosed(false);
  }

  return (
    <main className="mx-auto max-w-3xl px-5 py-8">
      <header className="mb-6 border-b border-stone-200 pb-4">
        <h1 className="text-2xl font-semibold text-stone-900">Closed Release Import</h1>
        <p className="mt-1 text-sm text-stone-500">
          Enter one finished release. This saves to the database — retraining is run separately.
        </p>
      </header>

      {save.phase === "done" && (
        <div className="mb-6 rounded-lg border-2 border-emerald-600 bg-white p-4">
          <p className="font-semibold text-emerald-700">✓ Saved</p>
          <p className="mt-1 text-sm text-stone-700">
            <b>{save.track}</b> — {save.days} day(s), status{" "}
            <b className={save.status === "closed" ? "text-emerald-700" : "text-amber-700"}>
              {save.status.toUpperCase()}
            </b>
            .
          </p>
          <button onClick={() => setSave({ phase: "idle" })} className="mt-3 text-sm text-orange-700 underline">
            Enter another release
          </button>
        </div>
      )}
      {save.phase === "error" && (
        <div className="mb-6 rounded-lg border-2 border-red-600 bg-white p-4">
          <p className="font-semibold text-red-700">Couldn’t save</p>
          <p className="mt-1 text-sm text-stone-700">{save.message}</p>
          <button onClick={() => setSave({ phase: "idle" })} className="mt-3 text-sm text-orange-700 underline">
            Try again
          </button>
        </div>
      )}

      {/* 1. Release details */}
      <section className="mb-5 rounded-lg border border-stone-200 bg-white p-5">
        <h2 className="mb-4 text-lg font-semibold text-stone-900">1 · Release details</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-stone-700">Track name</span>
            <input className="rounded border border-stone-300 px-3 py-2 text-sm" value={meta.track_name} onChange={set("track_name")} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-stone-700">Artist</span>
            <input className="rounded border border-stone-300 px-3 py-2 text-sm" value={meta.artist_name} onChange={set("artist_name")} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-stone-700">Genre</span>
            <select className="rounded border border-stone-300 px-3 py-2 text-sm" value={meta.genre} onChange={set("genre")}>
              <option value="">Select…</option>
              {GENRES.map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-stone-700">Monthly listeners</span>
            <input className="rounded border border-stone-300 px-3 py-2 text-sm" inputMode="numeric" value={meta.monthly_listeners} onChange={set("monthly_listeners")} placeholder="2400000" />
            <span className="text-xs text-stone-400">Plain number, no commas</span>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-stone-700">Editorial tier</span>
            <select className="rounded border border-stone-300 px-3 py-2 text-sm" value={meta.editorial_tier} onChange={set("editorial_tier")}>
              {TIERS.map((t) => (
                <option key={t.v} value={t.v}>{t.v} — {t.label}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-stone-700">Release date</span>
            <input type="date" className="rounded border border-stone-300 px-3 py-2 text-sm" value={meta.release_date} onChange={set("release_date")} />
          </label>
        </div>
        <label className="mt-4 flex items-center gap-2">
          <input type="checkbox" checked={meta.is_feature} onChange={set("is_feature")} />
          <span className="text-sm text-stone-700">This is a feature / collab (not a solo release)</span>
        </label>
      </section>

      {/* 2. Daily data */}
      <section className="mb-5 rounded-lg border border-stone-200 bg-white p-5">
        <h2 className="mb-3 text-lg font-semibold text-stone-900">2 · Daily numbers</h2>
        <p className="mb-3 text-sm text-stone-500">
          Paste from your tracker, or upload a CSV. Columns:{" "}
          <code className="text-stone-800">{hasDayColumn ? "Day, Streams, Saves, Other%" : "Streams, Saves, Other%"}</code>{" "}
          (Other% optional).
        </p>
        <div className="mb-3 flex flex-wrap items-center gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={hasDayColumn} onChange={(e) => setHasDayColumn(e.target.checked)} />
            First column is the day number
          </label>
          <label className="cursor-pointer text-orange-700 underline">
            Upload CSV
            <input type="file" accept=".csv,.tsv,.txt" className="hidden" onChange={onFile} />
          </label>
        </div>
        <textarea
          className="h-40 w-full rounded border border-stone-300 px-3 py-2 font-mono text-xs"
          placeholder={"1,84210,9820,12.1\n2,41880,5110,18.4\n..."}
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
        />
        {parsed.rows.length > 0 && (
          <div className="mt-4 overflow-auto rounded border border-stone-200">
            <table className="w-full text-left font-mono text-xs">
              <thead className="bg-stone-50 text-stone-500">
                <tr>
                  <th className="px-3 py-2">Day</th>
                  <th className="px-3 py-2">Streams</th>
                  <th className="px-3 py-2">Saves</th>
                  <th className="px-3 py-2">Other %</th>
                </tr>
              </thead>
              <tbody>
                {parsed.rows.map((r, i) => (
                  <tr key={i} className="border-t border-stone-100 text-stone-800">
                    <td className="px-3 py-1.5">{r.day_number}</td>
                    <td className="px-3 py-1.5">{Number.isFinite(r.streams) ? r.streams.toLocaleString() : "—"}</td>
                    <td className="px-3 py-1.5">{Number.isFinite(r.saves) ? r.saves.toLocaleString() : "—"}</td>
                    <td className="px-3 py-1.5">{r.other_pct ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* 3. Check & save */}
      <section className="mb-5 rounded-lg border border-stone-200 bg-white p-5">
        <h2 className="mb-4 text-lg font-semibold text-stone-900">3 · Check &amp; save</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Stat label="Days entered" value={v.validDays} />
          <Stat label="Days since release" value={v.daysSince ?? "—"} />
          <Stat label="Week-1 streams (sum d1–7)" value={v.wk1Streams ? v.wk1Streams.toLocaleString() : "—"} />
        </div>

        <label className="mt-4 flex items-center gap-2 text-sm text-stone-700">
          <input type="checkbox" checked={forceClosed} onChange={(e) => setForceClosed(e.target.checked)} />
          Force-mark as <b>closed</b> (overrides the 28-day / 7-day rule)
        </label>

        {v.errors.length > 0 && (
          <Box tone="error" title={`${v.errors.length} thing(s) to fix`} items={v.errors} />
        )}
        {v.warnings.length > 0 && <Box tone="warn" title="Heads up" items={v.warnings} />}

        <button
          onClick={submit}
          disabled={!canSubmit}
          className={
            "mt-5 w-full rounded-lg px-4 py-3 text-sm font-semibold transition " +
            (canSubmit ? "bg-orange-700 text-white hover:bg-orange-800" : "cursor-not-allowed bg-stone-200 text-stone-400")
          }
        >
          {save.phase === "saving"
            ? "Saving…"
            : canSubmit
            ? `Save release (${v.closed ? "CLOSED" : "ACTIVE"})`
            : "Fix the items above to save"}
        </button>
      </section>

      <p className="mt-6 text-center text-xs text-stone-400">
        This page only stores data. Retraining is run separately with <code>python retrain.py</code>.
      </p>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded border border-stone-200 bg-stone-50 p-3">
      <div className="text-xs text-stone-500">{label}</div>
      <div className="mt-1 font-mono text-lg text-stone-900">{value}</div>
    </div>
  );
}

function Box({
  tone,
  title,
  items,
}: {
  tone: "error" | "warn";
  title: string;
  items: string[];
}) {
  const border = tone === "error" ? "border-red-600" : "border-amber-600";
  const text = tone === "error" ? "text-red-700" : "text-amber-700";
  return (
    <div className={`mt-4 rounded border bg-white p-3 ${border}`}>
      <div className={`text-sm font-semibold ${text}`}>{title}</div>
      <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-stone-800">
        {items.map((it, i) => (
          <li key={i}>{it}</li>
        ))}
      </ul>
    </div>
  );
}
