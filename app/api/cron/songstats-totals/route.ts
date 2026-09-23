import { NextResponse } from "next/server";
import { addUtcDays } from "@/lib/songstats/derive-daily-grid";
import { ingestReleaseTotals } from "@/lib/songstats/ingest";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

const GAP_MS = 1000;

function authorize(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const bearer = request.headers.get("authorization");
  const header = request.headers.get("x-cron-secret");
  return bearer === `Bearer ${secret}` || header === secret;
}

function utcToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function GET(request: Request) {
  if (!authorize(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const today = utcToday();
  const from = addUtcDays(today, -30);
  const to = addUtcDays(today, 2);
  const sb = createServiceClient();
  const { data, error } = await sb
    .from("releases")
    .select("id, isrc, release_date")
    .eq("status", "active")
    .not("isrc", "is", null)
    .gte("release_date", from)
    .lte("release_date", to);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const releases = (data ?? []).filter(
    (row) => typeof row.isrc === "string" && row.isrc.trim() !== "",
  );

  const results: Array<{
    releaseId: string;
    isrc: string;
    ok: boolean;
    error?: string;
  }> = [];

  for (let i = 0; i < releases.length; i++) {
    const row = releases[i]!;
    const isrc = String(row.isrc).trim();
    try {
      await ingestReleaseTotals({
        releaseId: row.id,
        isrc,
        releaseDate: row.release_date,
        trigger: "cron",
      });
      results.push({ releaseId: row.id, isrc, ok: true });
      console.log(`songstats-totals ok release=${row.id} isrc=${isrc}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      results.push({ releaseId: row.id, isrc, ok: false, error: message });
      console.error(
        `songstats-totals fail release=${row.id} isrc=${isrc}: ${message}`,
      );
    }
    if (i < releases.length - 1) {
      await sleep(GAP_MS);
    }
  }

  return NextResponse.json({
    window: { from, to },
    attempted: results.length,
    ok: results.filter((row) => row.ok).length,
    failed: results.filter((row) => !row.ok).length,
    results,
  });
}
