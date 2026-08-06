/**
 * Propose source-column → canonical field mappings (+ file constants).
 * Uses saved partner profile when headers match; else AI; else heuristics.
 */

import {
  CANONICAL_FIELDS,
  type AdUploadColumnMappings,
  type AdUploadFileConstants,
  type AdUploadPlatform,
  type CanonicalField,
} from "@/lib/ad-upload/canonical";
import { normalizeToCanonicalField } from "@/lib/ad-upload/column-map";
import { openAiJsonCompletion, hasOpenAiKey } from "@/lib/ad-upload/ai-client";
import type { AdUploadSourceProfile } from "@/lib/ad-upload/source-profiles";

const CANONICAL_FIELDS_SET = new Set<string>(CANONICAL_FIELDS);

function coerceCanonicalField(raw: unknown): CanonicalField | null {
  if (raw == null || raw === "null") return null;
  if (typeof raw !== "string") return null;
  if (CANONICAL_FIELDS_SET.has(raw)) return raw as CanonicalField;
  return normalizeToCanonicalField(raw);
}

const HEADER_ALIASES: Array<{ field: CanonicalField; patterns: RegExp[] }> = [
  {
    field: "spend",
    patterns: [/spend/, /amount\s*spent/, /cost/, /budget/, /\$/, /usd/],
  },
  {
    field: "impressions",
    patterns: [/impressions?/, /\bimps?\b/, /views?/],
  },
  { field: "reach", patterns: [/\breach\b/, /unique/] },
  {
    field: "clicks",
    patterns: [/link\s*clicks?/, /\bclicks?\b/, /ctr(?!\s*%)/],
  },
  {
    field: "converted_listeners",
    patterns: [
      /converted\s*listeners?/,
      /listeners?/,
      /conversions?/,
      /results?/,
    ],
  },
  {
    field: "attributed_streams",
    patterns: [
      /est[_\s-]*attributed[_\s-]*streams?/,
      /attributed\s*streams?/,
      /est\.?\s*streams?/,
      /\bplays?\b/,
      /\bstreams?\b/,
      /active\s*streams/,
    ],
  },
  {
    field: "format",
    patterns: [/format/, /marquee/, /showcase/, /platform_format/],
  },
  {
    field: "objective",
    patterns: [/objective/, /optimization/, /campaign\s*objective/],
  },
  {
    field: "campaign_name",
    patterns: [/campaign/, /ad\s*set/, /name/, /release\s*\/?\s*link/],
  },
  {
    field: "start_date",
    patterns: [/start/, /reporting\s*starts/, /begin/],
  },
  {
    field: "end_date",
    patterns: [/end/, /reporting\s*ends/, /finish/],
  },
  { field: "artist", patterns: [/artist/, /act/] },
  {
    field: "release_key",
    patterns: [/release[_\s-]?key/, /track/, /release(?!\s*date)/],
  },
];

