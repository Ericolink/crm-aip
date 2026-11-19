import "server-only";
import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import type { Prisma } from "@/generated/prisma/client";
import { recordAudit } from "@/lib/audit/audit-log";
import type { CurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/db";
import { describeDbErrorForLog, toSafeDbError } from "@/lib/db-errors";
import { ROLE_KEYS } from "@/lib/permissions/catalog";
import { ServiceError } from "@/lib/service-error";
import {
  createUserSchema,
  passwordSchema,
  updateUserSchema,
  type CreateUserInput,
  type UpdateUserInput,
} from "./schema";
import { requireUserManager, SUPPORTABLE_ROLES } from "./service";

/**
 * Alta, edición, desactivación y restablecimientos de usuarios (solo con user.manage).
 *
 * Reglas (ADR 0017):
 * - No hay registro público: el administrador crea la cuenta con una contraseña inicial.
 *   Esa contraseña (y cualquier restablecimiento) obliga a cambiarla al entrar.
 * - Los usuarios nunca se borran (trazabilidad): se desactivan.
 * - Nadie puede cambiarse el rol, desactivarse ni restablecerse a sí mismo desde aquí,
 *   y siempre queda al menos un administrador activo.
 * - Desactivar a quien tiene clientes o recordatorios pendientes exige reasignarlos a un
 *   agente activo; cada cliente y recordatorio movido queda en su historial.
 * - Errores con código específico en `field` ("campo.código") para mensajes claros.
 */

type Tx = Prisma.TransactionClient;
type Person = { id: string; name: string };

function rethrow(error: unknown): never {
  if (error instanceof ServiceError) throw error;
  if (toSafeDbError(error).kind === "unique_violation") throw new ServiceError("CONFLICT", "email");
  console.error(`[users] ${describeDbErrorForLog(error)}`);
  throw new Error("USER_SERVICE_FAILURE");
}

async function loadTarget(userId: string) {
  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      isActive: true,
      preferredLocale: true,
      role: { select: { id: true, key: true } },
      _count: {
        select: {
          clientsAssigned: { where: { deletedAt: null } },
          remindersAssigned: { where: { status: "PENDING" } },
        },
      },
    },
  });
  if (!target) throw new ServiceError("NOT_FOUND");
  return target;
}

function forbidSelf(actor: CurrentUser, targetId: string) {
  if (actor.id === targetId) throw new ServiceError("INVALID", "user.self");
}

/** Siempre debe quedar al menos un administrador activo (además del afectado). */
async function assertAnotherActiveAdmin(targetId: string) {
  const others = await prisma.user.count({
    where: { id: { not: targetId }, isActive: true, role: { key: ROLE_KEYS.ADMIN } },
  });
  if (others === 0) throw new ServiceError("INVALID", "user.lastAdmin");
}

/** Agente (o administrador) activo que recibirá clientes y recordatorios. */
async function resolveReassignTarget(fromId: string, reassignToId: unknown): Promise<Person> {
  if (typeof reassignToId !== "string" || !reassignToId) {
    throw new ServiceError("INVALID", "reassignToId.required");
  }
  if (reassignToId === fromId) throw new ServiceError("INVALID", "reassignToId.invalidOption");
  const to = await prisma.user.findFirst({
    where: {
      id: reassignToId,
      isActive: true,
      role: { key: { in: SUPPORTABLE_ROLES as string[] } },
    },
    select: { id: true, name: true },
  });
  if (!to) throw new ServiceError("INVALID", "reassignToId.invalidOption");
  return to;
}

/**
 * Pasa los clientes (no eliminados) y, si se pide, los recordatorios pendientes de un usuario
 * a otro. Cada registro movido deja una entrada en el historial de su cliente, igual que
 * cuando se cambia el agente desde el formulario.
 */
async function transferWork(
  tx: Tx,
  actorId: string,
  from: Person,
  to: Person,
  options: { reminders: boolean },
) {
  const clients = await tx.client.findMany({
    where: { assignedAgentId: from.id, deletedAt: null },
    select: { id: true },
  });
  if (clients.length) {
    await tx.client.updateMany({
      where: { id: { in: clients.map((c) => c.id) } },
      data: { assignedAgentId: to.id },
    });
    await tx.activityLog.createMany({
      data: clients.map((c) => ({
        clientId: c.id,
        actorId,
        entityType: "client",
        entityId: c.id,
        action: "UPDATE" as const,
        changes: { assignedAgentId: { from: from.id, to: to.id } },
      })),
    });
  }

  let reminders = 0;
  if (options.reminders) {
    const pending = await tx.reminder.findMany({
      where: { assignedToId: from.id, status: "PENDING" },
      select: { id: true, clientId: true },
    });
    if (pending.length) {
      await tx.reminder.updateMany({
        where: { id: { in: pending.map((r) => r.id) } },
        data: { assignedToId: to.id },
      });
      await tx.activityLog.createMany({
        data: pending.map((r) => ({
          clientId: r.clientId,
          actorId,
          entityType: "reminder",
          entityId: r.id,
          action: "UPDATE" as const,
          changes: { assignedTo: { from: from.name, to: to.name } },
        })),
      });
    }
    reminders = pending.length;
  }
  return { clients: clients.length, reminders };
}

