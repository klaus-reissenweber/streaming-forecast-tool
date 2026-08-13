/**
 * Manual creative image upload → Supabase Storage + ad_campaign_creatives.
 * Object keys are unguessable (same idea as report slugs); bucket is not listable.
 */

import { randomBytes } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/service";

export const AD_CREATIVES_BUCKET = "ad-creatives";

const ALLOWED_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

export type AdCreativeRecord = {
  id: string;
  releaseKey: string;
  campaignUid: string;
  platform: "spotify" | "meta";
  objectKey: string;
  caption: string | null;
  contentType: string;
  sortOrder: number;
  /** Public URL for a known object_key (unguessable; not directory-listable). */
  url: string;
};

export function creativePublicUrl(objectKey: string): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  if (!base) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
  }
  return `${base}/storage/v1/object/public/${AD_CREATIVES_BUCKET}/${objectKey}`;
}

function extensionForMime(mime: string): string | null {
  return ALLOWED_MIME[mime] ?? null;
}

export async function listCreativesForReleaseKey(
  releaseKey: string,
): Promise<AdCreativeRecord[]> {
  const sb = createServiceClient();
  const { data, error } = await sb
    .from("ad_campaign_creatives")
    .select(
      "id, release_key, campaign_uid, platform, object_key, caption, content_type, sort_order",
    )
    .eq("release_key", releaseKey)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    // Pre-migration: table may not exist yet.
    if (
      error.message.includes("ad_campaign_creatives") ||
      error.code === "42P01"
    ) {
      return [];
    }
    throw new Error(`ad_campaign_creatives: ${error.message}`);
  }

  return (data ?? []).map((row) => ({
    id: String(row.id),
    releaseKey: String(row.release_key),
    campaignUid: String(row.campaign_uid),
    platform: row.platform === "spotify" ? "spotify" : "meta",
    objectKey: String(row.object_key),
    caption: row.caption == null ? null : String(row.caption),
    contentType: String(row.content_type),
    sortOrder: Number(row.sort_order) || 0,
    url: creativePublicUrl(String(row.object_key)),
  }));
}

export async function uploadCampaignCreative(options: {
  releaseKey: string;
  campaignUid: string;
  platform: "spotify" | "meta";
  fileName: string;
  contentType: string;
  bytes: ArrayBuffer;
  caption?: string | null;
}): Promise<AdCreativeRecord> {
  const ext = extensionForMime(options.contentType);
  if (!ext) {
    throw new Error("Unsupported image type. Use JPEG, PNG, WebP, or GIF.");
  }
  if (!(options.bytes.byteLength > 0)) {
    throw new Error("Empty file.");
  }
  if (options.bytes.byteLength > 5 * 1024 * 1024) {
    throw new Error("Image must be 5MB or smaller.");
  }

  const objectKey = `${randomBytes(16).toString("base64url")}.${ext}`;
  const sb = createServiceClient();

  const { error: uploadError } = await sb.storage
    .from(AD_CREATIVES_BUCKET)
    .upload(objectKey, options.bytes, {
      contentType: options.contentType,
      upsert: false,
      cacheControl: "31536000",
    });
  if (uploadError) {
    throw new Error(`Storage upload failed: ${uploadError.message}`);
  }

  const { data, error } = await sb
    .from("ad_campaign_creatives")
    .insert({
      release_key: options.releaseKey,
      campaign_uid: options.campaignUid,
      platform: options.platform,
      object_key: objectKey,
      caption: options.caption?.trim() || null,
      content_type: options.contentType,
    })
    .select(
      "id, release_key, campaign_uid, platform, object_key, caption, content_type, sort_order",
    )
    .single();

  if (error || !data) {
    // Best-effort cleanup of orphaned object.
    await sb.storage.from(AD_CREATIVES_BUCKET).remove([objectKey]);
    throw new Error(
      `Creative row insert failed: ${error?.message ?? "unknown"}`,
    );
  }

  return {
    id: String(data.id),
    releaseKey: String(data.release_key),
    campaignUid: String(data.campaign_uid),
    platform: data.platform === "spotify" ? "spotify" : "meta",
    objectKey: String(data.object_key),
    caption: data.caption == null ? null : String(data.caption),
    contentType: String(data.content_type),
    sortOrder: Number(data.sort_order) || 0,
    url: creativePublicUrl(String(data.object_key)),
  };
}
