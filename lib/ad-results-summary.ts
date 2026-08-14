import { formatUsd } from "@/lib/format";

export type AdResultsSummary = {
  spotifyCount: number;
  metaCount: number;
  totalSpend: number;
};

export function emptyAdResultsSummary(): AdResultsSummary {
  return { spotifyCount: 0, metaCount: 0, totalSpend: 0 };
}

export function hasAdResults(summary: AdResultsSummary): boolean {
  return summary.spotifyCount > 0 || summary.metaCount > 0;
}

export function summarizeAdCampaigns(
  campaigns: Array<{ platform?: "spotify" | "meta"; spendUsd?: number }>,
): AdResultsSummary {
  const summary = emptyAdResultsSummary();
  for (const campaign of campaigns) {
    if (campaign.platform === "meta") {
      summary.metaCount += 1;
    } else if (campaign.platform === "spotify") {
      summary.spotifyCount += 1;
    }
    if (campaign.spendUsd != null && Number.isFinite(campaign.spendUsd)) {
      summary.totalSpend += campaign.spendUsd;
    }
  }
  return summary;
}

function campaignCountLabel(
  count: number,
  platform: "Meta" | "Spotify",
): string {
  const noun = count === 1 ? "campaign" : "campaigns";
  return `${count} ${platform} ${noun}`;
}

export function formatAdResultsSummary(summary: AdResultsSummary): string {
  const parts: string[] = [];
  if (summary.metaCount > 0) {
    parts.push(campaignCountLabel(summary.metaCount, "Meta"));
  }
  if (summary.spotifyCount > 0) {
    parts.push(campaignCountLabel(summary.spotifyCount, "Spotify"));
  }
  if (parts.length === 0) {
    return "No ad results yet";
  }
  return `${parts.join(", ")} · ${formatUsd(summary.totalSpend, 0)} total spend`;
}

/** Compact row indicator: "2 Meta · 1 Spotify · $3,240" */
export function formatAdResultsSummaryCompact(summary: AdResultsSummary): string {
  const parts: string[] = [];
  if (summary.metaCount > 0) {
    parts.push(`${summary.metaCount} Meta`);
  }
  if (summary.spotifyCount > 0) {
    parts.push(`${summary.spotifyCount} Spotify`);
  }
  if (parts.length === 0) {
    return "No results yet";
  }
  parts.push(formatUsd(summary.totalSpend, 0));
  return parts.join(" · ");
}
