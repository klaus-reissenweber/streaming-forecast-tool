/**
 * Verify release_type / spotify_format columns exist on `releases`.
 * Run: npx tsx scripts/verify-release-columns.ts
 * (requires NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY)
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function missingColumnMessage(): void {
  console.log("MISSING: release_type and/or spotify_format columns.");
  console.log(
    "Run supabase/migrations/202506220001_add_release_type_spotify_format.sql in the Supabase SQL Editor.",
  );
}

function isMissingColumnError(error: { message?: string; code?: string }): boolean {
  const message = error.message?.toLowerCase() ?? "";
  return (
    error.code === "42703" ||
    message.includes("release_type") ||
    message.includes("spotify_format") ||
    message.includes("column") && message.includes("does not exist")
  );
}

async function main(): Promise<number> {
  if (!url || !key) {
    console.error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    );
    console.error("Set them in .env.local or export before running this script.");
    return 1;
  }

  const supabase = createClient(url, key);

  const { data, error } = await supabase
    .from("releases")
    .select("id, release_type, spotify_format")
    .limit(1);

  if (error) {
    if (isMissingColumnError(error)) {
      missingColumnMessage();
      return 1;
    }
    console.error("Query failed:", error.message);
    return 1;
  }

  console.log("OK: release_type and spotify_format columns exist.");
  if (data?.[0]) {
    console.log("Sample row:", data[0]);
  } else {
    console.log("(No release rows yet — column check passed.)");
  }
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((err: unknown) => {
    console.error("Unexpected error:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
