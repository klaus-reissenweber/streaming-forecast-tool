/** Identity of a campaign row after upsert — safe for client + server. */
export type UpsertedCampaignRef = {
  campaignUid: string;
  platform: "spotify" | "meta";
  campaignName: string;
  format: string | null;
  objective: string | null;
};
