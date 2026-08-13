/**
 * Manual ad-results entry → CanonicalRow[] for the shared upsert path.
 *
 * Field sets:
 *   Meta:    spend (required), impressions, clicks, streams,
 *            linkfire_visits, linkfire_spotify_clicks, start/end dates
 *   Spotify: spend (required), format, reach, clicks, converted_listeners,
 *            streams (est_attributed_streams), saves, start/end dates
 *
 * Flight dates map to existing ad_* start_date / end_date columns
 * (same as the file-upload path).
 */

import {
  emptyCanonicalRow,
  type AdUploadFormat,
  type AdUploadObjective,
  type AdUploadPlatform,
  type CanonicalRow,
} from "@/lib/ad-upload/canonical";

export type ManualCampaignDraft = {
  campaign_name: string;
  spend: string;
  impressions: string;
  clicks: string;
  /** Meta partner/Linkfire streams → canonical attributed_streams. */
  streams: string;
  linkfire_visits: string;
  linkfire_spotify_clicks: string;
  format: "" | AdUploadFormat;
  reach: string;
  converted_listeners: string;
  /** Spotify attributed streams → canonical attributed_streams. */
  est_attributed_streams: string;
  saves: string;
  /** YYYY-MM-DD → ad_* start_date */
  start_date: string;
  /** YYYY-MM-DD → ad_* end_date */
  end_date: string;
};

export function emptyManualDraft(): ManualCampaignDraft {
  return {
    campaign_name: "",
    spend: "",
    impressions: "",
    clicks: "",
    streams: "",
    linkfire_visits: "",
    linkfire_spotify_clicks: "",
    format: "",
    reach: "",
    converted_listeners: "",
    est_attributed_streams: "",
    saves: "",
    start_date: "",
    end_date: "",
  };
}

function parseOptionalNumber(raw: string): number | null {
  const cleaned = String(raw ?? "").trim().replace(/[$,\s]/g, "");
  if (cleaned === "" || cleaned === "—" || cleaned === "-") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** Accept HTML date input values (YYYY-MM-DD) or blank. */
function parseOptionalDate(raw: string): string | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return null;
}

/**
 * Convert manual form drafts into canonical rows (identity from release context).
 * Does not set usable_for_modeling — call applyGapFill afterward.
 */
export function manualDraftsToCanonicalRows(options: {
  platform: Exclude<AdUploadPlatform, "unknown">;
  drafts: ManualCampaignDraft[];
  artist: string;
  releaseKey: string;
  objective?: AdUploadObjective | null;
}): CanonicalRow[] {
  const objective =
    options.platform === "meta"
      ? (options.objective ?? "traffic")
      : null;

  return options.drafts.map((draft, index) => {
    const row = emptyCanonicalRow(index);
    row.campaign_name = draft.campaign_name.trim() || null;
    row.spend = parseOptionalNumber(draft.spend);
    row.artist = options.artist.trim() || null;
    row.release_key = options.releaseKey.trim() || null;
    row.start_date = parseOptionalDate(draft.start_date);
    row.end_date = parseOptionalDate(draft.end_date);

    if (options.platform === "meta") {
      row.objective = objective;
      row.impressions = parseOptionalNumber(draft.impressions);
      row.clicks = parseOptionalNumber(draft.clicks);
      row.attributed_streams = parseOptionalNumber(draft.streams);
      row.linkfire_visits = parseOptionalNumber(draft.linkfire_visits);
      row.linkfire_spotify_clicks = parseOptionalNumber(
        draft.linkfire_spotify_clicks,
      );
    } else {
      row.format = draft.format || null;
      row.reach = parseOptionalNumber(draft.reach);
      row.clicks = parseOptionalNumber(draft.clicks);
      row.converted_listeners = parseOptionalNumber(draft.converted_listeners);
      row.attributed_streams = parseOptionalNumber(draft.est_attributed_streams);
      row.saves = parseOptionalNumber(draft.saves);
    }

    return row;
  });
}

/** Client/server gate: at least one row with spend > 0. */
export function manualDraftsHaveSpend(drafts: ManualCampaignDraft[]): boolean {
  return drafts.some((d) => {
    const n = parseOptionalNumber(d.spend);
    return n != null && n > 0;
  });
}
