/**
 * Traduce errores de Better Auth a claves de mensaje (namespace "Errors").
 * Nunca muestra el texto original del servidor y nunca revela si una cuenta existe.
 */
export type AuthErrorKey =
  | "invalidCredentials"
  | "tooManyRequests"
  | "invalidCode"
  | "invalidBackupCode"
  | "locked"
  | "sessionStep"
  | "cannotSignIn"
  | "wrongPassword"
  | "generic";

type MaybeAuthError = { status?: number; code?: string } | null | undefined;

export function authErrorKey(error: MaybeAuthError): AuthErrorKey {
  if (!error) return "generic";
  if (error.status === 429) return "tooManyRequests";
  switch (error.code) {
    case "INVALID_EMAIL_OR_PASSWORD":
      return "invalidCredentials";
    case "INVALID_PASSWORD":
      return "wrongPassword";
    case "INVALID_CODE":
    case "INVALID_TWO_FACTOR_CODE":
      return "invalidCode";
    case "INVALID_BACKUP_CODE":
      return "invalidBackupCode";
    case "ACCOUNT_TEMPORARILY_LOCKED":
    case "TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE":
      return "locked";
    case "INVALID_TWO_FACTOR_COOKIE":
      return "sessionStep";
    case "FAILED_TO_CREATE_SESSION":
      return "cannotSignIn";
    default:
      return "generic";
  }
}
