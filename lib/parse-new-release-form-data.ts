import type {
  Genre,
  ReleaseType,
} from "@/lib/forecast";
import {
  defaultNewReleaseArtists,
  type NewReleaseArtistDraft,
  type NewReleaseFormRawValues,
} from "@/lib/validate-new-release";
import { isArtistRole, MAX_RELEASE_ARTISTS } from "@/lib/release-artists";

function parseCheckbox(value: FormDataEntryValue | null): boolean {
  if (value === null) {
    return false;
  }
  const normalized = String(value).toLowerCase();
  return normalized === "true" || normalized === "on" || normalized === "1";
}

function parseArtistsFromFormData(formData: FormData): NewReleaseArtistDraft[] {
  const json = formData.get("artists");
  if (typeof json === "string" && json.trim()) {
    try {
      const parsed = JSON.parse(json) as unknown;
      if (Array.isArray(parsed)) {
        return parsed.slice(0, MAX_RELEASE_ARTISTS).map((row) => {
          const record = row as Record<string, unknown>;
          const roleRaw = String(record.role ?? "");
          return {
            name: String(record.name ?? ""),
            monthlyListeners:
              record.monthlyListeners == null ? "" : String(record.monthlyListeners),
            role: isArtistRole(roleRaw) ? roleRaw : "",
          };
        });
      }
    } catch {
      // Fall through to indexed fields.
    }
  }

  const artists: NewReleaseArtistDraft[] = [];
  for (let index = 0; index < MAX_RELEASE_ARTISTS; index += 1) {
    const name = formData.get(`artists[${index}].name`);
    const roleRaw = String(formData.get(`artists[${index}].role`) ?? "");
    const ml = formData.get(`artists[${index}].monthlyListeners`);
    if (name == null && ml == null && !roleRaw) {
      continue;
    }
    artists.push({
      name: String(name ?? ""),
      monthlyListeners: ml == null ? "" : String(ml),
      role: isArtistRole(roleRaw) ? roleRaw : "",
    });
  }
  return artists.length > 0 ? artists : defaultNewReleaseArtists();
}

/** Build raw form values from FormData (empty numeric fields stay as "" for coercion). */
export function rawValuesFromFormData(formData: FormData): NewReleaseFormRawValues {
  const artists = parseArtistsFromFormData(formData);
  const primary = artists.find((row) => row.role === "primary") ?? artists[0];
  return {
    trackName: String(formData.get("trackName") ?? ""),
    artistName: String(formData.get("artistName") ?? ""),
    artists,
    genre: String(formData.get("genre") ?? "") as Genre | "",
    monthlyListeners: String(
      formData.get("monthlyListeners") ?? primary?.monthlyListeners ?? "",
    ),
    isFeature: parseCheckbox(formData.get("isFeature")),
    editorialTier: String(formData.get("editorialTier") ?? "0"),
    releaseDate: String(formData.get("releaseDate") ?? ""),
    releaseType: String(formData.get("releaseType") ?? "single") as ReleaseType,
    spotifyMarqueeSpendPlanned: String(
      formData.get("spotifyMarqueeSpendPlanned") ?? "",
    ),
    spotifyShowcaseSpendPlanned: String(
      formData.get("spotifyShowcaseSpendPlanned") ?? "",
    ),
    metaTrafficSpendPlanned: String(formData.get("metaTrafficSpendPlanned") ?? ""),
    metaAwarenessSpendPlanned: String(
      formData.get("metaAwarenessSpendPlanned") ?? "",
    ),
  };
}
