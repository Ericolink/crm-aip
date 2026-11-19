import "server-only";
import { diffChanges } from "@/lib/activity/diff";
import { recordActivity } from "@/lib/activity/record";
import { recordAudit } from "@/lib/audit/audit-log";
import { loadCurrentUser, type CurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/db";
import { describeDbErrorForLog } from "@/lib/db-errors";
import { PERMISSIONS } from "@/lib/permissions/catalog";
import { ServiceError } from "@/lib/service-error";
import { utcToZonedLocal, zonedLocalToUtc } from "@/lib/timezone";
import type { Prisma } from "@/generated/prisma/client";
import { clientVisibilityWhere, visibleAgentIds } from "@/modules/clients/access";
import type { ReminderValues } from "./schema";

/**
 * Recordatorios de seguimiento.
 * - Permiso `reminder.manage` (Agente, Asistente, Administrador), siempre dentro de los
 *   clientes visibles para el usuario.
 * - El responsable debe poder ver al cliente y gestionar recordatorios: nunca se asigna a
 *   alguien sin acceso a ese cliente.
 * - Solo los pendientes se editan; completados y cancelados son de solo lectura.
 * - Notificaciones futuras (correo/WhatsApp): ver ADR 0015.
 */

export const REMINDER_VIEWS = ["pending", "overdue", "done", "cancelled"] as const;
export type ReminderView = (typeof REMINDER_VIEWS)[number];

async function requireManage(user: CurrentUser) {
  if (user.permissions.has(PERMISSIONS.REMINDER_MANAGE)) return;
  await recordAudit({
    action: "ACCESS_DENIED",
    outcome: "DENIED",
    actorId: user.id,
    metadata: { permission: PERMISSIONS.REMINDER_MANAGE },
  });
  throw new ServiceError("FORBIDDEN");
}

function rethrow(error: unknown): never {
  if (error instanceof ServiceError) throw error;
  console.error(`[reminders] ${describeDbErrorForLog(error)}`);
  throw new Error("REMINDER_SERVICE_FAILURE");
}

/** ¿Este usuario (por id) puede ver al cliente y gestionar recordatorios? Se evalúa con datos frescos. */
async function canHandleClientReminders(
  userId: string,
  client: { assignedAgentId: string | null },
) {
  const candidate = await loadCurrentUser(userId);
  if (!candidate?.isActive || !candidate.permissions.has(PERMISSIONS.REMINDER_MANAGE)) return false;
  if (candidate.permissions.has(PERMISSIONS.CLIENT_READ_ALL)) return true;
  return (
    client.assignedAgentId !== null && visibleAgentIds(candidate).includes(client.assignedAgentId)
  );
}

async function loadVisibleClient(user: CurrentUser, clientId: string) {
  const client = await prisma.client.findFirst({
    where: { id: clientId, ...clientVisibilityWhere(user) },
    select: { id: true, assignedAgentId: true },
  });
  if (!client) throw new ServiceError("NOT_FOUND");
  return client;
}

/** Personas a las que se puede asignar un recordatorio de este cliente. */
export async function assignableUsers(user: CurrentUser, clientId: string) {
  await requireManage(user);
  const client = await loadVisibleClient(user, clientId);
  const candidates = await prisma.user.findMany({
    where: {
      isActive: true,
      OR: [
        { id: user.id },
        { role: { permissions: { some: { permission: { key: PERMISSIONS.CLIENT_READ_ALL } } } } },
        ...(client.assignedAgentId
          ? [
              { id: client.assignedAgentId },
              { assistantLinks: { some: { agentId: client.assignedAgentId, isActive: true } } },
            ]
          : []),
      ],
      role: { permissions: { some: { permission: { key: PERMISSIONS.REMINDER_MANAGE } } } },
    },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  return candidates;
}

const reminderSelect = {
  id: true,
  description: true,
  dueAt: true,
  priority: true,
  status: true,
  completedAt: true,
  cancelledAt: true,
  createdAt: true,
  assignedTo: { select: { id: true, name: true } },
  createdBy: { select: { name: true } },
  client: { select: { id: true, firstName: true, lastName: true, primaryPhone: true } },
} satisfies Prisma.ReminderSelect;

function toDto(r: Prisma.ReminderGetPayload<{ select: typeof reminderSelect }>, now: Date) {
  return {
    ...r,
    overdue: r.status === "PENDING" && r.dueAt < now,
    /** Valor para <input type="datetime-local"> en hora de Florida. */
    dueAtLocal: utcToZonedLocal(r.dueAt),
  };
}
export type ReminderDto = ReturnType<typeof toDto>;

function viewWhere(view: ReminderView, now: Date): Prisma.ReminderWhereInput {
  switch (view) {
    case "overdue":
      return { status: "PENDING", dueAt: { lt: now } };
    case "done":
      return { status: "DONE" };
    case "cancelled":
      return { status: "CANCELLED" };
    default:
      return { status: "PENDING" };
  }
}

/** Lista para la página de recordatorios (o la de un cliente). */
export async function listReminders(
  user: CurrentUser,
  options: { view?: ReminderView; mine?: boolean; clientId?: string; limit?: number } = {},
) {
  await requireManage(user);
  const now = new Date();
  const view = options.view ?? "pending";
  const where: Prisma.ReminderWhereInput = {
    ...viewWhere(view, now),
    client: clientVisibilityWhere(user),
    ...(options.mine ? { assignedToId: user.id } : {}),
    ...(options.clientId ? { clientId: options.clientId } : {}),
  };
  const pendingWhere: Prisma.ReminderWhereInput = {
    client: clientVisibilityWhere(user),
    ...(options.mine ? { assignedToId: user.id } : {}),
    ...(options.clientId ? { clientId: options.clientId } : {}),
  };
  const [rows, counts] = await Promise.all([
    prisma.reminder.findMany({
      where,
      // Pendientes: lo más próximo primero. Historial: lo más reciente primero.
      orderBy:
        view === "pending" || view === "overdue" ? [{ dueAt: "asc" }] : [{ updatedAt: "desc" }],
      take: options.limit ?? 100,
      select: reminderSelect,
    }),
    Promise.all(
      REMINDER_VIEWS.map((v) =>
        prisma.reminder.count({ where: { ...pendingWhere, ...viewWhere(v, now) } }),
      ),
    ),
  ]);
  return {
    now,
    reminders: rows.map((r) => toDto(r, now)),
    counts: Object.fromEntries(REMINDER_VIEWS.map((v, i) => [v, counts[i]])) as Record<
      ReminderView,
      number
    >,
  };
}

/** Recordatorios vencidos ASIGNADOS al usuario (para el contador del menú). */
export async function overdueCountForUser(user: CurrentUser): Promise<number> {
  if (!user.permissions.has(PERMISSIONS.REMINDER_MANAGE)) return 0;
  return prisma.reminder.count({
    where: {
      assignedToId: user.id,
      status: "PENDING",
      dueAt: { lt: new Date() },
      client: clientVisibilityWhere(user),
    },
  });
}

/** Clientes visibles por nombre (para elegir el cliente al crear desde la página general). */
export async function searchClientsForReminder(user: CurrentUser, query: string) {
  await requireManage(user);
  const words = query
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[%_\\]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 4);
  if (!words.length || words.join("").length < 2) return [];
  return prisma.client.findMany({
    where: {
      ...clientVisibilityWhere(user),
      AND: words.map((w) => ({ searchName: { contains: w } })),
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    take: 8,
    select: { id: true, firstName: true, lastName: true },
  });
}

const DIFF = { fields: ["description", "dueAt", "priority", "assignedTo", "status"] as const };

async function resolveAssignee(
  user: CurrentUser,
  client: { assignedAgentId: string | null },
  requested: string | undefined,
  fallback: string,
) {
  const assigneeId = requested ?? fallback;
  if (assigneeId === user.id) return { id: user.id, name: user.name };
  if (!(await canHandleClientReminders(assigneeId, client))) {
    throw new ServiceError("INVALID", "assignedToId");
  }
  const assignee = await prisma.user.findUniqueOrThrow({
    where: { id: assigneeId },
    select: { id: true, name: true },
  });
  return assignee;
}

export async function createReminder(user: CurrentUser, clientId: string, values: ReminderValues) {
  await requireManage(user);
  const client = await loadVisibleClient(user, clientId);
  const assignee = await resolveAssignee(user, client, values.assignedToId, user.id);
  const dueAt = zonedLocalToUtc(values.dueAt)!;

  try {
    return await prisma.$transaction(async (tx) => {
      const reminder = await tx.reminder.create({
        data: {
          clientId,
          assignedToId: assignee.id,
          createdById: user.id,
          description: values.description,
          dueAt,
          priority: values.priority,
        },
      });
      await recordActivity(tx, {
        clientId,
        actorId: user.id,
        entityType: "reminder",
        entityId: reminder.id,
        action: "CREATE",
        changes: diffChanges(
          null,
          {
            description: values.description,
            dueAt,
            priority: values.priority,
            assignedTo: assignee.name,
          },
          DIFF,
        ),
      });
      return reminder.id;
    });
  } catch (error) {
    return rethrow(error);
  }
}

async function loadVisibleReminder(user: CurrentUser, reminderId: string) {
  const reminder = await prisma.reminder.findFirst({
    where: { id: reminderId, client: clientVisibilityWhere(user) },
    include: {
      assignedTo: { select: { id: true, name: true } },
      client: { select: { assignedAgentId: true } },
    },
  });
  if (!reminder) throw new ServiceError("NOT_FOUND");
  return reminder;
}

/** Edita (o pospone) un recordatorio PENDIENTE. */
export async function updateReminder(
  user: CurrentUser,
  reminderId: string,
  values: ReminderValues,
) {
  await requireManage(user);
  const current = await loadVisibleReminder(user, reminderId);
  if (current.status !== "PENDING") throw new ServiceError("INVALID", "status");
  const assignee =
    values.assignedToId && values.assignedToId !== current.assignedToId
      ? await resolveAssignee(user, current.client, values.assignedToId, current.assignedToId)
      : current.assignedTo;
  const dueAt = zonedLocalToUtc(values.dueAt)!;
  const changes = diffChanges(
    {
      description: current.description,
      dueAt: current.dueAt,
      priority: current.priority,
      assignedTo: current.assignedTo.name,
    },
    {
      description: values.description,
      dueAt,
      priority: values.priority,
      assignedTo: assignee.name,
    },
    DIFF,
  );
  if (!changes) return;

  try {
    await prisma.$transaction(async (tx) => {
      await tx.reminder.update({
        where: { id: current.id },
        data: {
          description: values.description,
          dueAt,
          priority: values.priority,
          assignedToId: assignee.id,
        },
      });
      await recordActivity(tx, {
        clientId: current.clientId,
        actorId: user.id,
        entityType: "reminder",
        entityId: current.id,
        action: "UPDATE",
        changes,
      });
    });
  } catch (error) {
    rethrow(error);
  }
}

/** Completa o cancela un recordatorio pendiente. */
export async function closeReminder(
  user: CurrentUser,
  reminderId: string,
  status: "DONE" | "CANCELLED",
) {
  await requireManage(user);
  const current = await loadVisibleReminder(user, reminderId);
  if (current.status !== "PENDING") throw new ServiceError("INVALID", "status");
  const now = new Date();
  try {
    await prisma.$transaction(async (tx) => {
      await tx.reminder.update({
        where: { id: current.id },
        data: status === "DONE" ? { status, completedAt: now } : { status, cancelledAt: now },
      });
      await recordActivity(tx, {
        clientId: current.clientId,
        actorId: user.id,
        entityType: "reminder",
        entityId: current.id,
        action: "UPDATE",
        changes: { status: { from: "PENDING", to: status } },
      });
    });
  } catch (error) {
    rethrow(error);
  }
}
