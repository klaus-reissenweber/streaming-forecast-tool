import type { ChannelMixRecommendation } from "@/lib/channel-mix";

export interface ChannelMixRecommendationProps {
  mix: ChannelMixRecommendation;
}

function formatUsd(value: number): string {
  return `$${value.toFixed(2)}`;
}

function SplitBar({
  spotifyPct,
  metaPct,
  label,
}: {
  spotifyPct: number;
  metaPct: number;
  label: string;
}) {
  if (spotifyPct === 0 && metaPct === 0) {
    return (
      <div>
        <p className="text-xs font-medium text-stone-600">{label}</p>
        <p className="mt-1 text-sm text-stone-500">No paid spend planned</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between text-xs font-medium text-stone-600">
        <span>{label}</span>
        <span className="tabular-nums">
          {spotifyPct}% Spotify · {metaPct}% Meta
        </span>
      </div>
      <div
        className="mt-1.5 flex h-3 overflow-hidden rounded-full bg-stone-100"
        role="img"
        aria-label={`${label}: ${spotifyPct}% Spotify, ${metaPct}% Meta`}
      >
        <div
          className="bg-emerald-600 transition-all"
          style={{ width: `${spotifyPct}%` }}
        />
        <div
          className="bg-sky-600 transition-all"
          style={{ width: `${metaPct}%` }}
        />
      </div>
      <div className="mt-1 flex gap-3 text-[11px] text-stone-500">
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full bg-emerald-600" />
          Spotify
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full bg-sky-600" />
          Meta
        </span>
      </div>
    </div>
  );
}

export function ChannelMixRecommendation({
  mix,
}: ChannelMixRecommendationProps) {
  const hasSpend = mix.total_spend > 0;

  return (
    <section className="rounded-lg border border-stone-200 bg-white p-5">
      <h2 className="text-lg font-semibold text-stone-900">
        Channel mix recommendation
      </h2>
      <p className="mt-1 text-sm text-stone-500">
        Spotify CPS ({formatUsd(mix.spotify_cps)}) vs Meta CPS (
        {formatUsd(mix.meta_cps)}) for this release
      </p>

      <p className="mt-4 text-sm leading-relaxed text-stone-800">
        {mix.recommendation_text}
      </p>

      <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2">
        <SplitBar
          label="Recommended split"
          spotifyPct={mix.spotify_pct}
          metaPct={mix.meta_pct}
        />
        {hasSpend ? (
          <SplitBar
            label="Your planned split"
            spotifyPct={mix.planned_spotify_pct}
            metaPct={mix.planned_meta_pct}
          />
        ) : null}
      </div>

      {hasSpend ? (
        <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-stone-100 pt-4 sm:grid-cols-4">
          <div>
            <dt className="text-xs text-stone-500">Spotify spend</dt>
            <dd className="text-sm font-medium tabular-nums text-stone-900">
              {formatUsd(mix.adImpact.spotify.spend)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-stone-500">Meta spend</dt>
            <dd className="text-sm font-medium tabular-nums text-stone-900">
              {formatUsd(mix.adImpact.meta.spend)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-stone-500">Est. Spotify streams</dt>
            <dd className="text-sm font-medium tabular-nums text-stone-900">
              {mix.adImpact.spotify.estimatedStreams.toLocaleString("en-US")}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-stone-500">Est. Meta streams</dt>
            <dd className="text-sm font-medium tabular-nums text-stone-900">
              {mix.adImpact.meta.estimatedStreams.toLocaleString("en-US")}
            </dd>
          </div>
        </dl>
      ) : null}
    </section>
  );
}