function normHeader(h: string): string {
  return h
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function heuristicColumnMappings(
  headers: string[],
): AdUploadColumnMappings {
  const used = new Set<CanonicalField>();
  const out: AdUploadColumnMappings = {};
  for (const header of headers) {
    const n = normHeader(header);
    let matched: CanonicalField | null = null;
    for (const alias of HEADER_ALIASES) {
      if (used.has(alias.field)) continue;
      if (alias.patterns.some((re) => re.test(n))) {
        matched = alias.field;
        break;
      }
    }
    if (matched) used.add(matched);
    out[header] = matched;
  }
  return out;
}

function guessPlatform(
  headers: string[],
  sampleRows: string[][],
): AdUploadPlatform {
  const blob = [...headers, ...sampleRows.flat()].join(" ").toLowerCase();
  if (
    /marquee|showcase|converted\s*listener|spotify\s*ad/.test(blob)
  ) {
    return "spotify";
  }
  if (
    /link\s*click|meta|facebook|instagram|cpm|awareness|traffic|impressions/.test(
      blob,
    )
  ) {
    return "meta";
  }
  return "unknown";
}

function headersMatchProfile(
  headers: string[],
  profile: AdUploadSourceProfile,
): boolean {
  if (profile.headerSignature.length === 0) return false;
  const a = headers.map(normHeader).filter(Boolean).sort().join("|");
  const b = profile.headerSignature.map(normHeader).filter(Boolean).sort().join("|");
  return a === b;
}

export type MappingProposal = {
  columnMappings: AdUploadColumnMappings;
  fileConstants: AdUploadFileConstants;
  source: "profile" | "ai" | "heuristic";
  profileId: string | null;
  notes: string[];
};

export async function proposeMapping(options: {
  headers: string[];
  sampleRows: string[][];
  partnerLabel: string;
  defaultArtist: string;
  defaultReleaseKey: string;
  profile: AdUploadSourceProfile | null;
}): Promise<MappingProposal> {
  const notes: string[] = [];

  if (options.profile && headersMatchProfile(options.headers, options.profile)) {
    notes.push(
      `Applied saved profile for partner “${options.profile.partnerLabel}”.`,
    );
    return {
      columnMappings: { ...options.profile.columnMappings },
      fileConstants: {
        ...options.profile.fileConstants,
        partnerLabel: options.partnerLabel || options.profile.partnerLabel,
        artist:
          options.profile.fileConstants.artist ?? options.defaultArtist,
        releaseKey:
          options.profile.fileConstants.releaseKey ?? options.defaultReleaseKey,
      },
      source: "profile",
      profileId: options.profile.id,
      notes,
    };
  }

  let columnMappings = heuristicColumnMappings(options.headers);
  let platform = guessPlatform(options.headers, options.sampleRows);
  let source: MappingProposal["source"] = "heuristic";

  if (hasOpenAiKey()) {
    try {
      const raw = await openAiJsonCompletion({
        system: `Map advertising export columns to a canonical schema.
Canonical fields ONLY: ${CANONICAL_FIELDS.join(", ")}.
Never emit DB names (est_attributed_streams, spend_usd, link_clicks) — map those to attributed_streams, spend, clicks.
Return JSON: {
  "column_mappings": { "<source header>": "<canonical>|null" },
  "platform": "spotify"|"meta"|"unknown",
  "format": "marquee"|"showcase"|null,
  "objective": "awareness"|"traffic"|"streaming"|null,
  "notes": string[]
}
Use null for columns that are not useful.`,
        user: [
          {
            type: "text",
            text: JSON.stringify({
              headers: options.headers,
              sample_rows: options.sampleRows.slice(0, 5),
              partner: options.partnerLabel,
            }),
          },
        ],
      });
      if (raw && typeof raw === "object") {
        const rec = raw as Record<string, unknown>;
        if (rec.column_mappings && typeof rec.column_mappings === "object") {
          const next: AdUploadColumnMappings = {};
          for (const h of options.headers) {
            const v = (rec.column_mappings as Record<string, unknown>)[h];
            const coerced = coerceCanonicalField(v);
            next[h] = coerced ?? columnMappings[h] ?? null;
          }
          columnMappings = next;
        }
        if (rec.platform === "spotify" || rec.platform === "meta") {
          platform = rec.platform;
        }
        source = "ai";
        if (Array.isArray(rec.notes)) {
          notes.push(...rec.notes.map(String));
        }
        const format =
          rec.format === "marquee" || rec.format === "showcase"
            ? rec.format
            : null;
        const objective =
          rec.objective === "awareness" ||
          rec.objective === "traffic" ||
          rec.objective === "streaming"
            ? rec.objective
            : null;
        return {
          columnMappings,
          fileConstants: {
            partnerLabel: options.partnerLabel,
            platform,
            format,
            objective,
            artist: options.defaultArtist,
            releaseKey: options.defaultReleaseKey,
          },
          source,
          profileId: null,
          notes,
        };
      }
    } catch (err) {
      notes.push(
        `AI mapping failed (${err instanceof Error ? err.message : String(err)}); used heuristics.`,
      );
    }
  } else {
    notes.push("No OPENAI_API_KEY — used heuristic column mapping.");
  }

  return {
    columnMappings,
    fileConstants: {
      partnerLabel: options.partnerLabel,
      platform,
      format: null,
      objective: platform === "meta" ? "traffic" : null,
      artist: options.defaultArtist,
      releaseKey: options.defaultReleaseKey,
    },
    source,
    profileId: null,
    notes,
  };
}
