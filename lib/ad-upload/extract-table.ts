/**
 * Turn PDF / image uploads into a tabular ParsedTable.
 * PDF: native table extract (pdf-parse) → AI on text → heuristic lines.
 * Image: OpenAI vision JSON table extract.
 */

import { PDFParse } from "pdf-parse";
import { openAiJsonCompletion, hasOpenAiKey } from "@/lib/ad-upload/ai-client";
import { tableFromAiExtract } from "@/lib/ad-upload/parse-tabular";
import type { ParsedTable } from "@/lib/ad-upload/canonical";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function coerceTableJson(raw: unknown): { headers: string[]; rows: string[][] } {
  if (!isRecord(raw)) {
    throw new Error("AI table extract: expected JSON object");
  }
  const headers = Array.isArray(raw.headers)
    ? raw.headers.map((h) => String(h ?? ""))
    : [];
  const rows = Array.isArray(raw.rows)
    ? raw.rows.map((r) =>
        Array.isArray(r) ? r.map((c) => String(c ?? "")) : [],
      )
    : [];
  if (headers.length === 0) {
    throw new Error("AI table extract: no headers returned");
  }
  return { headers, rows };
}

const EXTRACT_SYSTEM = `You extract advertising / campaign performance tables from documents.
Return JSON only: {"headers": string[], "rows": string[][]}.
Use the first table that looks like campaign results (spend, impressions, reach, clicks, listeners, streams, dates).
Preserve numeric cells as plain strings without currency symbols when possible.
If multiple tables, pick the main results table.`;

function pickLargestTable(
  matrices: string[][][],
): { headers: string[]; rows: string[][] } | null {
  let best: string[][] | null = null;
  for (const matrix of matrices) {
    if (!matrix || matrix.length < 2) continue;
    if (!best || matrix.length * (matrix[0]?.length ?? 0) > best.length * (best[0]?.length ?? 0)) {
      best = matrix;
    }
  }
  if (!best || best.length < 2) return null;
  const headers = best[0]!.map((h) => String(h ?? "").trim());
  const rows = best.slice(1).map((r) => r.map((c) => String(c ?? "").trim()));
  return { headers, rows };
}

export async function extractTableFromPdf(
  buffer: Buffer,
): Promise<ParsedTable> {
  const parser = new PDFParse({ data: buffer });
  try {
    // 1) Native vector table detection when available.
    try {
      const tables = await parser.getTable();
      const matrices: string[][][] = [
        ...(tables.mergedTables ?? []),
        ...((tables.pages ?? []).flatMap((page) => page.tables ?? []) as string[][][]),
      ];
      const picked = pickLargestTable(matrices);
      if (picked && picked.headers.length >= 2) {
        return tableFromAiExtract(
          picked.headers,
          picked.rows,
          "pdf",
          ["Extracted table structure from PDF."],
        );
      }
    } catch {
      // fall through to text path
    }

    const textResult = await parser.getText();
    const text = (textResult.text ?? "").trim();

    if (text.length >= 80 && hasOpenAiKey()) {
      const raw = await openAiJsonCompletion({
        system: EXTRACT_SYSTEM,
        user: [
          {
            type: "text",
            text: `Extract the campaign results table from this PDF text:\n\n${text.slice(0, 60_000)}`,
          },
        ],
      });
      const table = coerceTableJson(raw);
      return tableFromAiExtract(table.headers, table.rows, "pdf");
    }

    if (text.length >= 80) {
      const lines = text
        .split(/\r?\n/)
        .map((l: string) => l.trim())
        .filter(Boolean);
      const split = lines.map((l: string) =>
        l.includes("\t") ? l.split("\t") : l.split(/\s{2,}/),
      );
      const wide = split.filter((r: string[]) => r.length >= 3);
      if (wide.length >= 2) {
        return tableFromAiExtract(wide[0]!, wide.slice(1), "pdf", [
          "Parsed PDF text without AI — verify column headers carefully.",
        ]);
      }
    }

    if (!hasOpenAiKey()) {
      throw new Error(
        "PDF needs OPENAI_API_KEY for table extraction (or upload CSV/XLSX).",
      );
    }

    throw new Error(
      "Could not read a table from this PDF. Export CSV/XLSX or upload a screenshot image of the table.",
    );
  } finally {
    await parser.destroy().catch(() => undefined);
  }
}

export async function extractTableFromImage(
  buffer: Buffer,
  mimeType: string,
): Promise<ParsedTable> {
  if (!hasOpenAiKey()) {
    throw new Error(
      "Image table extraction requires OPENAI_API_KEY (or upload CSV/XLSX).",
    );
  }
  const mime =
    mimeType && mimeType.startsWith("image/") ? mimeType : "image/png";
  const dataUrl = `data:${mime};base64,${buffer.toString("base64")}`;
  const raw = await openAiJsonCompletion({
    system: EXTRACT_SYSTEM,
    user: [
      {
        type: "text",
        text: "Extract the campaign results table from this screenshot.",
      },
      { type: "image_url", image_url: { url: dataUrl } },
    ],
    model: process.env.OPENAI_VISION_MODEL ?? "gpt-4o",
  });
  const table = coerceTableJson(raw);
  return tableFromAiExtract(table.headers, table.rows, "image");
}
