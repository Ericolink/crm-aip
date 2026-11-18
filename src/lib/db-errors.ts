/**
 * Traducción SEGURA de errores de base de datos.
 *
 * Los errores de PostgreSQL/Prisma pueden incluir la fila completa en `detail`
 * ("Failing row contains (…nombre, fecha de nacimiento, teléfono…)"). Por eso NUNCA
 * se registra ni se muestra el error original: solo el tipo y el nombre de la regla.
 *
 * Sin dependencias de servidor (se prueba de forma aislada).
 */

export type DbErrorKind =
  | "unique_violation"
  | "foreign_key_violation"
  | "check_violation"
  | "not_null_violation"
  | "append_only"
  | "not_found"
  | "unknown";

export type SafeDbError = { kind: DbErrorKind; constraint: string | null };

const PG_CODES: Record<string, DbErrorKind> = {
  "23505": "unique_violation",
  "23503": "foreign_key_violation",
  "23514": "check_violation",
  "23502": "not_null_violation",
  P0001: "append_only", // RAISE EXCEPTION de nuestros triggers de solo inserción
};

const PRISMA_CODES: Record<string, DbErrorKind> = {
  P2002: "unique_violation",
  P2003: "foreign_key_violation",
  P2011: "not_null_violation",
  P2025: "not_found",
};

type Loose = Record<string, unknown> | undefined;
const obj = (value: unknown): Loose =>
  value && typeof value === "object" ? (value as Record<string, unknown>) : undefined;

/** Solo nombres de regla con formato de identificador; nunca texto libre. */
function safeIdentifier(value: unknown): string | null {
  return typeof value === "string" && /^[A-Za-z0-9_]{1,63}$/.test(value) ? value : null;
}

export function toSafeDbError(error: unknown): SafeDbError {
  const err = obj(error);
  const meta = obj(err?.meta);
  const cause = obj(obj(meta?.driverAdapterError)?.cause);

  const pgCode = typeof cause?.originalCode === "string" ? cause.originalCode : undefined;
  const prismaCode = typeof err?.code === "string" ? err.code : undefined;
  const kind =
    (pgCode && PG_CODES[pgCode]) || (prismaCode && PRISMA_CODES[prismaCode]) || "unknown";

  // Nombre de la regla: del objeto estructurado o extraído del mensaje (solo el identificador).
  const fromStructured = safeIdentifier(obj(cause?.constraint)?.index);
  const message = typeof cause?.originalMessage === "string" ? cause.originalMessage : "";
  const fromMessage = safeIdentifier(/constraint "([A-Za-z0-9_]+)"/.exec(message)?.[1]);

  return { kind, constraint: fromStructured ?? fromMessage };
}

/** Texto apto para logs: "db_error kind=check_violation constraint=clients_primary_phone_digits". */
export function describeDbErrorForLog(error: unknown): string {
  const { kind, constraint } = toSafeDbError(error);
  return `db_error kind=${kind}${constraint ? ` constraint=${constraint}` : ""}`;
}
