import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageBreadcrumbs } from "@/components/layout/PageBreadcrumbs";
import { AdResultsStatus } from "@/components/release/AdResultsStatus";
import { AlgoPositioningModule } from "@/components/release/AlgoPositioningModule";
import { ChannelMixForecast } from "@/components/release/ChannelMixForecast";
import { DailyEntrySection } from "@/components/release/DailyEntrySection";
import { FlagsPanel } from "@/components/release/FlagsPanel";
import { GenrePlaybook } from "@/components/release/GenrePlaybook";
import { HealthBanner } from "@/components/release/HealthBanner";
import { LockedForecastBanner } from "@/components/release/LockedForecastBanner";
import { MetricCards } from "@/components/release/MetricCards";
import { ReleasePageHeader } from "@/components/release/ReleasePageHeader";
import { StreamCurveChart } from "@/components/release/StreamCurveChart";
import {
  ALGO_BAND_DISPLAY,
  algoBandCutoffCaption,
} from "@/lib/algo-positioning-display";
import { buildReleaseViewModel } from "@/lib/build-release-view-model";
import { loadAdReportByReleaseId, reportPublicUrl } from "@/lib/ad-report/load";
import { releaseKeyFromTrackName } from "@/lib/ad-upload/canonical";
import { loadCampaignFlightsForReleaseKey } from "@/lib/load-campaign-flights";
import { summarizeAdCampaigns } from "@/lib/ad-results-summary";
import { loadActiveModel } from "@/lib/load-active-model";
import { loadForecastData } from "@/lib/load-forecast-data";
import { loadDailyData, loadRelease } from "@/lib/load-release";
import { loadReleaseArtists } from "@/lib/load-release-artists";
import { logActiveModelSource } from "@/lib/model/forecast-model";

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
    description: `Forecast monitoring for ${release.track_name} by ${release.artist_name}.`,
  };
}

