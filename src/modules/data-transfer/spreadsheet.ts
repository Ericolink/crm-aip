import "server-only";
import Papa from "papaparse";
import { readSheet } from "read-excel-file/node";
import writeXlsxFile from "write-excel-file/node";
import { neutralizeFormula, type CellInput, IMPORT_LIMITS } from "./columns";

/**
 * Lectura y escritura de CSV/XLSX. Todo ocurre en memoria: el archivo NUNCA se guarda
 * en disco ni en la base (contiene datos personales).
 */

export type FileFormat = "CSV" | "XLSX";
/** `n` = número de fila en el archivo (1 = encabezados), para reportar errores. */
export type Table = { headers: string[]; rows: { n: number; cells: CellInput[] }[] };

export class SpreadsheetError extends Error {
  constructor(
    public readonly code:
      "unsupported" | "tooLarge" | "empty" | "unreadable" | "tooManyRows" | "tooManyColumns",
  ) {
    super(code);
    this.name = "SpreadsheetError";
  }
}

const XLSX_MAGIC = [0x50, 0x4b, 0x03, 0x04]; // "PK\3\4" (ZIP)

export function detectFormat(fileName: string, bytes: Uint8Array): FileFormat {
  const ext = fileName.toLowerCase().split(".").pop();
  const isZip = XLSX_MAGIC.every((b, i) => bytes[i] === b);
  if (ext === "xlsx" && isZip) return "XLSX";
  if (ext === "csv" && !isZip) return "CSV";
  throw new SpreadsheetError("unsupported");
}

/**
 * Protección básica contra "bombas ZIP": revisa el directorio central del .xlsx y rechaza
 * archivos con demasiadas entradas o un tamaño descomprimido declarado excesivo.
 */
function assertReasonableZip(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65_557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new SpreadsheetError("unreadable");
  const entries = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);
  if (entries > 500) throw new SpreadsheetError("unreadable");
  let total = 0;
  for (let n = 0; n < entries; n++) {
    if (offset + 46 > bytes.length || view.getUint32(offset, true) !== 0x02014b50) {
      throw new SpreadsheetError("unreadable");
    }
    total += view.getUint32(offset + 24, true);
    offset +=
      46 +
      view.getUint16(offset + 28, true) +
      view.getUint16(offset + 30, true) +
      view.getUint16(offset + 32, true);
  }
  if (total > 50 * 1024 * 1024) throw new SpreadsheetError("tooLarge");
}

const isBlankRow = (row: CellInput[]) =>
  row.every((c) => c === null || c === undefined || String(c).trim() === "");

export async function readTable(fileName: string, bytes: Uint8Array): Promise<Table> {
  if (bytes.byteLength === 0) throw new SpreadsheetError("empty");
  if (bytes.byteLength > IMPORT_LIMITS.maxBytes) throw new SpreadsheetError("tooLarge");
  const format = detectFormat(fileName, bytes);

  let matrix: CellInput[][];
  if (format === "CSV") {
    const text = new TextDecoder("utf-8").decode(bytes).replace(/^﻿/, "");
    const parsed = Papa.parse<string[]>(text, { skipEmptyLines: "greedy" });
    if (parsed.errors.some((e) => e.type === "Quotes")) throw new SpreadsheetError("unreadable");
    matrix = parsed.data;
  } else {
    assertReasonableZip(bytes);
    try {
      matrix = (await readSheet(Buffer.from(bytes))) as CellInput[][];
    } catch {
      throw new SpreadsheetError("unreadable");
    }
  }

  const rows = matrix.map((cells, i) => ({ n: i + 1, cells })).filter((r) => !isBlankRow(r.cells));
  if (rows.length === 0) throw new SpreadsheetError("empty");
  const [header, ...data] = rows;
  if (header.cells.length > IMPORT_LIMITS.maxColumns) throw new SpreadsheetError("tooManyColumns");
  if (data.length > IMPORT_LIMITS.maxRows) throw new SpreadsheetError("tooManyRows");
  return {
    headers: header.cells.map((h) => (h === null || h === undefined ? "" : String(h).trim())),
    rows: data,
  };
}

/** Escribe una tabla de textos. En CSV se neutralizan fórmulas; en XLSX todo va como texto. */
export async function writeTable(
  format: FileFormat,
  headers: string[],
  rows: string[][],
): Promise<Buffer> {
  if (format === "CSV") {
    const csv = Papa.unparse(
      [headers, ...rows].map((r) => r.map(neutralizeFormula)),
      { newline: "\r\n" },
    );
    // BOM: Excel abre el CSV en UTF-8 (acentos y ñ correctos).
    return Buffer.from(`﻿${csv}`, "utf-8");
  }
  const data = [
    headers.map((h) => ({ value: h, type: String, fontWeight: "bold" as const })),
    ...rows.map((r) => r.map((v) => (v ? { value: v, type: String } : null))),
  ];
  return writeXlsxFile(data, {
    sheet: "Clientes",
    stickyRowsCount: 1,
    columns: headers.map((h) => ({ width: Math.min(40, Math.max(12, h.length + 4)) })),
  }).toBuffer();
}

export const MIME: Record<FileFormat, string> = {
  CSV: "text/csv;charset=utf-8",
  XLSX: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};
