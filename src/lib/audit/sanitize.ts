/**
 * Reglas para lo que puede guardarse en la bitácora de auditoría.
 * Sin dependencias de servidor para poder probarse de forma aislada.
 */

export const AUDIT_ACTIONS = [
  "LOGIN_SUCCESS",
  "LOGIN_FAILED",
  "LOGIN_2FA_REQUIRED",
  "LOGIN_BLOCKED_INACTIVE",
  "LOGOUT",
  "SESSION_EXPIRED_ABSOLUTE",
  "TWO_FACTOR_SETUP_STARTED",
  "TWO_FACTOR_ENABLED",
  "TWO_FACTOR_FAILED",
  "PASSWORD_CHANGED",
  "PASSWORD_CHANGE_FAILED",
  "ACCESS_DENIED",
  "CLIENT_VIEWED",
  "SENSITIVE_REVEALED",
  "ASSISTANT_LINK_CREATED",
  "ASSISTANT_LINK_REMOVED",
  "IDENTIFIER_SEARCH",
  "PREFERENCE_UPDATED",
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];
export type AuditOutcome = "SUCCESS" | "FAILURE" | "DENIED";

/** Claves que JAMÁS se aceptan en metadata, aunque alguien las pase por error. */
const FORBIDDEN_KEY =
  /pass|secret|token|code|otp|email|phone|ssn|mbi|medicare|medicaid|member|dob|birth|address/i;

const MAX_STRING = 200;

export type AuditMetadata = Record<string, string | number | boolean | null>;

/**
 * Limpia los metadatos: solo valores primitivos, sin claves sensibles,
 * textos recortados y como máximo 20 claves.
 */
export function sanitizeAuditMetadata(
  input: Record<string, unknown> | undefined,
): AuditMetadata | undefined {
  if (!input) return undefined;
  const out: AuditMetadata = {};
  for (const [key, value] of Object.entries(input).slice(0, 20)) {
    if (FORBIDDEN_KEY.test(key)) continue;
    if (typeof value === "string") out[key] = value.slice(0, MAX_STRING);
    else if (typeof value === "number" || typeof value === "boolean" || value === null)
      out[key] = value;
  }
  return Object.keys(out).length ? out : undefined;
}

/** Primer valor de x-forwarded-for (o null). En producción se ajustará al proxy de confianza. */
export function clientIpFrom(headers: Headers | undefined | null): string | null {
  const forwarded = headers?.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || headers?.get("x-real-ip") || null;
}

export function userAgentFrom(headers: Headers | undefined | null): string | null {
  return headers?.get("user-agent")?.slice(0, 300) ?? null;
}
