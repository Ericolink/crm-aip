import "server-only";
import { headers } from "next/headers";
import { getLocale } from "next-intl/server";
import { cache } from "react";
import { recordAudit } from "@/lib/audit/audit-log";
import { prisma } from "@/lib/db";
import type { PermissionKey } from "@/lib/permissions/catalog";
import { redirect } from "@/i18n/navigation";
import { auth } from "./auth";
import { loadCurrentUser, type CurrentUser } from "./current-user";
import { isBeyondAbsoluteLimit } from "./policy";

/**
 * Capa de acceso a la sesión (Data Access Layer).
 * TODA pantalla, acción o servicio que necesite al usuario pasa por aquí.
 * Devuelve un objeto reducido: nunca el registro completo de la base.
 */
export type { CurrentUser };

export type LoginReason = "idle" | "expired" | "inactive" | "signed_out";

/** Una lectura de sesión por petición (React cache). */
const readSession = cache(async () => auth.api.getSession({ headers: await headers() }));

const loadUser = cache(loadCurrentUser);

async function toLogin(reason?: LoginReason): Promise<never> {
  const locale = await getLocale();
  return redirect({ href: reason ? `/login?reason=${reason}` : "/login", locale });
}

/** Elimina la sesión. Devuelve true solo a quien realmente la borró (evita eventos duplicados). */
async function endSession(token: string): Promise<boolean> {
  const { count } = await prisma.session.deleteMany({ where: { token } });
  return count > 0;
}

type RequireUserOptions = {
  /** Solo la pantalla de configuración de 2FA permite entrar sin 2FA activa. */
  allowWithoutTwoFactor?: boolean;
};

type Resolution = { status: "ok"; user: CurrentUser } | { status: "login"; reason?: LoginReason };

/**
 * Valida la sesión UNA sola vez por petición (React cache), aunque el layout, la página
 * y los componentes llamen a requireUser por separado. Así los efectos (cerrar la sesión
 * vencida, registrar el evento) no se repiten.
 */
const resolveCurrentUser = cache(async (): Promise<Resolution> => {
  const data = await readSession();
  if (!data) return { status: "login" };

  const user = await loadUser(data.user.id);
  if (!user || !user.isActive) {
    await endSession(data.session.token);
    return { status: "login", reason: "inactive" };
  }

  if (isBeyondAbsoluteLimit(new Date(data.session.createdAt))) {
    const ended = await endSession(data.session.token);
    if (ended) {
      await recordAudit({
        action: "SESSION_EXPIRED_ABSOLUTE",
        outcome: "SUCCESS",
        actorId: user.id,
        targetType: "session",
        targetId: data.session.id,
      });
    }
    return { status: "login", reason: "expired" };
  }

  const { isActive: _isActive, ...current } = user;
  return { status: "ok", user: current };
});

/**
 * Devuelve el usuario actual o redirige al login.
 * Verifica: sesión válida, usuario activo, límite absoluto de 12 h y 2FA configurada.
 */
export async function requireUser(options: RequireUserOptions = {}): Promise<CurrentUser> {
  const result = await resolveCurrentUser();
  if (result.status === "login") return toLogin(result.reason);

  if (!result.user.twoFactorEnabled && !options.allowWithoutTwoFactor) {
    return redirect({ href: "/setup-2fa", locale: await getLocale() });
  }
  return result.user;
}

/**
 * Id del usuario con sesión válida (activo, dentro del límite de 12 h), sin redirigir.
 * Para Server Actions que deben responder un error en lugar de redirigir.
 */
export async function getOptionalUserId(): Promise<string | null> {
  const result = await resolveCurrentUser();
  return result.status === "ok" ? result.user.id : null;
}

export function hasPermission(user: CurrentUser, permission: PermissionKey): boolean {
  return user.permissions.has(permission);
}

export class ForbiddenError extends Error {
  constructor(public readonly permission: PermissionKey) {
    super("FORBIDDEN");
  }
}

/**
 * Exige un permiso. Si falta, registra ACCESS_DENIED y lanza ForbiddenError.
 * Usar en servicios y Server Actions, cerca de los datos, no solo en la interfaz.
 */
export async function requirePermission(permission: PermissionKey): Promise<CurrentUser> {
  const user = await requireUser();
  if (!hasPermission(user, permission)) {
    await recordAudit({
      action: "ACCESS_DENIED",
      outcome: "DENIED",
      actorId: user.id,
      metadata: { permission },
      headers: await headers(),
    });
    throw new ForbiddenError(permission);
  }
  return user;
}
