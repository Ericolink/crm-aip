import type { ZodError } from "zod";
import { ServiceError } from "@/lib/service-error";

/** Resultado uniforme de las Server Actions. Los errores son códigos (se traducen en la interfaz). */
export type ActionError = "forbidden" | "notFound" | "conflict" | "invalid" | "generic";

export type ActionResult<T = undefined> =
  { ok: true; data: T } | { ok: false; error: ActionError; fieldErrors?: Record<string, string> };

export function ok<T>(data: T): ActionResult<T> {
  return { ok: true, data };
}

export function fromZodError(error: ZodError): ActionResult<never> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) fieldErrors[issue.path.join(".")] ??= issue.message;
  return { ok: false, error: "invalid", fieldErrors };
}

/** ServiceError → código seguro. Cualquier otro error → "generic" (el servicio ya lo registró sin datos). */
export function fromServiceError(error: unknown): ActionResult<never> {
  if (!(error instanceof ServiceError)) return { ok: false, error: "generic" };
  const map: Record<ServiceError["code"], ActionError> = {
    FORBIDDEN: "forbidden",
    NOT_FOUND: "notFound",
    CONFLICT: "conflict",
    INVALID: "invalid",
  };
  const fieldKey = error.code === "CONFLICT" ? "duplicate" : "invalidOption";
  return {
    ok: false,
    error: map[error.code],
    ...(error.field ? { fieldErrors: { [error.field]: fieldKey } } : {}),
  };
}

export const isSafeId = (value: unknown): value is string =>
  typeof value === "string" && /^[A-Za-z0-9-]{8,64}$/.test(value);
