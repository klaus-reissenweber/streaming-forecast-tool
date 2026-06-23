import { formatCompactNumber, formatPercent } from "@/lib/format";

export interface LockedForecastBannerProps {
  streams: number;
  saves: number;
  impliedSaveRate: number;
  lockedAtDisplay: string;
}

export function LockedForecastBanner({
  streams,
  saves,
  impliedSaveRate,
  lockedAtDisplay,
}: LockedForecastBannerProps) {
  return (
    <section
      className="rounded-lg border border-orange-200 bg-orange-50 p-5"
      aria-label="Locked forecast"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-orange-800">
            Locked forecast
          </p>
          <p className="mt-1 text-sm text-orange-900/80">
            Week-1 targets locked at creation · {lockedAtDisplay}
          </p>
        </div>
        <p className="text-xs text-orange-800/70">Pre-release monitoring view</p>
      </div>

      <dl className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-orange-800/80">
            Week-1 streams
          </dt>
          <dd className="mt-1 text-3xl font-semibold tabular-nums text-orange-950">
            {formatCompactNumber(streams)}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-orange-800/80">
            Week-1 saves
          </dt>
          <dd className="mt-1 text-3xl font-semibold tabular-nums text-orange-950">
            {formatCompactNumber(saves)}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-orange-800/80">
            Implied save rate
          </dt>
          <dd className="mt-1 text-3xl font-semibold tabular-nums text-orange-950">
            {formatPercent(impliedSaveRate)}
          </dd>
        </div>
      </dl>
    </section>
  );
}
