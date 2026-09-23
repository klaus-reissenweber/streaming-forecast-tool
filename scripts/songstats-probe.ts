/**
 * Probe Songstats Enterprise API for a track/release identifier.
 *
 *   npx tsx scripts/songstats-probe.ts GBUM72501895
 *
 * Reads SONGSTATS_API_KEY from the environment or .env.local.
 * Writes raw JSON under analysis/songstats-probe/<id>/ (gitignored).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BASE = "https://api.songstats.com/enterprise/v1";

function loadEnvLocal(): void {
  const envPath = join(process.cwd(), ".env.local");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq);
    const value = trimmed.slice(eq + 1);
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function identifierFromArgv(): string {
  const raw = process.argv.slice(2).join(" ").trim();
  if (!raw) {
    throw new Error("Usage: npx tsx scripts/songstats-probe.ts <identifier>");
  }
  return raw.replace(/^<|>$/g, "");
}

type ProbeCall = {
  name: string;
  path: string;
  query: Record<string, string>;
};

type ProbeResult = {
  name: string;
  url: string;
  status: number;
  ok: boolean;
  body: unknown;
};

async function getJson(
  apiKey: string,
  path: string,
  query: Record<string, string>,
): Promise<{ url: string; status: number; ok: boolean; body: unknown }> {
  const url = new URL(path, `${BASE}/`);
  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, value);
  }
  const res = await fetch(url, {
    headers: { apikey: apiKey, accept: "application/json" },
  });
  const text = await res.text();
  let body: unknown = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text };
  }
  return { url: url.toString(), status: res.status, ok: res.ok, body };
}

function slug(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]+/g, "_");
}

function firstTrackId(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const record = body as Record<string, unknown>;
  const info = record.track_info;
  if (info && typeof info === "object") {
    const id = (info as Record<string, unknown>).songstats_track_id;
    if (typeof id === "string" && id) return id;
  }
  const results = record.tracks ?? record.results ?? record.data;
  if (Array.isArray(results) && results[0] && typeof results[0] === "object") {
    const id = (results[0] as Record<string, unknown>).songstats_track_id;
    if (typeof id === "string" && id) return id;
  }
  return null;
}

async function main(): Promise<number> {
  loadEnvLocal();
  const apiKey = process.env.SONGSTATS_API_KEY?.trim();
  if (!apiKey) {
    console.error("SONGSTATS_API_KEY is not set in the environment or .env.local.");
    return 1;
  }

  const id = identifierFromArgv();
  const outDir = join(process.cwd(), "analysis", "songstats-probe", slug(id));
  mkdirSync(outDir, { recursive: true });

  const calls: ProbeCall[] = [
    { name: "status", path: "status", query: {} },
    { name: "tracks-info-isrc", path: "tracks/info", query: { isrc: id } },
    { name: "tracks-info-upc", path: "tracks/info", query: { upc: id } },
    { name: "tracks-search", path: "tracks/search", query: { q: id } },
  ];

  const results: ProbeResult[] = [];
  for (const call of calls) {
    const res = await getJson(apiKey, call.path, call.query);
    const result = { name: call.name, ...res };
    results.push(result);
    writeFileSync(join(outDir, `${call.name}.json`), JSON.stringify(result, null, 2));
    console.log(`${call.name}: HTTP ${res.status} ${res.ok ? "ok" : "fail"}`);
  }

  const resolvedId = results
    .map((result) => firstTrackId(result.body))
    .find((value): value is string => Boolean(value));

  if (resolvedId) {
    const followUps: ProbeCall[] = [
      {
        name: "tracks-info-resolved",
        path: "tracks/info",
        query: { songstats_track_id: resolvedId },
      },
      {
        name: "tracks-stats-resolved",
        path: "tracks/stats",
        query: { songstats_track_id: resolvedId },
      },
    ];
    for (const call of followUps) {
      const res = await getJson(apiKey, call.path, call.query);
      const result = { name: call.name, ...res };
      results.push(result);
      writeFileSync(join(outDir, `${call.name}.json`), JSON.stringify(result, null, 2));
      console.log(`${call.name}: HTTP ${res.status} ${res.ok ? "ok" : "fail"}`);
    }
    console.log(`resolved songstats_track_id=${resolvedId}`);
  } else {
    console.log("no songstats_track_id resolved from probe calls");
  }

  writeFileSync(join(outDir, "summary.json"), JSON.stringify({ id, results }, null, 2));
  console.log(`wrote ${outDir}`);
  return results.some((result) => result.ok) ? 0 : 1;
}

main()
  .then((code) => process.exit(code))
  .catch((err: unknown) => {
    console.error("Unexpected error:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
