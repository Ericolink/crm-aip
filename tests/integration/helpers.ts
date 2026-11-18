import { randomUUID } from "node:crypto";
import { loadCurrentUser, type CurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/db";
import { emptyClientForm, type ClientFormInput } from "@/modules/clients/schema";

/**
 * Carga el usuario con la MISMA función que usa la sesión real en cada petición
 * (permisos del rol + agentes vinculados activos).
 */
export async function asCurrentUser(userId: string): Promise<CurrentUser> {
  const loaded = await loadCurrentUser(userId);
  if (!loaded) throw new Error("usuario de prueba no encontrado");
  const { isActive: _isActive, ...user } = loaded;
  return user;
}

/** Crea un usuario de prueba con el rol indicado y lo devuelve como CurrentUser. */
export async function createTestUser(roleKey: "ADMIN" | "AGENT" | "ASSISTANT", name: string) {
  const role = await prisma.role.findUniqueOrThrow({ where: { key: roleKey } });
  const user = await prisma.user.create({
    data: {
      id: randomUUID(),
      name,
      email: `${randomUUID()}@ejemplo.local`,
      roleId: role.id,
      twoFactorEnabled: true,
    },
  });
  return asCurrentUser(user.id);
}

/** Formulario de cliente ficticio con valores por defecto sobrescribibles. */
export function clientInput(overrides: Partial<ClientFormInput> = {}): ClientFormInput {
  return { ...emptyClientForm(), firstName: "Prueba", lastName: "Ficticia", ...overrides };
}
