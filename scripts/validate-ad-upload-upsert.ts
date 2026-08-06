/**
 * Confirm upload upsert conflict targets + Marquee/Showcase pair persistence.
 *
 *   npx tsx --env-file=.env.local --env-file=retrain/.env.local \
 *     scripts/validate-ad-upload-upsert.ts
 *
 * 1) Unit: same campaign_name → same campaign_uid across formats
 * 2) Live: upsert Marquee + Showcase partner rows; both persist; cleanup
 */

import { emptyCanonicalRow } from "@/lib/ad-upload/canonical";
import {
  spotifyCampaignUid,
  toSpotifyRow,
  upsertCanonicalRows,
} from "@/lib/ad-upload/upsert";
import { createServiceClient } from "@/lib/supabase/service";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

function unitChecks(): void {
  const base = {
    release_key: "upsert-probe-track",
    campaign_name: "Partner Probe Campaign",
    start_date: "2026-01-01",
    end_date: "2026-01-14",
  };
  const uidM = spotifyCampaignUid(base);
  const uidS = spotifyCampaignUid(base);
  assert(uidM === uidS, "campaign_uid must be format-agnostic");

  const marquee = emptyCanonicalRow(0);
  Object.assign(marquee, {
    ...base,
    artist: "Upsert Probe Artist",
    format: "marquee" as const,
    spend: 250,
    converted_listeners: 500,
    attributed_streams: 1250,
    usable_for_modeling: true,
  });
  const showcase = emptyCanonicalRow(1);
  Object.assign(showcase, {
    ...base,
    artist: "Upsert Probe Artist",
    format: "showcase" as const,
    spend: 400,
    converted_listeners: 800,
    attributed_streams: 1600,
    usable_for_modeling: true,
  });

  const mRow = toSpotifyRow(marquee, "Validate Partner");
  const sRow = toSpotifyRow(showcase, "Validate Partner");
  assert(!mRow.error && !sRow.error, "mapped rows");
  assert(
    mRow.row!.campaign_uid === sRow.row!.campaign_uid,
    "mapped rows share campaign_uid",
  );
  assert(
    mRow.row!.format === "marquee" && sRow.row!.format === "showcase",
    "formats",
  );
  console.log("PASS: unit campaign_uid shared across Marquee/Showcase");
}

async function liveUpsertTest(): Promise<void> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL && !process.env.SUPABASE_URL) {
    console.log("SKIP live: no Supabase URL");
    return;
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.log("SKIP live: no service role key");
    return;
  }
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_URL) {
    process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.SUPABASE_URL;
  }

  const releaseKey = "__upload_upsert_probe__";
  const campaignName = "Partner Probe Campaign";
  const partner = "Validate Partner";

  const marquee = emptyCanonicalRow(0);
  Object.assign(marquee, {
    artist: "Upsert Probe Artist",
    release_key: releaseKey,
    campaign_name: campaignName,
    format: "marquee" as const,
    spend: 250,
    converted_listeners: 500,
    attributed_streams: 1250,
    start_date: "2026-01-01",
    end_date: "2026-01-14",
    usable_for_modeling: true,
  });
  const showcase = emptyCanonicalRow(1);
  Object.assign(showcase, {
    artist: "Upsert Probe Artist",
    release_key: releaseKey,
    campaign_name: campaignName,
    format: "showcase" as const,
    spend: 400,
    converted_listeners: 800,
    attributed_streams: 1600,
    start_date: "2026-01-01",
    end_date: "2026-01-14",
    usable_for_modeling: true,
  });

  const uid = spotifyCampaignUid({
    release_key: releaseKey,
    campaign_name: campaignName,
    start_date: "2026-01-01",
    end_date: "2026-01-14",
  });

  const sb = createServiceClient();
  // Cleanup any prior probe rows first.
  await sb.from("ad_spotify_campaigns").delete().eq("campaign_uid", uid);

  const result = await upsertCanonicalRows({
    rows: [marquee, showcase],
    platform: "spotify",
    sourcePartner: partner,
  });

  if (result.errors.length > 0) {
    // Common when unique is still campaign_uid-only (pre-migration 004).
    console.error("Upsert errors:", result.errors);
    throw new Error(
      `Live upsert failed: ${result.errors.join("; ")}. ` +
        "If 'no unique constraint matching ON CONFLICT', apply " +
        "migration 202608050004 (unique campaign_uid, format).",
    );
  }

  assert(result.spotifyUpserted >= 2, `expected ≥2 upserts, got ${result.spotifyUpserted}`);

  const { data, error } = await sb
    .from("ad_spotify_campaigns")
    .select("campaign_uid, format, spend_usd")
    .eq("campaign_uid", uid)
    .order("format");
  if (error) throw new Error(error.message);

  const formats = (data ?? []).map((r) => r.format).sort();
  assert(
    formats.length === 2 &&
      formats[0] === "marquee" &&
      formats[1] === "showcase",
    `expected both formats, got ${JSON.stringify(data)}`,
  );
  assert(
    (data ?? []).every((r) => r.campaign_uid === uid),
    "both rows share campaign_uid",
  );

  // Cleanup probe rows.
  await sb.from("ad_spotify_campaigns").delete().eq("campaign_uid", uid);

  console.log(
    `PASS: live upsert — Marquee + Showcase persisted under campaign_uid=${uid.slice(0, 8)}…`,
  );
}

async function main(): Promise<void> {
  unitChecks();
  await liveUpsertTest();
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
