import React, { useState, useMemo } from "react";

/**
 * Closed Release Import: intern-facing data entry page (PREVIEW).
 *
 * This standalone version mocks the database write so it runs here in chat.
 * The real Next.js page (pages/upload.tsx) shares the same parse + validation
 * logic and swaps the mock for a Supabase insert. See the accompanying files.
 *
 * Design intent: a calm "lab instrument": unambiguous, high-contrast, every
 * validation state visible. The whole point is data integrity feeding a model,
 * so nothing here is decorative noise.
 */

const GENRES = ["dubstep", "house", "melodic-bass", "downtempo", "big-room"];
const TIERS = [
  { v: 0, label: "None" },
  { v: 1, label: "Small" },
  { v: 2, label: "Medium" },
  { v: 3, label: "Large" },
];

const EXAMPLE = `Day,Streams,Saves,Other%
1,84210,9820,12.1
2,41880,5110,18.4
3,30120,3640,24.0
4,28940,3410,29.8
5,33110,3980,34.2
6,34050,4020,37.1
7,35220,4130,39.0`;

// ---- shared parse + validate logic (mirrors lib/parseRelease.ts) ----

function parseDailyData(text, hasDayColumn) {
  const rows = [];
  const issues = [];
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  let autoDay = 0;
  lines.forEach((line, idx) => {
    const cells = line.split(/[,\t]|\s{2,}/).map((c) => c.trim());
    // skip a header row (first cell non-numeric)
    if (idx === 0 && cells[0] && isNaN(Number(cells[0]))) return;
    autoDay += 1;

    let day, streams, saves, other;
    if (hasDayColumn) {
      [day, streams, saves, other] = cells;
    } else {
      day = String(autoDay);
      [streams, saves, other] = cells;
    }

    const rowNo = idx + 1;
    const dn = Number(day);
    const st = Number(streams);
    const sv = Number(saves);
    const ot = other === undefined || other === "" ? null : Number(other);

    if (!Number.isInteger(dn) || dn < 1 || dn > 28)
      issues.push(`Line ${rowNo}: day "${day}" must be a whole number 1–28.`);
    if (!Number.isFinite(st) || st < 0 || !Number.isInteger(st))
      issues.push(`Line ${rowNo}: streams "${streams}" must be a whole number ≥ 0.`);
    if (!Number.isFinite(sv) || sv < 0 || !Number.isInteger(sv))
      issues.push(`Line ${rowNo}: saves "${saves}" must be a whole number ≥ 0.`);
    if (ot !== null && (!Number.isFinite(ot) || ot < 0 || ot > 100))
      issues.push(`Line ${rowNo}: Other% "${other}" must be between 0 and 100 (or blank).`);

    rows.push({ day_number: dn, streams: st, saves: sv, other_pct: ot });
  });

  // duplicate days
  const seen = new Map();
  rows.forEach((r) => seen.set(r.day_number, (seen.get(r.day_number) || 0) + 1));
  [...seen.entries()]
    .filter(([, n]) => n > 1)
    .forEach(([d]) => issues.push(`Day ${d} appears more than once.`));

  rows.sort((a, b) => a.day_number - b.day_number);
  return { rows, issues };
}

function validate(meta, parsed, forceClosed) {
  const errors = [];
  const warnings = [];

  if (!meta.track_name.trim()) errors.push("Track name is required.");
  if (!meta.artist_name.trim()) errors.push("Artist name is required.");
  if (!GENRES.includes(meta.genre)) errors.push("Pick a genre.");
  if (!meta.release_date) errors.push("Release date is required.");
  const ml = Number(meta.monthly_listeners);
  if (!Number.isFinite(ml) || ml <= 0)
    errors.push("Monthly listeners must be a number greater than 0.");

  errors.push(...parsed.issues);

  const validDays = parsed.rows.filter((r) => Number.isInteger(r.day_number)).length;
  if (validDays === 0) errors.push("Add at least one day of data.");

  // training eligibility
  let daysSince = null;
  if (meta.release_date) {
    daysSince = Math.floor(
      (Date.now() - new Date(meta.release_date + "T00:00:00").getTime()) / 86400000
    );
  }
  const eligible = validDays >= 7 && daysSince !== null && daysSince >= 28;
  const closed = forceClosed || eligible;

  if (!eligible && !forceClosed) {
    const reasons = [];
    if (validDays < 7) reasons.push(`only ${validDays} day(s) entered (need ≥7)`);
    if (daysSince !== null && daysSince < 28)
      reasons.push(`released ${daysSince} day(s) ago (need ≥28)`);
    warnings.push(
      `Will be saved as ACTIVE, not closed. ${reasons.join(
        " and "
      )}. The retrain script only trains on closed releases.`
    );
  }
  if (forceClosed && !eligible)
    warnings.push("You forced CLOSED before the 28-day window. Double-check before retraining.");

  const wk1 = parsed.rows
    .filter((r) => r.day_number >= 1 && r.day_number <= 7)
    .reduce((s, r) => s + (Number.isFinite(r.streams) ? r.streams : 0), 0);

  return { errors, warnings, closed, validDays, daysSince, wk1 };
}

