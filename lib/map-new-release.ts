import type { ReleaseForecastInputs } from "@/lib/forecast";
import type { NewReleaseFormValues } from "@/lib/validate-new-release";
import {
  DEFAULT_MONTHLY_LISTENERS,
  type NewReleaseFormRawValues,
} from "@/lib/validate-new-release";

/** Row shape for inserting a new release at creation time. */
export interface NewReleaseInsertRow {
  track_name: string;
  artist_name: string;
  genre: string;
  monthly_listeners: number;
  is_feature: boolean;
  editorial_tier: number;
  release_date: string;
  release_type: string;
  spotify_format: string;
  meta_spend_planned: number;
  meta_objective: string;
  spotify_spend_planned: number;
  locked_forecast_streams: number;
  locked_forecast_saves: number;
  model_version_used: string;
  status: "active";
}

export function toReleaseForecastInputs(
  values: NewReleaseFormValues,
): ReleaseForecastInputs {
  return {
    monthlyListeners: values.monthlyListeners,
    isFeature: values.isFeature,
    editorialTier: values.editorialTier,
    genre: values.genre as ReleaseForecastInputs["genre"],
    releaseType: values.releaseType,
    spotifyFormat: values.spotifyFormat,
    metaSpendPlanned: values.metaSpendPlanned,
    metaObjective: values.metaObjective,
    spotifySpendPlanned: values.spotifySpendPlanned,
  };
}

export function toNewReleaseInsertRow(
  values: NewReleaseFormValues,
  forecast: {
    lockedForecastStreams: number;
    lockedForecastSaves: number;
    modelVersionId: string;
  },
): NewReleaseInsertRow {
  return {
    track_name: values.trackName.trim(),
    artist_name: values.artistName.trim(),
    genre: values.genre,
    monthly_listeners: values.monthlyListeners,
    is_feature: values.isFeature,
    editorial_tier: values.editorialTier,
    release_date: values.releaseDate,
    release_type: values.releaseType,
    spotify_format: values.spotifyFormat,
    meta_spend_planned: values.metaSpendPlanned,
    meta_objective: values.metaObjective,
    spotify_spend_planned: values.spotifySpendPlanned,
    locked_forecast_streams: forecast.lockedForecastStreams,
    locked_forecast_saves: forecast.lockedForecastSaves,
    model_version_used: forecast.modelVersionId,
    status: "active",
  };
}

/** Defaults for a fresh form (numeric fields use coerced defaults when empty). */
export const DEFAULT_NEW_RELEASE_FORM_VALUES: NewReleaseFormRawValues = {
  trackName: "",
  artistName: "",
  genre: "house",
  monthlyListeners: DEFAULT_MONTHLY_LISTENERS,
  isFeature: false,
  editorialTier: 0,
  releaseDate: "",
  releaseType: "single",
  spotifyFormat: "marquee",
  metaSpendPlanned: 0,
  metaObjective: "traffic",
  spotifySpendPlanned: 0,
};
