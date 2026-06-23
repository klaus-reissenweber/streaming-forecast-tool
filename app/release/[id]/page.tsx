import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AlgoPositioningModule } from "@/components/release/AlgoPositioningModule";
import { ChannelMixRecommendation } from "@/components/release/ChannelMixRecommendation";
import { DailyEntrySection } from "@/components/release/DailyEntrySection";
import { FlagsPanel } from "@/components/release/FlagsPanel";
import { GenrePlaybook } from "@/components/release/GenrePlaybook";
import { HealthBanner } from "@/components/release/HealthBanner";
import { LockedForecastBanner } from "@/components/release/LockedForecastBanner";
import { MetricCards } from "@/components/release/MetricCards";
import { ReleasePageHeader } from "@/components/release/ReleasePageHeader";
import { SourceOfStreamsChart } from "@/components/release/SourceOfStreamsChart";
import { StreamCurveChart } from "@/components/release/StreamCurveChart";
import { ALGO_BAND_DISPLAY } from "@/lib/algo-positioning-display";
import { buildReleaseViewModel } from "@/lib/build-release-view-model";
import { loadForecastData } from "@/lib/load-forecast-data";
import { loadDailyData, loadRelease } from "@/lib/load-release";

interface ReleasePageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({
  params,
}: ReleasePageProps): Promise<Metadata> {
  const { id } = await params;
  const release = await loadRelease(id);

  if (!release) {
    return { title: "Release not found" };
  }

  return {
    title: `${release.track_name} · ${release.artist_name}`,
    description: `Locked forecast monitoring for ${release.track_name} by ${release.artist_name}.`,
  };
}

export default async function ReleasePage({ params }: ReleasePageProps) {
  const { id } = await params;
  const release = await loadRelease(id);

  if (!release) {
    notFound();
  }

  const dailyData = await loadDailyData(id);
  const { adRates, coefficients } = await loadForecastData();
  const viewModel = buildReleaseViewModel(
    release,
    dailyData,
    adRates,
    coefficients.streams.streams_d0.r2,
  );

  const { health, saveVelocity, liveAlgoPositioning } = viewModel.monitoring;
  const lockedAlgoBandLabel =
    ALGO_BAND_DISPLAY[viewModel.algoPositioning.band].label;
  const liveAlgoBandLabel = liveAlgoPositioning
    ? ALGO_BAND_DISPLAY[liveAlgoPositioning.band].label
    : lockedAlgoBandLabel;

  const projectedWk1Sublabel =
    health.streamDaysEntered > 0
      ? health.streamDaysEntered === 1
        ? "From D1 pace"
        : `From D1–D${health.streamDaysEntered} pace`
      : "Locked forecast";

  const algoBandSublabel = liveAlgoPositioning
    ? "Live pace"
    : "Locked forecast";

  return (
    <main className="mx-auto max-w-6xl px-5 py-8">
      <ReleasePageHeader
        trackName={viewModel.header.trackName}
        artistName={viewModel.header.artistName}
        genre={viewModel.header.genre}
        releaseDateDisplay={viewModel.header.releaseDateDisplay}
        editorialTier={viewModel.header.editorialTier}
        status={viewModel.header.status}
      />

      <div className="mt-6 space-y-6">
        <LockedForecastBanner
          streams={viewModel.locked.streams}
          saves={viewModel.locked.saves}
          impliedSaveRate={viewModel.locked.impliedSaveRate}
          lockedAtDisplay={viewModel.locked.lockedAtDisplay}
        />

        <section className="space-y-6" aria-label="Monitoring summary">
          <HealthBanner health={viewModel.monitoring.health} />

          <MetricCards
            projectedWk1Streams={health.projectedWk1}
            projectedWk1Sublabel={projectedWk1Sublabel}
            saveVelocity={saveVelocity.display}
            algoBandLabel={liveAlgoBandLabel}
            algoBandSublabel={algoBandSublabel}
            modelConfidenceR2={viewModel.modelConfidenceR2}
          />

          <FlagsPanel phase={viewModel.phase} flags={viewModel.flags} />
        </section>

        <DailyEntrySection
          releaseId={id}
          initialDailyData={viewModel.dailyData}
          status={viewModel.header.status}
        />

        <section className="space-y-6" aria-label="Charts">
          <StreamCurveChart
            lockedStreamCurve={viewModel.streamCurve}
            projectedStreamCurve={viewModel.monitoring.projectedStreamCurve}
            actualStreamsByDay={viewModel.actualStreamsByDay}
            phase={viewModel.phase}
          />

          <SourceOfStreamsChart
            otherPctByDay={viewModel.otherPctByDay}
            phase={viewModel.phase}
          />
        </section>

        <section className="space-y-6" aria-label="Reference modules">
          <AlgoPositioningModule positioning={viewModel.algoPositioning} />

          <ChannelMixRecommendation mix={viewModel.channelMix} />

          <GenrePlaybook genre={viewModel.header.genre} />
        </section>
      </div>
    </main>
  );
}
