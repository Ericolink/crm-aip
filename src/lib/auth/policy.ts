/**
 * Política de sesión y contraseñas. Un solo lugar para auditar y ajustar estos valores.
 * Sin dependencias de servidor: también lo usa el temporizador de inactividad del navegador.
 */
export const SESSION_POLICY = {
  /** Cierre por inactividad: la sesión vence si no hay actividad en este tiempo. */
  idleTimeoutSeconds: 15 * 60,
  /** Límite absoluto: aunque haya actividad, hay que volver a iniciar sesión tras 12 h. */
  absoluteTimeoutSeconds: 12 * 60 * 60,
  /** Con actividad del usuario, el navegador renueva la sesión como máximo cada 2 min. */
  activityPingSeconds: 2 * 60,
  /** Aviso antes del cierre por inactividad. */
  idleWarningSeconds: 2 * 60,
  /** "Recordar este dispositivo" para el segundo factor. */
  trustedDeviceDays: 30,
} as const;

export const PASSWORD_POLICY = {
  minLength: 12,
  maxLength: 128,
} as const;

export const LOGIN_RATE_LIMIT = {
  /** Intentos de contraseña por IP en la ventana. */
  passwordAttempts: 5,
  passwordWindowSeconds: 5 * 60,
  /** Intentos de código 2FA por IP en la ventana. */
  twoFactorAttempts: 5,
  twoFactorWindowSeconds: 60,
  /** Bloqueo del segundo factor tras códigos incorrectos consecutivos. */
  twoFactorLockoutAttempts: 5,
  twoFactorLockoutSeconds: 15 * 60,
} as const;

export function isBeyondAbsoluteLimit(sessionCreatedAt: Date, now = new Date()): boolean {
  return now.getTime() - sessionCreatedAt.getTime() > SESSION_POLICY.absoluteTimeoutSeconds * 1000;
}