/** Roles que se pueden asignar desde la interfaz, con su nombre. */
export async function listAssignableRoles(actor: CurrentUser) {
  await requireUserManager(actor);
  const roles = await prisma.role.findMany({
    where: { key: { in: [ROLE_KEYS.ADMIN, ROLE_KEYS.AGENT, ROLE_KEYS.ASSISTANT] } },
    select: { key: true, nameEs: true, nameEn: true },
  });
  const order: string[] = [ROLE_KEYS.AGENT, ROLE_KEYS.ASSISTANT, ROLE_KEYS.ADMIN];
  return roles
    .sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key))
    .map((r) => ({ key: r.key, name: { es: r.nameEs, en: r.nameEn } }));
}

export async function createUser(actor: CurrentUser, input: CreateUserInput): Promise<string> {
  await requireUserManager(actor);
  const parsed = createUserSchema.safeParse(input);
  if (!parsed.success) throw new ServiceError("INVALID");
  const values = parsed.data;
  const role = await prisma.role.findUnique({ where: { key: values.roleKey } });
  if (!role) throw new ServiceError("INVALID", "roleKey.invalidOption");

  const userId = randomUUID();
  const password = await hashPassword(values.password);
  try {
    await prisma.$transaction([
      prisma.user.create({
        data: {
          id: userId,
          name: values.name,
          email: values.email,
          emailVerified: true,
          roleId: role.id,
          preferredLocale: values.preferredLocale,
          mustChangePassword: true,
        },
      }),
      // Misma estructura que usa Better Auth para cuentas de correo + contraseña.
      prisma.account.create({
        data: {
          id: randomUUID(),
          userId,
          accountId: userId,
          providerId: "credential",
          password,
        },
      }),
    ]);
  } catch (error) {
    rethrow(error);
  }
  await recordAudit({
    action: "USER_CREATED",
    outcome: "SUCCESS",
    actorId: actor.id,
    targetType: "user",
    targetId: userId,
    metadata: { role: values.roleKey },
  });
  return userId;
}

/**
 * Edita nombre, correo de acceso, idioma y rol.
 * Al cambiar de rol se ajustan los vínculos asistente ↔ agente para que nadie conserve
 * acceso a clientes por un vínculo que ya no corresponde a su rol.
 */
export async function updateUser(
  actor: CurrentUser,
  userId: string,
  input: UpdateUserInput,
  reassignToId?: string | null,
): Promise<void> {
  await requireUserManager(actor);
  const parsed = updateUserSchema.safeParse(input);
  if (!parsed.success) throw new ServiceError("INVALID");
  const values = parsed.data;
  const target = await loadTarget(userId);

  const fromRole = target.role.key;
  const toRole = values.roleKey;
  const roleChanged = fromRole !== toRole;
  let reassignTo: Person | null = null;

  if (roleChanged) {
    if (actor.id === userId) throw new ServiceError("INVALID", "roleKey.self");
    if (fromRole === ROLE_KEYS.ADMIN && target.isActive) await assertAnotherActiveAdmin(userId);
    // Un asistente no lleva cartera propia: sus clientes pasan a otro agente.
    if (toRole === ROLE_KEYS.ASSISTANT && target._count.clientsAssigned > 0) {
      reassignTo = await resolveReassignTarget(userId, reassignToId);
    }
  }
  const role = roleChanged
    ? await prisma.role.findUnique({ where: { key: toRole }, select: { id: true } })
    : target.role;
  if (!role) throw new ServiceError("INVALID", "roleKey.invalidOption");

  let moved = { clients: 0, reminders: 0 };
  try {
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: {
          name: values.name,
          email: values.email,
          preferredLocale: values.preferredLocale,
          roleId: role.id,
        },
      });
      if (roleChanged && fromRole === ROLE_KEYS.ASSISTANT) {
        await tx.assistantAgentLink.updateMany({
          where: { assistantId: userId, isActive: true },
          data: { isActive: false, deactivatedAt: new Date() },
        });
      }
      if (roleChanged && toRole === ROLE_KEYS.ASSISTANT) {
        await tx.assistantAgentLink.updateMany({
          where: { agentId: userId, isActive: true },
          data: { isActive: false, deactivatedAt: new Date() },
        });
        if (reassignTo) {
          moved = await transferWork(tx, actor.id, target, reassignTo, { reminders: false });
        }
      }
    });
  } catch (error) {
    rethrow(error);
  }

  await recordAudit({
    action: "USER_UPDATED",
    outcome: "SUCCESS",
    actorId: actor.id,
    targetType: "user",
    targetId: userId,
    metadata: {
      renamed: values.name !== target.name,
      loginChanged: values.email !== target.email,
      localeChanged: values.preferredLocale !== target.preferredLocale,
      ...(roleChanged ? { roleFrom: fromRole, roleTo: toRole } : {}),
      ...(moved.clients ? { clientsReassigned: moved.clients } : {}),
    },
  });
}

