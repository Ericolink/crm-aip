import { describe, expect, it } from "vitest";
import { isBeyondAbsoluteLimit, PASSWORD_POLICY, SESSION_POLICY } from "@/lib/auth/policy";
import { authErrorKey } from "@/modules/auth/auth-errors";

describe("política de sesión", () => {
  it("usa los valores aprobados: 15 min de inactividad y 12 h máximo", () => {
    expect(SESSION_POLICY.idleTimeoutSeconds).toBe(15 * 60);
    expect(SESSION_POLICY.absoluteTimeoutSeconds).toBe(12 * 60 * 60);
    expect(SESSION_POLICY.idleWarningSeconds).toBeLessThan(SESSION_POLICY.idleTimeoutSeconds);
    expect(SESSION_POLICY.activityPingSeconds).toBeLessThan(SESSION_POLICY.idleTimeoutSeconds);
  });

  it("detecta sesiones que superan el límite absoluto", () => {
    const now = new Date("2026-11-18T20:00:00Z");
    expect(isBeyondAbsoluteLimit(new Date("2026-11-18T08:30:00Z"), now)).toBe(false);
    expect(isBeyondAbsoluteLimit(new Date("2026-11-18T07:59:00Z"), now)).toBe(true);
  });

  it("exige contraseñas de al menos 12 caracteres", () => {
    expect(PASSWORD_POLICY.minLength).toBeGreaterThanOrEqual(12);
  });
});

describe("mensajes de error de autenticación", () => {
  it("no distingue entre correo inexistente y contraseña incorrecta", () => {
    expect(authErrorKey({ status: 401, code: "INVALID_EMAIL_OR_PASSWORD" })).toBe(
      "invalidCredentials",
    );
  });

  it("traduce límite de intentos, bloqueo y códigos inválidos", () => {
    expect(authErrorKey({ status: 429 })).toBe("tooManyRequests");
    expect(authErrorKey({ status: 401, code: "ACCOUNT_TEMPORARILY_LOCKED" })).toBe("locked");
    expect(authErrorKey({ status: 401, code: "INVALID_CODE" })).toBe("invalidCode");
    expect(authErrorKey({ status: 401, code: "INVALID_BACKUP_CODE" })).toBe("invalidBackupCode");
    expect(authErrorKey({ status: 401, code: "INVALID_TWO_FACTOR_COOKIE" })).toBe("sessionStep");
    expect(authErrorKey({ status: 403, code: "FAILED_TO_CREATE_SESSION" })).toBe("cannotSignIn");
  });

  it("usa un mensaje genérico para cualquier error desconocido", () => {
    expect(authErrorKey({ status: 500, code: "SOMETHING_ELSE" })).toBe("generic");
    expect(authErrorKey(null)).toBe("generic");
  });
});
