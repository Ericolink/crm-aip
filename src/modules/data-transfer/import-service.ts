import "server-only";
import { recordAudit } from "@/lib/audit/audit-log";
import type { CurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { PERMISSIONS } from "@/lib/permissions/catalog";
import { ServiceError } from "@/lib/service-error";
import { clientFormSchema, type ClientFormValues } from "@/modules/clients/schema";
import { normalizeSearchText } from "@/modules/clients/search";
import { createClient } from "@/modules/clients/service";
import {
  columnForHeader,
  IMPORT_COLUMNS,
  rowToClientInput,
  type CellInput,
  type ImportColumnKey,
} from "./columns";
import { readTable, SpreadsheetError } from "./spreadsheet";

/**
 * Importación de clientes en dos pasos:
 *  1. analyzeImport: lee y valida el archivo y devuelve una vista previa (no guarda nada).
 *  2. runImport: vuelve a validar el MISMO archivo (el navegador lo reenvía) e importa
 *     las filas válidas que no son duplicados.
 * El archivo no se guarda en el servidor entre un paso y otro.
 * Errores: solo número de fila, columna y código. Nunca el valor (puede ser un dato personal).
 */

export type ImportIssue = { row: number; column: ImportColumnKey | null; code: string };

export type ImportPreview = {
  totalRows: number;
  validRows: number;
  invalidRows: number;
  duplicateRows: number;
  recognizedColumns: ImportColumnKey[];
  ignoredHeaders: string[];
  issues: ImportIssue[];
  /** Hay más errores que los que se muestran. */
  truncated: boolean;
};

export type ImportResult = ImportPreview & { jobId: string; imported: number; failed: number };

type ValidRow = { row: number; values: ClientFormValues };

const MAX_ISSUES_SHOWN = 200;
const DUPLICATE_CODES = new Set(["duplicate", "duplicateInFile"]);

async function requireImport(user: CurrentUser) {
  for (const p of [PERMISSIONS.DATA_IMPORT, PERMISSIONS.CLIENT_CREATE]) {
    if (!user.permissions.has(p)) {
      await recordAudit({
        action: "ACCESS_DENIED",
        outcome: "DENIED",
        actorId: user.id,
        metadata: { permission: p },
      });
      throw new ServiceError("FORBIDDEN");
    }
  }
}

/** Clave de duplicado: nombre normalizado + fecha de nacimiento (o teléfono si no hay fecha). */
function duplicateKey(v: {
  firstName: string;
  lastName: string;
  dateOfBirth?: string | Date | null;
  primaryPhone?: string | null;
}) {
  const name = normalizeSearchText(`${v.firstName} ${v.lastName}`).replace(/\s+/g, " ");
  const dob =
    v.dateOfBirth instanceof Date ? v.dateOfBirth.toISOString().slice(0, 10) : v.dateOfBirth;
  if (dob) return `${name}|dob:${dob}`;
  if (v.primaryPhone) return `${name}|tel:${v.primaryPhone}`;
  return null;
}

async function analyze(user: CurrentUser, fileName: string, bytes: Uint8Array) {
  let table;
  try {
    table = await readTable(fileName, bytes);
  } catch (error) {
    if (error instanceof SpreadsheetError) throw new ServiceError("INVALID", `file.${error.code}`);
    throw error;
  }

  // Encabezados → columnas conocidas.
  const columnIndex = new Map<ImportColumnKey, number>();
  const ignoredHeaders: string[] = [];
  table.headers.forEach((header, i) => {
    const key = columnForHeader(header);
    if (!key) {
      if (header) ignoredHeaders.push(header.slice(0, 60));
    } else if (columnIndex.has(key)) {
      throw new ServiceError("INVALID", "file.duplicateColumn");
    } else columnIndex.set(key, i);
  });
  if (!columnIndex.has("firstName") || !columnIndex.has("lastName")) {
    throw new ServiceError("INVALID", "file.missingColumns");
  }

  // Agentes que se pueden asignar por correo.
  const canAssign = user.permissions.has(PERMISSIONS.CLIENT_ASSIGN);
  const agents = new Map(
    (
      await prisma.user.findMany({
        where: { isActive: true, role: { key: { in: ["ADMIN", "AGENT"] } } },
        select: { id: true, email: true },
      })
    ).map((a) => [a.email.toLowerCase(), a.id]),
  );

  const issues: ImportIssue[] = [];
  const candidates: (ValidRow & { key: string | null })[] = [];
  for (const { n, cells } of table.rows) {
    const record: Partial<Record<ImportColumnKey, CellInput>> = {};
    for (const [key, i] of columnIndex) record[key] = cells[i];
    const { input, assignedAgentEmail, issues: rowIssues } = rowToClientInput(record);
    const found: ImportIssue[] = rowIssues.map((i) => ({ row: n, ...i }));

    if (assignedAgentEmail) {
      if (!canAssign) found.push({ row: n, column: "assignedAgentEmail", code: "cannotAssign" });
      else if (!agents.has(assignedAgentEmail))
        found.push({ row: n, column: "assignedAgentEmail", code: "unknownAgent" });
      else input.assignedAgentId = agents.get(assignedAgentEmail);
    }

    const parsed = clientFormSchema.safeParse(input);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const column = String(issue.path[0] ?? "");
        const key = IMPORT_COLUMNS.some((c) => c.key === column)
          ? (column as ImportColumnKey)
          : null;
        if (!found.some((f) => f.column === key))
          found.push({ row: n, column: key, code: issue.message });
      }
    }
    if (found.length) issues.push(...found);
    else if (parsed.success)
      candidates.push({ row: n, values: parsed.data, key: duplicateKey(parsed.data) });
  }

  // Duplicados dentro del archivo y contra clientes existentes (no eliminados).
  const names = [
    ...new Set(
      candidates.map((c) => normalizeSearchText(`${c.values.firstName} ${c.values.lastName}`)),
    ),
  ];
  const existing = new Set<string | null>();
  for (let i = 0; i < names.length; i += 500) {
    const rows = await prisma.client.findMany({
      where: { deletedAt: null, searchName: { in: names.slice(i, i + 500) } },
      select: { firstName: true, lastName: true, dateOfBirth: true, primaryPhone: true },
    });
    for (const r of rows) {
      // Un cliente existente puede coincidir por fecha o, si no la tiene, por teléfono.
      existing.add(duplicateKey(r));
      existing.add(duplicateKey({ ...r, dateOfBirth: null }));
    }
  }
  const seen = new Set<string>();
  const valid: ValidRow[] = [];
  for (const c of candidates) {
    if (c.key && existing.has(c.key)) issues.push({ row: c.row, column: null, code: "duplicate" });
    else if (c.key && seen.has(c.key))
      issues.push({ row: c.row, column: null, code: "duplicateInFile" });
    else valid.push({ row: c.row, values: c.values });
    if (c.key) seen.add(c.key);
  }

  issues.sort((a, b) => a.row - b.row);
  const rowsWith = (pred: (i: ImportIssue) => boolean) =>
    new Set(issues.filter(pred).map((i) => i.row)).size;
  const preview: ImportPreview = {
    totalRows: table.rows.length,
    validRows: valid.length,
    invalidRows: rowsWith((i) => !DUPLICATE_CODES.has(i.code)),
    duplicateRows: rowsWith((i) => DUPLICATE_CODES.has(i.code)),
    recognizedColumns: [...columnIndex.keys()],
    ignoredHeaders: ignoredHeaders.slice(0, 20),
    issues: issues.slice(0, MAX_ISSUES_SHOWN),
    truncated: issues.length > MAX_ISSUES_SHOWN,
  };
  return { preview, valid, allIssues: issues };
}

