import type { AdImpactForecast, AdRates, ReleaseForecastInputs } from "@/lib/forecast";
import { predictAdImpact } from "@/lib/forecast";

export interface ChannelMixRecommendation {
  spotify_pct: number;
  meta_pct: number;
  recommendation_text: string;
  spotify_cps: number;
  meta_cps: number;
  planned_spotify_pct: number;
  planned_meta_pct: number;
  total_spend: number;
  adImpact: AdImpactForecast;
}

function formatUsd(value: number): string {
  return `$${value.toFixed(2)}`;
}

/**
 * v3.2 channel mix logic: compare Spotify CPS (tier-based) vs Meta CPS (genre × objective),
 * recommend an efficiency-weighted split, and contrast with the planned allocation.
 */
export function recommendChannelMix(
  inputs: Pick<
    ReleaseForecastInputs,
    | "monthlyListeners"
    | "genre"
    | "releaseType"
    | "spotifyFormat"
    | "spotifySpendPlanned"
    | "metaSpendPlanned"
    | "metaObjective"
  >,
  adRates: AdRates,
): ChannelMixRecommendation {
  const adImpact = predictAdImpact(inputs, adRates);
  const spotifyCps = adImpact.spotify.costPerStream;
  const metaCps = adImpact.meta.costPerStream;
  const totalSpend = inputs.spotifySpendPlanned + inputs.metaSpendPlanned;

  if (totalSpend <= 0) {
    return {
      spotify_pct: 0,
      meta_pct: 0,
      recommendation_text:
        "No paid budget in plan. Forecast assumes organic only. Add Spotify and/or Meta spend to get a recommended channel split.",
      spotify_cps: spotifyCps,
      meta_cps: metaCps,
      planned_spotify_pct: 0,
      planned_meta_pct: 0,
      total_spend: 0,
      adImpact,
    };
  }

  const spotifyWeight = spotifyCps > 0 ? 1 / spotifyCps : 0;
  const metaWeight = metaCps > 0 ? 1 / metaCps : 0;
  const totalWeight = spotifyWeight + metaWeight;

  const spotify_pct =
    totalWeight > 0 ? Math.round((spotifyWeight / totalWeight) * 100) : 50;
  const meta_pct = 100 - spotify_pct;

  const planned_spotify_pct = Math.round(
    (inputs.spotifySpendPlanned / totalSpend) * 100,
  );
  const planned_meta_pct = 100 - planned_spotify_pct;

  const cpsRatio = metaCps / spotifyCps;
  let recommendation_text: string;

  if (cpsRatio >= 5) {
    recommendation_text =
      `Spotify is ${cpsRatio.toFixed(1)}× cheaper per stream (${formatUsd(spotifyCps)} vs ${formatUsd(metaCps)} CPS). ` +
      `Target ~${spotify_pct}% Spotify / ${meta_pct}% Meta for efficiency. ` +
      `Your plan: ${planned_spotify_pct}% Spotify / ${planned_meta_pct}% Meta. Shift toward Spotify unless Meta is running a specific creative test.`;
  } else if (cpsRatio <= 0.2) {
    const inverseRatio = spotifyCps / metaCps;
    recommendation_text =
      `Meta is ${inverseRatio.toFixed(1)}× cheaper per stream for ${inputs.genre} at ${inputs.metaObjective} ` +
      `(${formatUsd(metaCps)} vs ${formatUsd(spotifyCps)} CPS). ` +
      `Target ~${spotify_pct}% Spotify / ${meta_pct}% Meta. ` +
      `Your plan: ${planned_spotify_pct}% Spotify / ${planned_meta_pct}% Meta.`;
  } else {
    recommendation_text =
      `CPS rates are in the same ballpark (${formatUsd(spotifyCps)} Spotify vs ${formatUsd(metaCps)} Meta). ` +
      `Efficiency-optimal split: ${spotify_pct}% Spotify / ${meta_pct}% Meta. ` +
      `Your plan: ${planned_spotify_pct}% Spotify / ${planned_meta_pct}% Meta.`;
  }

  return {
    spotify_pct,
    meta_pct,
    recommendation_text,
    spotify_cps: spotifyCps,
    meta_cps: metaCps,
    planned_spotify_pct,
    planned_meta_pct,
    total_spend: totalSpend,
    adImpact,
  };
}
