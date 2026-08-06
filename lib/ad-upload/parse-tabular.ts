/**
 * Parse CSV / XLSX into a header + string-cell table.
 */

import * as XLSX from "xlsx";
import type { ParsedTable } from "@/lib/ad-upload/canonical";

function parseCsvText(text: string): { headers: string[]; rows: string[][] } {
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
    if (ch === ",") {
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
  const headers = lines[0]!.map((h) => h.trim());
  const rows = lines.slice(1).map((cells) => {
    const out = headers.map((_, i) => (cells[i] ?? "").trim());
    return out;
  });
  return { headers, rows };
}

export function parseCsvBuffer(buffer: Buffer | ArrayBuffer): ParsedTable {
  const text = Buffer.isBuffer(buffer)
    ? buffer.toString("utf8")
    : new TextDecoder("utf-8").decode(buffer);
  const { headers, rows } = parseCsvText(text);
  return {
    headers,
    rows: rows.filter((r) => r.some((c) => c !== "")),
    sourceKind: "csv",
    warnings: headers.length === 0 ? ["No header row found in CSV."] : [],
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