export async function analyzeImport(
  user: CurrentUser,
  fileName: string,
  bytes: Uint8Array,
): Promise<ImportPreview> {
  await requireImport(user);
  return (await analyze(user, fileName, bytes)).preview;
}

export async function runImport(
  user: CurrentUser,
  fileName: string,
  bytes: Uint8Array,
): Promise<ImportResult> {
  await requireImport(user);
  const { preview, valid, allIssues } = await analyze(user, fileName, bytes);

  const job = await prisma.importJob.create({
    data: {
      createdById: user.id,
      fileName: fileName.replace(/[^\p{L}\p{N} ._()-]/gu, "_").slice(0, 120),
      status: "PROCESSING",
      totalRows: preview.totalRows,
    },
  });

  let imported = 0;
  const failures: ImportIssue[] = [];
  for (const row of valid) {
    try {
      await createClient(user, row.values);
      imported++;
    } catch {
      // createClient ya registró el error sin datos personales.
      failures.push({ row: row.row, column: null, code: "saveFailed" });
    }
  }

  const issues = [...allIssues, ...failures].sort((a, b) => a.row - b.row);
  await prisma.importJob.update({
    where: { id: job.id },
    data: {
      status: "COMPLETED",
      importedRows: imported,
      failedRows: preview.totalRows - imported,
      errors: issues.slice(0, 1000),
      completedAt: new Date(),
    },
  });
  await recordAudit({
    action: "DATA_IMPORTED",
    outcome: "SUCCESS",
    actorId: user.id,
    targetType: "import_job",
    targetId: job.id,
    metadata: {
      rows: preview.totalRows,
      imported,
      skippedDuplicates: preview.duplicateRows,
      invalid: preview.invalidRows,
      failed: failures.length,
    },
  });

  return {
    ...preview,
    issues: issues.slice(0, MAX_ISSUES_SHOWN),
    truncated: issues.length > MAX_ISSUES_SHOWN,
    jobId: job.id,
    imported,
    failed: failures.length,
  };
}
