/**
 * User-facing campaign labels. Never render a campaign_uid.
 * Same fallbacks as the public report per-campaign table.
 */

export function looksLikeCampaignUid(value: string): boolean {
  const v = value.trim();
  if (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      v,
    )
  ) {
    return true;
  }
  return !/\s/.test(v) && v.length >= 12 && /[0-9]/.test(v);
}

/** True when the whole string, or a `·`-separated token, is a uid. */
export function campaignNameContainsUid(value: string): boolean {
  if (looksLikeCampaignUid(value)) return true;
  return value.split("·").some((part) => {
    const token = part.trim();
    return token.length > 0 && looksLikeCampaignUid(token);
  });
}

export function readableCampaignName(input: {
  campaignName?: string | null;
  campaignUid?: string | null;
  platform: "spotify" | "meta";
  format?: string | null;
  objective?: string | null;
}): string {
  const named = input.campaignName?.trim() || "";
  if (named && !campaignNameContainsUid(named)) {
    return named;
  }
  const format = input.format?.trim().toLowerCase() ?? "";
  if (format === "marquee") return "Marquee";
  if (format === "showcase") return "Showcase";
  const objective = input.objective?.trim().toLowerCase() ?? "";
  if (objective === "awareness" || objective === "reach") {
    return "Meta awareness";
  }
  if (objective === "traffic") return "Meta traffic";
  if (input.platform === "spotify") return "Spotify";
  return "Meta";
}