// ---- UI ----

const ui = {
  page: { background: "var(--bg)", color: "var(--ink)", fontFamily: "var(--body)" },
};

function Field({ label, hint, children }) {
  return (
    <label className="flex flex-col gap-1">
      <span style={{ color: "var(--ink)" }} className="text-sm font-semibold tracking-wide">
        {label}
      </span>
      {children}
      {hint && (
        <span style={{ color: "var(--muted)" }} className="text-xs">
          {hint}
        </span>
      )}
    </label>
  );
}

const inputStyle = {
  background: "var(--panel)",
  border: "1px solid var(--line)",
  color: "var(--ink)",
  fontFamily: "var(--body)",
};

export default function ReleaseImportPreview() {
  const [meta, setMeta] = useState({
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
  const [result, setResult] = useState(null);

  const parsed = useMemo(() => parseDailyData(raw, hasDayColumn), [raw, hasDayColumn]);
  const v = useMemo(() => validate(meta, parsed, forceClosed), [meta, parsed, forceClosed]);
  const canSubmit = v.errors.length === 0;

  const set = (k) => (e) => {
    const val = e.target.type === "checkbox" ? e.target.checked : e.target.value;
    setMeta((m) => ({ ...m, [k]: val }));
  };

  function onFile(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => setRaw(String(r.result || ""));
    r.readAsText(f);
  }

  function downloadTemplate() {
    const blob = new Blob([EXAMPLE], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "daily_data_template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  function submit() {
    if (!canSubmit) return;
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
      // forecast / spend / model_version columns intentionally omitted.
      // Retraining never reads them. Left null on import.
    };
    const dailyRows = parsed.rows.map((r) => ({
      day_number: r.day_number,
      streams: r.streams,
      saves: r.saves,
      other_pct: r.other_pct,
    }));
    setResult({ releaseRow, dailyRows });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <div style={ui.page} className="min-h-screen w-full">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap');
        :root{
          --bg:#f3efe6; --panel:#fffdf8; --ink:#1d1b17; --muted:#746f64;
          --line:#e4ddcd; --accent:#b3471f; --ok:#2f6b4f; --warn:#946012; --err:#a32f28;
          --display:'Fraunces',Georgia,serif; --body:'IBM Plex Sans',sans-serif; --mono:'IBM Plex Mono',monospace;
        }
        ::selection{ background:var(--accent); color:#fff; }
      `}</style>

      <div className="mx-auto max-w-3xl px-5 py-8">
        {/* header */}
        <div className="mb-6 flex items-baseline justify-between border-b pb-4" style={{ borderColor: "var(--line)" }}>
          <div>
            <h1 style={{ fontFamily: "var(--display)", color: "var(--ink)" }} className="text-3xl">
              Closed Release Import
            </h1>
            <p style={{ color: "var(--muted)" }} className="mt-1 text-sm">
              Enter one finished release. Saves to the database. Retraining is run separately.
            </p>
          </div>
          <span
            style={{ fontFamily: "var(--mono)", color: "var(--accent)", borderColor: "var(--accent)" }}
            className="rounded border px-2 py-1 text-xs"
          >
            intern entry
          </span>
        </div>

        {/* success panel */}
        {result && (
          <div
            className="mb-6 rounded-lg p-4"
            style={{ background: "var(--panel)", border: "2px solid var(--ok)" }}
          >
            <div className="flex items-center gap-2">
              <span style={{ color: "var(--ok)", fontFamily: "var(--display)" }} className="text-lg">
                ✓ Ready to write
              </span>
              <span style={{ color: "var(--muted)" }} className="text-xs">
                (preview: the deployed page inserts this into Supabase)
              </span>
            </div>
            <p style={{ color: "var(--ink)" }} className="mt-2 text-sm">
              <b>{result.releaseRow.track_name}</b>, {result.releaseRow.dailyRows ? "" : ""}
              {result.dailyRows.length} day(s), status{" "}
              <b style={{ color: result.releaseRow.status === "closed" ? "var(--ok)" : "var(--warn)" }}>
                {result.releaseRow.status.toUpperCase()}
              </b>
              .
            </p>
            <pre
              style={{ background: "var(--bg)", color: "var(--ink)", fontFamily: "var(--mono)", border: "1px solid var(--line)" }}
              className="mt-3 max-h-64 overflow-auto rounded p-3 text-xs"
            >
{JSON.stringify({ releases: result.releaseRow, daily_data: result.dailyRows }, null, 2)}
            </pre>
            <button
              onClick={() => setResult(null)}
              style={{ color: "var(--accent)" }}
              className="mt-3 text-sm underline"
            >
              Enter another release
            </button>
          </div>
        )}

        {/* 1. release details */}
        <Section n="1" title="Release details">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Track name">
              <input style={inputStyle} className="rounded px-3 py-2 text-sm" value={meta.track_name} onChange={set("track_name")} placeholder="Eyes Cut Deeper" />
            </Field>
            <Field label="Artist">
              <input style={inputStyle} className="rounded px-3 py-2 text-sm" value={meta.artist_name} onChange={set("artist_name")} placeholder="Subtronics" />
            </Field>
            <Field label="Genre">
              <select style={inputStyle} className="rounded px-3 py-2 text-sm" value={meta.genre} onChange={set("genre")}>
                <option value="">Select…</option>
                {GENRES.map((g) => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>
            </Field>
            <Field label="Monthly listeners" hint="Plain number, no commas">
              <input style={inputStyle} className="rounded px-3 py-2 text-sm" value={meta.monthly_listeners} onChange={set("monthly_listeners")} inputMode="numeric" placeholder="2400000" />
            </Field>
            <Field label="Editorial tier">
              <select style={inputStyle} className="rounded px-3 py-2 text-sm" value={meta.editorial_tier} onChange={set("editorial_tier")}>
                {TIERS.map((t) => (
                  <option key={t.v} value={t.v}>{t.v}: {t.label}</option>
                ))}
              </select>
            </Field>
            <Field label="Release date" hint="Thursday assumed">
              <input style={inputStyle} type="date" className="rounded px-3 py-2 text-sm" value={meta.release_date} onChange={set("release_date")} />
            </Field>
          </div>
          <label className="mt-4 flex items-center gap-2">
            <input type="checkbox" checked={meta.is_feature} onChange={set("is_feature")} />
            <span className="text-sm">This is a feature / collab (not a solo release)</span>
          </label>
        </Section>

        {/* 2. daily data */}
        <Section n="2" title="Daily numbers">
          <div className="mb-3 flex flex-wrap items-center gap-3 text-sm">
            <span style={{ color: "var(--muted)" }}>
              Paste from your tracker, or upload a CSV. Columns:{" "}
              <code style={{ fontFamily: "var(--mono)", color: "var(--ink)" }}>
                {hasDayColumn ? "Day, Streams, Saves, Other%" : "Streams, Saves, Other%"}
              </code>{" "}
              (Other% optional).
            </span>
          </div>
          <div className="mb-3 flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={hasDayColumn} onChange={(e) => setHasDayColumn(e.target.checked)} />
              First column is the day number
            </label>
            <button onClick={() => setRaw(EXAMPLE)} style={{ color: "var(--accent)" }} className="text-sm underline">
              Load example
            </button>
            <button onClick={downloadTemplate} style={{ color: "var(--accent)" }} className="text-sm underline">
              Download CSV template
            </button>
            <label style={{ color: "var(--accent)" }} className="cursor-pointer text-sm underline">
              Upload CSV
              <input type="file" accept=".csv,.tsv,.txt" className="hidden" onChange={onFile} />
            </label>
          </div>
          <textarea
            style={{ ...inputStyle, fontFamily: "var(--mono)" }}
            className="h-40 w-full rounded px-3 py-2 text-xs"
            placeholder={"1,84210,9820,12.1\n2,41880,5110,18.4\n..."}
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
          />

          {parsed.rows.length > 0 && (
            <div className="mt-4 overflow-auto rounded" style={{ border: "1px solid var(--line)" }}>
              <table className="w-full text-left text-xs" style={{ fontFamily: "var(--mono)" }}>
                <thead style={{ background: "var(--bg)", color: "var(--muted)" }}>
                  <tr>
                    <th className="px-3 py-2">Day</th>
                    <th className="px-3 py-2">Streams</th>
                    <th className="px-3 py-2">Saves</th>
                    <th className="px-3 py-2">Other %</th>
                  </tr>
                </thead>
                <tbody>
                  {parsed.rows.map((r, i) => (
                    <tr key={i} style={{ borderTop: "1px solid var(--line)", color: "var(--ink)" }}>
                      <td className="px-3 py-1.5">{r.day_number}</td>
                      <td className="px-3 py-1.5">{Number.isFinite(r.streams) ? r.streams.toLocaleString() : "n/a"}</td>
                      <td className="px-3 py-1.5">{Number.isFinite(r.saves) ? r.saves.toLocaleString() : "n/a"}</td>
                      <td className="px-3 py-1.5">{r.other_pct ?? "n/a"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>

        {/* status + validation */}
        <Section n="3" title="Check & save">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Stat label="Days entered" value={v.validDays} />
            <Stat label="Days since release" value={v.daysSince ?? "n/a"} />
            <Stat label="Week-1 streams (sum d1–7)" value={v.wk1 ? v.wk1.toLocaleString() : "n/a"} />
          </div>

          <label className="mt-4 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={forceClosed} onChange={(e) => setForceClosed(e.target.checked)} />
            Force-mark as <b>closed</b> (overrides the 28-day / 7-day rule)
          </label>

          {v.errors.length > 0 && (
            <Box color="var(--err)" title={`${v.errors.length} thing(s) to fix`}>
              {v.errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </Box>
          )}
          {v.warnings.length > 0 && (
            <Box color="var(--warn)" title="Heads up">
              {v.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </Box>
          )}

          <button
            onClick={submit}
            disabled={!canSubmit}
            style={{
              background: canSubmit ? "var(--accent)" : "var(--line)",
              color: canSubmit ? "#fff" : "var(--muted)",
              fontFamily: "var(--body)",
              cursor: canSubmit ? "pointer" : "not-allowed",
            }}
            className="mt-5 w-full rounded-lg px-4 py-3 text-sm font-semibold tracking-wide transition"
          >
            {canSubmit ? `Save release (${v.closed ? "CLOSED" : "ACTIVE"})` : "Fix the items above to save"}
          </button>
        </Section>

        <p style={{ color: "var(--muted)" }} className="mt-6 text-center text-xs">
          This page only stores data. Retraining is run separately with{" "}
          <code style={{ fontFamily: "var(--mono)" }}>python retrain.py</code>.
        </p>
      </div>
    </div>
  );
}

function Section({ n, title, children }) {
  return (
    <section
      className="mb-5 rounded-lg p-5"
      style={{ background: "var(--panel)", border: "1px solid var(--line)" }}
    >
      <div className="mb-4 flex items-center gap-3">
        <span
          style={{ background: "var(--ink)", color: "var(--panel)", fontFamily: "var(--mono)" }}
          className="flex h-6 w-6 items-center justify-center rounded-full text-xs"
        >
          {n}
        </span>
        <h2 style={{ fontFamily: "var(--display)", color: "var(--ink)" }} className="text-xl">
          {title}
        </h2>
      </div>
      {children}
    </section>
  );
}

function Stat({ label, value }) {
  return (
    <div className="rounded p-3" style={{ background: "var(--bg)", border: "1px solid var(--line)" }}>
      <div style={{ color: "var(--muted)" }} className="text-xs">{label}</div>
      <div style={{ color: "var(--ink)", fontFamily: "var(--mono)" }} className="mt-1 text-lg">{value}</div>
    </div>
  );
}

function Box({ color, title, children }) {
  return (
    <div className="mt-4 rounded p-3" style={{ background: "var(--panel)", border: `1px solid ${color}` }}>
      <div style={{ color }} className="text-sm font-semibold">{title}</div>
      <ul style={{ color: "var(--ink)" }} className="mt-1 list-disc space-y-1 pl-5 text-sm">
        {children}
      </ul>
    </div>
  );
}
