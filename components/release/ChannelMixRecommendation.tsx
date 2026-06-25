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
        <p className="text-xs font-medium text-secondary">{label}</p>
        <p className="mt-1 text-body-sm text-muted">No paid spend planned</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between text-xs font-medium text-secondary">
        <span>{label}</span>
        <span className="font-mono tabular-nums">
          {spotifyPct}% Spotify · {metaPct}% Meta
        </span>
      </div>
      <div
        className="mt-1.5 flex h-3 overflow-hidden rounded-full bg-canvas"
        role="img"
        aria-label={`${label}: ${spotifyPct}% Spotify, ${metaPct}% Meta`}
      >
        <div
          className="bg-semantic-positive transition-all"
          style={{ width: `${spotifyPct}%` }}
        />
        <div
          className="bg-semantic-info transition-all"
          style={{ width: `${metaPct}%` }}
        />
      </div>
      <div className="mt-1 flex gap-3 text-[11px] text-muted">
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full bg-semantic-positive" />
          Spotify
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full bg-semantic-info" />
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
    <section
      className="motion-fade-up rounded-instrument border border-border bg-surface p-5"
      aria-label="Channel mix recommendation"
    >
      <h2 className="font-serif text-section font-semibold text-foreground">
        <span className="bracket-tag bracket-tag--accent mr-2 align-middle">
          [CHANNEL MIX]
        </span>
        <span className="instrument-section-title align-middle">
          Channel mix recommendation
        </span>
      </h2>
      <p className="mt-1 text-body-sm text-muted">
        Spotify CPS (
        <span className="font-mono tabular-nums text-secondary">
          {formatUsd(mix.spotify_cps)}
        </span>
        ) vs Meta CPS (
        <span className="font-mono tabular-nums text-secondary">
          {formatUsd(mix.meta_cps)}
        </span>
        ) for this release
      </p>

      <p className="mt-4 text-body-sm leading-relaxed text-secondary">
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
        <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-border-subtle pt-4 sm:grid-cols-4">
          <div>
            <dt className="text-xs text-muted">Spotify spend</dt>
            <dd className="font-mono text-body-sm font-medium tabular-nums text-foreground">
              {formatUsd(mix.adImpact.spotify.spend)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Meta spend</dt>
            <dd className="font-mono text-body-sm font-medium tabular-nums text-foreground">
              {formatUsd(mix.adImpact.meta.spend)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Est. Spotify streams</dt>
            <dd className="font-mono text-body-sm font-medium tabular-nums text-foreground">
              {mix.adImpact.spotify.estimatedStreams.toLocaleString("en-US")}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Est. Meta streams</dt>
            <dd className="font-mono text-body-sm font-medium tabular-nums text-foreground">
              {mix.adImpact.meta.estimatedStreams.toLocaleString("en-US")}
            </dd>
          </div>
        </dl>
      ) : null}
    </section>
  );
}
