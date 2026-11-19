"use server";

import { refresh } from "next/cache";
import { getLocale } from "next-intl/server";
import { fromServiceError, ok, type ActionResult } from "@/lib/action-result";
import { requireUser } from "@/lib/auth/session";
import { ServiceError } from "@/lib/service-error";
import { parseClientListParams } from "@/modules/clients/list-params";
import { IMPORT_LIMITS } from "./columns";
import { buildTemplate, exportClients } from "./export-service";
import { analyzeImport, runImport, type ImportPreview, type ImportResult } from "./import-service";
import type { FileFormat } from "./spreadsheet";

type Download = { fileName: string; mimeType: string; base64: string };

const isFormat = (v: unknown): v is FileFormat => v === "CSV" || v === "XLSX";

/** Errores de archivo/exportación con su código específico (p. ej. file.tooLarge → { file: "tooLarge" }). */
function toResult(error: unknown): ActionResult<never> {
  // Error inesperado: se registra solo su tipo (nunca el mensaje, que podría traer datos).
  if (!(error instanceof ServiceError)) {
    console.error(
      `[data-transfer] error inesperado: ${error instanceof Error ? error.name : typeof error}`,
    );
  }
  if (error instanceof ServiceError && error.code === "INVALID" && error.field) {
    const [scope, code] = error.field.includes(".")
      ? error.field.split(".")
      : ["export", error.field];
    return { ok: false, error: "invalid", fieldErrors: { [scope]: code } };
  }
  return fromServiceError(error);
}

async function readUpload(formData: FormData) {
  const file = formData.get("file");
  if (!(file instanceof File)) throw new ServiceError("INVALID", "file.empty");
  if (file.size > IMPORT_LIMITS.maxBytes) throw new ServiceError("INVALID", "file.tooLarge");
  return { name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) };
}

export async function analyzeImportAction(
  formData: FormData,
): Promise<ActionResult<ImportPreview>> {
  const user = await requireUser();
  try {
    const file = await readUpload(formData);
    return ok(await analyzeImport(user, file.name, file.bytes));
  } catch (error) {
    return toResult(error);
  }
}

export async function runImportAction(formData: FormData): Promise<ActionResult<ImportResult>> {
  const user = await requireUser();
  try {
    const file = await readUpload(formData);
    const result = await runImport(user, file.name, file.bytes);
    refresh();
    return ok(result);
  } catch (error) {
    return toResult(error);
  }
}

export async function exportClientsAction(input: {
  format: unknown;
  query: unknown;
  includeSensitive: unknown;
}): Promise<ActionResult<Download & { rowCount: number }>> {
  const user = await requireUser();
  if (!isFormat(input.format) || typeof input.query !== "string" || input.query.length > 2000) {
    return { ok: false, error: "invalid" };
  }
  try {
    const params = parseClientListParams(Object.fromEntries(new URLSearchParams(input.query)));
    const locale = (await getLocale()) === "en" ? "en" : "es";
    const file = await exportClients(user, {
      format: input.format,
      params,
      includeSensitive: input.includeSensitive === true,
      locale,
    });
    refresh();
    return ok({
      fileName: file.fileName,
      mimeType: file.mimeType,
      base64: file.bytes.toString("base64"),
      rowCount: file.rowCount,
    });
  } catch (error) {
    return toResult(error);
  }
}

export async function templateAction(format: unknown): Promise<ActionResult<Download>> {
  const user = await requireUser();
  if (!isFormat(format)) return { ok: false, error: "invalid" };
  try {
    const locale = (await getLocale()) === "en" ? "en" : "es";
    const file = await buildTemplate(user, format, locale);
    return ok({
      fileName: file.fileName,
      mimeType: file.mimeType,
      base64: file.bytes.toString("base64"),
    });
  } catch (error) {
    return toResult(error);
  }
}
