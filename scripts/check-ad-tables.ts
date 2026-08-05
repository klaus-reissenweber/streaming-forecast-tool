/**
 * Sanity-check ad campaign tables + new release columns.
 *   npx tsx --env-file=.env.local --env-file=retrain/.env.local \
 *     scripts/check-ad-tables.ts
 */
import { createServiceClient } from "@/lib/supabase/service";

async function main(): Promise<number> {
  const sb = createServiceClient();
  let failed = false;

  for (const table of ["ad_spotify_campaigns", "ad_meta_campaigns"] as const) {
    const { error, count } = await sb
      .from(table)
      .select("id", { count: "exact", head: true });
    if (error) {
      console.log(`${table}: ERR ${error.message}`);
      failed = true;
    } else {
      console.log(`${table}: ok count=${count ?? 0}`);
    }
  }

  const { error } = await sb
    .from("releases")
    .select(
      "spotify_marquee_spend_planned,spotify_showcase_spend_planned,campaign_start_offset_days,campaign_duration_days",
    )
    .limit(1);
  if (error) {
    console.log(`releases ad inputs: ERR ${error.message}`);
    failed = true;
  } else {
    console.log("releases ad inputs: ok");
  }

  return failed ? 1 : 0;
}

main()
  .then((code) => process.exit(code))
  .catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
