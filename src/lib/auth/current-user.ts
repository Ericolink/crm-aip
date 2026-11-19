import "server-only";
import { prisma } from "@/lib/db";
import { isPermissionKey, type PermissionKey } from "@/lib/permissions/catalog";

/**
 * Usuario actual tal como lo usan los servicios: permisos del rol y agentes vinculados.
 * Se carga en CADA petición (sin caché entre peticiones): un cambio de rol, la desactivación
 * del usuario o la desactivación de un vínculo asistente↔agente tienen efecto inmediato.
 *
 * Sin dependencias de Next: lo usan la sesión (session.ts) y las pruebas de integración.
 */
export type CurrentUser = {
  id: string;
  name: string;
  email: string;
  roleKey: string;
  roleName: { es: string; en: string };
  permissions: ReadonlySet<PermissionKey>;
  /** Agentes ACTIVOS a los que este usuario (asistente) está vinculado con un vínculo ACTIVO. */
  linkedAgentIds: readonly string[];
  preferredLocale: string;
  twoFactorEnabled: boolean;
  /** Contraseña puesta por un administrador: hay que cambiarla antes de usar el sistema. */
  mustChangePassword: boolean;
};

export async function loadCurrentUser(
  userId: string,
): Promise<(CurrentUser & { isActive: boolean }) | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      isActive: true,
      preferredLocale: true,
      twoFactorEnabled: true,
      mustChangePassword: true,
      role: {
        select: {
          key: true,
          nameEs: true,
          nameEn: true,
          permissions: { select: { permission: { select: { key: true } } } },
        },
      },
      assistantLinks: {
        where: { isActive: true, agent: { isActive: true } },
        select: { agentId: true },
      },
    },
  });
  if (!user) return null;

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    isActive: user.isActive,
    roleKey: user.role.key,
    roleName: { es: user.role.nameEs, en: user.role.nameEn },
    permissions: new Set(
      user.role.permissions.map((rp) => rp.permission.key).filter(isPermissionKey),
    ),
    linkedAgentIds: user.assistantLinks.map((l) => l.agentId),
    preferredLocale: user.preferredLocale,
    twoFactorEnabled: Boolean(user.twoFactorEnabled),
    mustChangePassword: user.mustChangePassword,
  };
}
