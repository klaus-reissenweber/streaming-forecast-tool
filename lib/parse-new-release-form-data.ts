import type {
  Genre,
  MetaObjective,
  ReleaseType,
  SpotifyFormat,
} from "@/lib/forecast";
import type { NewReleaseFormRawValues } from "@/lib/validate-new-release";

function parseCheckbox(value: FormDataEntryValue | null): boolean {
  if (value === null) {
    return false;
  }
  const normalized = String(value).toLowerCase();
  return normalized === "true" || normalized === "on" || normalized === "1";
}

/** Build raw form values from FormData (empty numeric fields stay as "" for coercion). */
export function rawValuesFromFormData(formData: FormData): NewReleaseFormRawValues {
  return {
    trackName: String(formData.get("trackName") ?? ""),
    artistName: String(formData.get("artistName") ?? ""),
    genre: String(formData.get("genre") ?? "") as Genre | "",
    monthlyListeners: String(formData.get("monthlyListeners") ?? ""),
    isFeature: parseCheckbox(formData.get("isFeature")),
    editorialTier: String(formData.get("editorialTier") ?? "0"),
    releaseDate: String(formData.get("releaseDate") ?? ""),
    releaseType: String(formData.get("releaseType") ?? "single") as ReleaseType,
    spotifyFormat: String(formData.get("spotifyFormat") ?? "marquee") as SpotifyFormat,
    metaSpendPlanned: String(formData.get("metaSpendPlanned") ?? ""),
    metaObjective: String(formData.get("metaObjective") ?? "traffic") as MetaObjective,
    spotifySpendPlanned: String(formData.get("spotifySpendPlanned") ?? ""),
  };
}