/**
 * Desactiva o reactiva una cuenta. Desactivar cierra todas sus sesiones al instante y, si
 * tiene clientes o recordatorios pendientes, los pasa al agente indicado.
 */
export async function setUserActive(
  actor: CurrentUser,
  userId: string,
  active: boolean,
  reassignToId?: string | null,
): Promise<{ clients: number; reminders: number }> {
  await requireUserManager(actor);
  forbidSelf(actor, userId);
  const target = await loadTarget(userId);
  if (target.isActive === active) return { clients: 0, reminders: 0 };

  if (active) {
    await prisma.user.update({ where: { id: userId }, data: { isActive: true } });
    await recordAudit({
      action: "USER_REACTIVATED",
      outcome: "SUCCESS",
      actorId: actor.id,
      targetType: "user",
      targetId: userId,
    });
    return { clients: 0, reminders: 0 };
  }

  if (target.role.key === ROLE_KEYS.ADMIN) await assertAnotherActiveAdmin(userId);
  const hasWork = target._count.clientsAssigned > 0 || target._count.remindersAssigned > 0;
  const reassignTo = hasWork ? await resolveReassignTarget(userId, reassignToId) : null;

  let moved = { clients: 0, reminders: 0 };
  try {
    await prisma.$transaction(async (tx) => {
      if (reassignTo) {
        moved = await transferWork(tx, actor.id, target, reassignTo, { reminders: true });
      }
      await tx.user.update({ where: { id: userId }, data: { isActive: false } });
      await tx.session.deleteMany({ where: { userId } });
    });
  } catch (error) {
    rethrow(error);
  }
  await recordAudit({
    action: "USER_DEACTIVATED",
    outcome: "SUCCESS",
    actorId: actor.id,
    targetType: "user",
    targetId: userId,
    metadata: { clientsReassigned: moved.clients, remindersReassigned: moved.reminders },
  });
  return moved;
}

/**
 * Pone una contraseña temporal (la escribe el administrador y la entrega en persona).
 * Cierra todas las sesiones del usuario y lo obliga a cambiarla al entrar.
 */
export async function resetUserPassword(
  actor: CurrentUser,
  userId: string,
  rawPassword: unknown,
): Promise<void> {
  await requireUserManager(actor);
  forbidSelf(actor, userId);
  const parsed = passwordSchema.safeParse(rawPassword);
  if (!parsed.success) {
    throw new ServiceError("INVALID", `password.${parsed.error.issues[0]?.message ?? "invalid"}`);
  }
  await loadTarget(userId);
  const password = await hashPassword(parsed.data);

  await prisma.$transaction(async (tx) => {
    const account = await tx.account.findFirst({
      where: { userId, providerId: "credential" },
      select: { id: true },
    });
    if (account) {
      await tx.account.update({ where: { id: account.id }, data: { password } });
    } else {
      await tx.account.create({
        data: { id: randomUUID(), userId, accountId: userId, providerId: "credential", password },
      });
    }
    await tx.user.update({ where: { id: userId }, data: { mustChangePassword: true } });
    await tx.session.deleteMany({ where: { userId } });
  });
  await recordAudit({
    action: "USER_PASSWORD_RESET",
    outcome: "SUCCESS",
    actorId: actor.id,
    targetType: "user",
    targetId: userId,
  });
}

/**
 * Reinicia la verificación en dos pasos (p. ej. teléfono perdido): borra el secreto y los
 * códigos de respaldo y cierra sus sesiones. Al entrar deberá configurarla de nuevo.
 */
export async function resetUserTwoFactor(actor: CurrentUser, userId: string): Promise<void> {
  await requireUserManager(actor);
  forbidSelf(actor, userId);
  await loadTarget(userId);
  await prisma.$transaction([
    prisma.twoFactor.deleteMany({ where: { userId } }),
    prisma.user.update({ where: { id: userId }, data: { twoFactorEnabled: false } }),
    prisma.session.deleteMany({ where: { userId } }),
  ]);
  await recordAudit({
    action: "USER_2FA_RESET",
    outcome: "SUCCESS",
    actorId: actor.id,
    targetType: "user",
    targetId: userId,
  });
}