export default async function ReleasePage({ params }: ReleasePageProps) {
  const { id } = await params;
  const release = await loadRelease(id);

  if (!release) {
    notFound();
  }

  const dailyData = await loadDailyData(id);
  const [model, { adRates, coefficients }, existingReport, campaignFlights, artists] =
    await Promise.all([
      loadActiveModel(),
      loadForecastData(),
      loadAdReportByReleaseId(id).catch(() => null),
      loadCampaignFlightsForReleaseKey(
        releaseKeyFromTrackName(release.track_name),
      ).catch(() => []),
      loadReleaseArtists(id).catch(() => []),
    ]);
  logActiveModelSource(model, `release/${id}`);
  const siteOrigin =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
    "http://localhost:3000";
  const reportPath = existingReport
    ? `/report/${existingReport.slug}`
    : null;
  const reportUrl = existingReport
    ? reportPublicUrl(existingReport.slug, siteOrigin)
    : null;
  const viewModel = buildReleaseViewModel(
    release,
    dailyData,
    adRates,
    model.source === "db" ? model.streamsD0.r2 : coefficients.streams.streams_d0.r2,
    model,
    artists,
  );

  const { health, saveVelocity, liveAlgoPositioning } = viewModel.monitoring;
  const algoPositioningForMetrics =
    liveAlgoPositioning ?? viewModel.algoPositioning;
  const lockedAlgoBandLabel =
    ALGO_BAND_DISPLAY[viewModel.algoPositioning.band].label;
  const liveAlgoBandLabel = liveAlgoPositioning
    ? ALGO_BAND_DISPLAY[liveAlgoPositioning.band].label
    : lockedAlgoBandLabel;

  const projectedWk1Sublabel =
    health.streamDaysEntered > 0
      ? health.streamDaysEntered === 1
        ? "D1 pace"
        : `D1–D${health.streamDaysEntered} pace`
      : "Forecast";

  const algoBandSublabel = liveAlgoPositioning
    ? `Live pace · ${algoBandCutoffCaption(algoPositioningForMetrics)}`
    : algoBandCutoffCaption(algoPositioningForMetrics);

  return (
    <main className="mx-auto max-w-6xl px-5 py-8">
      <PageBreadcrumbs
        items={[
          {
            label: "Releases",
            href: viewModel.header.status === "closed" ? "/archive" : "/",
          },
          { label: viewModel.header.trackName },
        ]}
      />

      <div className="mt-4">
        <ReleasePageHeader
          releaseId={id}
          trackName={viewModel.header.trackName}
          artistName={viewModel.header.artistName}
          genre={viewModel.header.genre}
          releaseDateDisplay={viewModel.header.releaseDateDisplay}
          editorialTier={viewModel.header.editorialTier}
          status={viewModel.header.status}
          reportPath={reportPath}
          reportUrl={reportUrl}
          artists={viewModel.artists}
          forecastUsedMonthlyListeners={
            release.monthly_listeners_at_release
          }
        />
      </div>

      <div className="mt-6">
        <AdResultsStatus
          summary={summarizeAdCampaigns(campaignFlights)}
          href={`/release/${id}/ad-upload`}
        />
      </div>

      <div className="mt-6">
        <LockedForecastBanner
          streams={viewModel.locked.streams}
          saves={viewModel.locked.saves}
          forecastSaveRate={viewModel.locked.impliedSaveRate}
          actualSaveRate={viewModel.actualSaveRate}
          actualSaveRateVsBand={viewModel.actualSaveRateVsBand}
          saveRateBand={viewModel.locked.saveRateBand}
          actualStreams={
            viewModel.wk1Complete ? viewModel.actualStreams : null
          }
          actualStreamsVsBand={viewModel.actualStreamsVsBand}
          expectedStreamRange={viewModel.locked.expectedStreamRange}
          lockedAtDisplay={viewModel.locked.lockedAtDisplay}
          status={viewModel.header.status}
          releaseDate={viewModel.header.releaseDate}
          week1WithAds={viewModel.adLayer.week1WithAds}
          week1AdMarquee={viewModel.adLayer.week1AdMarquee}
          week1AdShowcase={viewModel.adLayer.week1AdShowcase}
          week1AdMeta={viewModel.adLayer.week1AdMeta}
          metaAwarenessSpend={viewModel.adLayer.plan.metaAwarenessSpend}
        />

        <section className="mt-6" aria-label="Monitoring summary">
          <HealthBanner health={viewModel.monitoring.health} />

          <div className="mt-4">
            <MetricCards
              projectedWk1Streams={health.projectedWk1}
              projectedWk1Sublabel={projectedWk1Sublabel}
              saveVelocity={saveVelocity.display}
              algoBandLabel={liveAlgoBandLabel}
              algoBandSublabel={algoBandSublabel}
              modelConfidenceR2={viewModel.modelConfidenceR2}
            />
          </div>
        </section>

        <div className="mt-8">
          <FlagsPanel phase={viewModel.phase} flags={viewModel.flags} />
        </div>

        <div className="mt-8">
          <DailyEntrySection
            releaseId={id}
            initialDailyData={viewModel.dailyData}
            status={viewModel.header.status}
          />
        </div>

        <div className="mt-8">
          <StreamCurveChart
            lockedStreamCurve={viewModel.streamCurve}
            projectedStreamCurve={viewModel.monitoring.projectedStreamCurve}
            marqueeAdDaily={viewModel.adLayer.marqueeDaily}
            showcaseAdDaily={viewModel.adLayer.showcaseDaily}
            metaAdDaily={viewModel.adLayer.metaDaily}
            actualStreamsByDay={viewModel.actualStreamsByDay}
            phase={viewModel.phase}
            releaseDate={viewModel.header.releaseDate}
            campaignFlights={campaignFlights}
          />
        </div>

        <section className="mt-8 space-y-8" aria-label="Reference modules">
          <AlgoPositioningModule positioning={viewModel.algoPositioning} />

          <ChannelMixForecast
            plan={viewModel.adLayer.plan}
            genre={release.genre}
            adModel={model.adModel}
          />

          <GenrePlaybook genre={viewModel.header.genre} />
        </section>
      </div>
    </main>
  );
}
