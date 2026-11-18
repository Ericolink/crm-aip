import { randomUUID } from "node:crypto";
import type { CurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { isPermissionKey } from "@/lib/permissions/catalog";
import { emptyClientForm, type ClientFormInput } from "@/modules/clients/schema";

/** Crea un usuario de prueba con el rol indicado y lo devuelve como CurrentUser. */
export async function createTestUser(roleKey: "ADMIN" | "AGENT" | "ASSISTANT", name: string) {
  const role = await prisma.role.findUniqueOrThrow({
    where: { key: roleKey },
    include: { permissions: { include: { permission: true } } },
  });
  const user = await prisma.user.create({
    data: {
      id: randomUUID(),
      name,
      email: `${randomUUID()}@ejemplo.local`,
      roleId: role.id,
      twoFactorEnabled: true,
    },
  });
  const current: CurrentUser = {
    id: user.id,
    name: user.name,
    email: user.email,
    roleKey,
    roleName: { es: role.nameEs, en: role.nameEn },
    permissions: new Set(role.permissions.map((rp) => rp.permission.key).filter(isPermissionKey)),
    preferredLocale: "es",
    twoFactorEnabled: true,
  };
  return current;
}

/** Formulario de cliente ficticio con valores por defecto sobrescribibles. */
export function clientInput(overrides: Partial<ClientFormInput> = {}): ClientFormInput {
  return { ...emptyClientForm(), firstName: "Prueba", lastName: "Ficticia", ...overrides };
}
