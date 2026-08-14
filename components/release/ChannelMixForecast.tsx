"use client";

import { SectionHeader } from "@/components/layout/SectionHeader";
import { AdSpendLiveForecast } from "@/components/new/AdSpendLiveForecast";
import type { AdSpendPlan } from "@/lib/ad-forecast";
import type { Genre } from "@/lib/forecast";
import type { AdModel } from "@/lib/model/ad-model";

export interface ChannelMixForecastProps {
  plan: AdSpendPlan;
  genre: Genre;
  adModel: AdModel;
}

/**
 * Release-page channel mix: same AdSpendLiveForecast cards as /new
 * (single source of truth for ad-model attributed metrics). No recommendation UI.
 */
export function ChannelMixForecast({
  plan,
  genre,
  adModel,
}: ChannelMixForecastProps) {
  const hasSpend =
    plan.marqueeSpend > 0 ||
    plan.showcaseSpend > 0 ||
    plan.metaTrafficSpend > 0 ||
    plan.metaAwarenessSpend > 0;

  return (
    <section
      className="motion-fade-up"
      aria-label="Channel mix forecast"
    >
      <SectionHeader description="Forecasted ad metrics from the active ad model — same figures as create release.">
        Channel mix
      </SectionHeader>

      {hasSpend ? (
        <div className="mt-4">
          <AdSpendLiveForecast
            bare
            artistName={plan.artistName}
            genre={genre}
            marqueeSpend={plan.marqueeSpend}
            showcaseSpend={plan.showcaseSpend}
            metaTrafficSpend={plan.metaTrafficSpend}
            metaAwarenessSpend={plan.metaAwarenessSpend}
            adModel={adModel}
          />
        </div>
      ) : (
        <p className="mt-4 text-body-sm text-secondary">
          No paid budget in plan. Forecast assumes organic only.
        </p>
      )}
    </section>
  );
}
