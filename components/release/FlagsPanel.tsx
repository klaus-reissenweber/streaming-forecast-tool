import type { ReleasePhase } from "@/lib/build-release-view-model";

export interface ReleaseFlag {
  type: "positive" | "warning" | "info";
  title: string;
  detail: string;
}

export interface FlagsPanelProps {
  phase: ReleasePhase;
  flags?: readonly ReleaseFlag[];
}

export function FlagsPanel({ phase, flags = [] }: FlagsPanelProps) {
  const isEmpty = phase === "pre-release" || flags.length === 0;

  return (
    <section className="rounded-lg border border-stone-200 bg-white p-5">
      <h2 className="text-lg font-semibold text-stone-900">Flags</h2>
      <p className="mt-1 text-sm text-stone-500">
        Deviation alerts from daily actuals vs forecast
      </p>

      {isEmpty ? (
        <p className="mt-5 rounded-lg border border-dashed border-stone-200 bg-stone-50 px-4 py-8 text-center text-sm text-stone-500">
          Flags appear once daily data is entered
        </p>
      ) : (
        <ul className="mt-5 space-y-3">
          {flags.map((flag) => (
            <li
              key={`${flag.type}-${flag.title}`}
              className="rounded-lg border border-stone-200 bg-stone-50 px-4 py-3"
            >
              <p className="text-sm font-semibold text-stone-900">{flag.title}</p>
              <p className="mt-1 text-sm text-stone-600">{flag.detail}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
