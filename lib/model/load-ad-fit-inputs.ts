/**
 * Load ad_model fit inputs from ad_* DB tables (no seed CSV at fit time).
 * Import scripts are responsible for populating delivery / Linkfire columns.
 */

import { coerceMetaObjective } from "@/lib/meta-objective";
import {
  isLinkfireAutoRouter,
  normalizeArtistKey,
  type AdFormat,
  type AdGenre,
  type MetaAwarenessFitRow,
  type MetaCampaignFitRow,
  type SpotifyCampaignFitRow,
} from "@/lib/model/ad-model";
import { createServiceClient } from "@/lib/supabase/service";

export type AdFitInputs = {
  spotify: SpotifyCampaignFitRow[];
  meta: MetaCampaignFitRow[];
  awareness: MetaAwarenessFitRow[];
  artistGenreByKey: Map<string, AdGenre>;
};

function num(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  const n = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(n) ? n : null;
}

export async function loadAdFitInputs(): Promise<AdFitInputs> {
  const sb = createServiceClient();

  const { data: camps, error: campErr } = await sb
    .from("ad_spotify_campaigns")
    .select(
      "artist, format, spend_usd, converted_listeners, est_attributed_streams, usable_for_modeling",
    );
  if (campErr) throw new Error(`ad_spotify_campaigns: ${campErr.message}`);

  // Intentionally omit linkfire_spotify_clicks / linkfire_visits — measured
  // click counts must not enter the global fit (share/cpc stay multi-service only).
  const metaSelectFull =
    "release_key, objective, spend_usd, link_clicks, spotify_click_share, impressions, reach, linkfire_ctr_pct, linkfire_streams";
  const metaSelectLegacy =
    "release_key, objective, spend_usd, link_clicks, spotify_click_share";

  let metaRows: Record<string, unknown>[] | null = null;
  const full = await sb.from("ad_meta_campaigns").select(metaSelectFull);
  if (full.error) {
    // Pre-migration DBs lack impressions/reach/linkfire_* — still fit CPL/CPC/share.
    const legacy = await sb.from("ad_meta_campaigns").select(metaSelectLegacy);
    if (legacy.error) {
      throw new Error(`ad_meta_campaigns: ${legacy.error.message}`);
    }
    metaRows = (legacy.data ?? []) as Record<string, unknown>[];
  } else {
    metaRows = (full.data ?? []) as Record<string, unknown>[];
  }

  const { data: releases, error: relErr } = await sb
    .from("releases")
    .select("artist_name, genre");
  if (relErr) throw new Error(`releases: ${relErr.message}`);

  const artistGenreByKey = new Map<string, AdGenre>();
  for (const r of releases ?? []) {
    const key = normalizeArtistKey(String(r.artist_name ?? ""));
    const genre = r.genre as AdGenre;
    if (key && genre) artistGenreByKey.set(key, genre);
  }

  const spotify: SpotifyCampaignFitRow[] = (camps ?? []).map((r) => ({
    artist: String(r.artist),
    format: r.format as AdFormat,
    spendUsd: num(r.spend_usd),
    convertedListeners: num(r.converted_listeners),
    estAttributedStreams: num(r.est_attributed_streams),
    usableForModeling: Boolean(r.usable_for_modeling),
  }));

  const meta: MetaCampaignFitRow[] = [];
  const awareness: MetaAwarenessFitRow[] = [];

  for (const r of metaRows ?? []) {
    const releaseKey = String(r.release_key ?? "");
    const objective = coerceMetaObjective(
      r.objective == null ? null : String(r.objective),
      "traffic",
    );
    const spendUsd = num(r.spend_usd);
    const impressions = num(r.impressions);
    const reach = num(r.reach);
    const linkfireStreams = num(r.linkfire_streams);
    const linkfireCtr = num(r.linkfire_ctr_pct);

    meta.push({
      releaseKey,
      objective,
      spendUsd,
      linkClicks: num(r.link_clicks),
      spotifyClickShare: num(r.spotify_click_share),
      isAutoRouter: isLinkfireAutoRouter({
        releaseKey,
        ctrPct: linkfireCtr,
        streams: linkfireStreams,
      }),
    });

    // Awareness CPM / $/reach from any row with spend + impressions + reach.
    if (
      spendUsd != null &&
      spendUsd > 0 &&
      impressions != null &&
      impressions > 0 &&
      reach != null &&
      reach > 0
    ) {
      awareness.push({ spendUsd, impressions, reach });
    }
  }

  return { spotify, meta, awareness, artistGenreByKey };
}
