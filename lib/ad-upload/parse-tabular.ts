/**
 * Parse CSV / XLSX into a header + string-cell table.
 * Meta Ads Manager exports are often UTF-16 LE/BE and/or tab-delimited.
 */

import * as XLSX from "xlsx";
import type { ParsedTable } from "@/lib/ad-upload/canonical";

function decodeCsvBuffer(buffer: Buffer): { text: string; encoding: string } {
  if (buffer.length >= 2) {
    // UTF-16 LE BOM
    if (buffer[0] === 0xff && buffer[1] === 0xfe) {
      return {
        text: buffer.subarray(2).toString("utf16le"),
        encoding: "utf-16le",
      };
    }
    // UTF-16 BE BOM
    if (buffer[0] === 0xfe && buffer[1] === 0xff) {
      const swapped = Buffer.alloc(buffer.length - 2);
      for (let i = 2; i + 1 < buffer.length; i += 2) {
        swapped[i - 2] = buffer[i + 1]!;
        swapped[i - 1] = buffer[i]!;
      }
      if ((buffer.length - 2) % 2 === 1) {
        swapped[swapped.length - 1] = 0;
      }
      return { text: swapped.toString("utf16le"), encoding: "utf-16be" };
    }
  }
  // UTF-8 BOM
  if (
    buffer.length >= 3 &&
    buffer[0] === 0xef &&
    buffer[1] === 0xbb &&
    buffer[2] === 0xbf
  ) {
    return { text: buffer.subarray(3).toString("utf8"), encoding: "utf-8" };
  }

  // Heuristic: lots of NUL bytes → likely UTF-16 LE without BOM
  const sample = buffer.subarray(0, Math.min(buffer.length, 64));
  let nulCount = 0;
  for (const b of sample) if (b === 0) nulCount += 1;
  if (sample.length >= 8 && nulCount >= sample.length / 4) {
    // Prefer LE (common on Windows Meta exports)
    return { text: buffer.toString("utf16le"), encoding: "utf-16le-heuristic" };
  }

  return { text: buffer.toString("utf8"), encoding: "utf-8" };
}

function detectDelimiter(text: string): "," | "\t" | ";" {
  const firstLine =
    text.split(/\r?\n/).find((l) => l.trim().length > 0) ?? "";
  const tabs = (firstLine.match(/\t/g) ?? []).length;
  const commas = (firstLine.match(/,/g) ?? []).length;
  const semis = (firstLine.match(/;/g) ?? []).length;
  if (tabs > commas && tabs >= semis) return "\t";
  if (semis > commas && semis > tabs) return ";";
  return ",";
}

function parseDelimitedText(
  text: string,
  delimiter: string,
): { headers: string[]; rows: string[][] } {
  const lines: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    const next = text[i + 1];
    if (inQuotes) {
      if (ch === '"' && next === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === delimiter) {
      row.push(field);
      field = "";
      continue;
    }
    if (ch === "\n" || (ch === "\r" && next === "\n")) {
      if (ch === "\r") i++;
      row.push(field);
      field = "";
      if (row.length > 1 || (row[0] ?? "") !== "") lines.push(row);
      row = [];
      continue;
    }
    if (ch === "\r") {
      row.push(field);
      field = "";
      if (row.length > 1 || (row[0] ?? "") !== "") lines.push(row);
      row = [];
      continue;
    }
    field += ch;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    lines.push(row);
  }

  if (lines.length === 0) {
    return { headers: [], rows: [] };
  }
  const headers = lines[0]!.map((h) => h.replace(/^\uFEFF/, "").trim());
  const rows = lines.slice(1).map((cells) => {
    const out = headers.map((_, i) => (cells[i] ?? "").trim());
    return out;
  });
  return { headers, rows };
}

function looksBinaryGarbage(headers: string[]): boolean {
  if (headers.length === 0) return false;
  const joined = headers.join("");
  const nul = (joined.match(/\u0000/g) ?? []).length;
  return nul >= 2 || /[\u0000-\u0008]/.test(joined);
}

export function parseCsvBuffer(buffer: Buffer | ArrayBuffer): ParsedTable {
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  const { text, encoding } = decodeCsvBuffer(buf);
  const delimiter = detectDelimiter(text);
  const { headers, rows } = parseDelimitedText(text, delimiter);
  const warnings: string[] = [];

  if (headers.length === 0) {
    warnings.push("No header row found in CSV.");
  }
  if (encoding.startsWith("utf-16")) {
    warnings.push(`Decoded as ${encoding}.`);
  }
  if (delimiter === "\t") {
    warnings.push("Detected tab-delimited export.");
  }
  if (looksBinaryGarbage(headers)) {
    throw new Error(
      "CSV looks binary or mis-encoded (null bytes in headers). Re-export as UTF-8 CSV or UTF-16 with BOM.",
    );
  }

  return {
    headers,
    rows: rows.filter((r) => r.some((c) => c !== "")),
    sourceKind: "csv",
    warnings,
  };
}

export function parseXlsxBuffer(buffer: Buffer | ArrayBuffer): ParsedTable {
  const data = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  const workbook = XLSX.read(data, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    return {
      headers: [],
      rows: [],
      sourceKind: "xlsx",
      warnings: ["Workbook has no sheets."],
    };
  }
  const sheet = workbook.Sheets[sheetName]!;
  const matrix = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, {
    header: 1,
    defval: "",
    raw: false,
  });
  if (matrix.length === 0) {
    return {
      headers: [],
      rows: [],
      sourceKind: "xlsx",
      warnings: ["Sheet is empty."],
    };
  }
  const headers = (matrix[0] ?? []).map((h) => String(h ?? "").trim());
  const rows = matrix
    .slice(1)
    .map((cells) => headers.map((_, i) => String(cells[i] ?? "").trim()))
    .filter((r) => r.some((c) => c !== ""));
  return {
    headers,
    rows,
    sourceKind: "xlsx",
    warnings: headers.length === 0 ? ["No header row found in sheet."] : [],
  };
}

/** Build a table from AI-extracted {headers, rows}. */
export function tableFromAiExtract(
  headers: string[],
  rows: string[][],
  sourceKind: "pdf" | "image",
  warnings: string[] = [],
): ParsedTable {
  const cleanHeaders = headers.map((h) => String(h ?? "").trim());
  const cleanRows = rows
    .map((r) => cleanHeaders.map((_, i) => String(r[i] ?? "").trim()))
    .filter((r) => r.some((c) => c !== ""));
  return { headers: cleanHeaders, rows: cleanRows, sourceKind, warnings };
}
