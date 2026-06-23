const DAYS = Array.from({ length: 28 }, (_, index) => index + 1);

const ROWS = [
  { key: "streams", label: "Streams" },
  { key: "saves", label: "Saves" },
  { key: "other_pct", label: "Other %" },
] as const;

export function DailyEntryGrid() {
  return (
    <section className="rounded-lg border border-stone-200 bg-white p-5">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-stone-900">Daily entry</h2>
          <p className="mt-1 text-sm text-stone-500">
            D1–D28 · streams, saves, and source-of-streams Other %
          </p>
        </div>
        <p className="mt-2 text-xs font-medium text-stone-400 sm:mt-0">
          Daily entry starts in step 5
        </p>
      </div>

      <div className="mt-5 overflow-x-auto">
        <table className="min-w-full border-collapse text-sm">
          <thead>
            <tr>
              <th
                scope="col"
                className="sticky left-0 z-10 border-b border-stone-200 bg-white px-2 py-2 text-left text-xs font-semibold uppercase tracking-wide text-stone-500"
              >
                Metric
              </th>
              {DAYS.map((day) => (
                <th
                  key={day}
                  scope="col"
                  className="border-b border-stone-200 px-1 py-2 text-center text-xs font-medium text-stone-500"
                >
                  D{day}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row) => (
              <tr key={row.key} className="border-b border-stone-100 last:border-b-0">
                <th
                  scope="row"
                  className="sticky left-0 z-10 bg-white px-2 py-2 text-left text-xs font-medium text-stone-700"
                >
                  {row.label}
                </th>
                {DAYS.map((day) => (
                  <td key={day} className="px-1 py-1.5">
                    <input
                      type="text"
                      disabled
                      readOnly
                      aria-label={`${row.label} day ${day}`}
                      placeholder="..."
                      className="w-14 rounded border border-stone-200 bg-stone-50 px-1.5 py-1 text-center text-xs tabular-nums text-stone-400 placeholder:text-stone-300"
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
