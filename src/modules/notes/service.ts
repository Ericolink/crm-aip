import "server-only";
import { diffChanges } from "@/lib/activity/diff";
import { recordActivity } from "@/lib/activity/record";
import { recordAudit } from "@/lib/audit/audit-log";
import type { CurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/db";
import { describeDbErrorForLog } from "@/lib/db-errors";
import { PERMISSIONS, type PermissionKey } from "@/lib/permissions/catalog";
import { ServiceError } from "@/lib/service-error";
import { clientVisibilityWhere } from "@/modules/clients/access";
import type { NoteValues } from "./schema";

/**
 * Notas de seguimiento.
 * - Cada nota es un registro independiente: nunca se sobrescriben entre sí.
 * - Editar o quitar una nota deja la versión anterior en el historial (activity_logs,
 *   de solo inserción): el texto anterior nunca se pierde.
 * - Crear: note.create. Editar/quitar: las propias con note.update_own; cualquiera con
 *   note.update_any (Administrador).
 * - Leer: cualquiera que pueda ver al cliente.
 */

async function deny(user: CurrentUser, permission: PermissionKey): Promise<never> {
  await recordAudit({
    action: "ACCESS_DENIED",
    outcome: "DENIED",
    actorId: user.id,
    metadata: { permission },
  });
  throw new ServiceError("FORBIDDEN");
}

function rethrow(error: unknown): never {
  if (error instanceof ServiceError) throw error;
  console.error(`[notes] ${describeDbErrorForLog(error)}`);
  throw new Error("NOTE_SERVICE_FAILURE");
}

/** ¿Puede este usuario editar/quitar esta nota? */
export function canModifyNote(user: CurrentUser, authorId: string): boolean {
  if (user.permissions.has(PERMISSIONS.NOTE_UPDATE_ANY)) return true;
  return authorId === user.id && user.permissions.has(PERMISSIONS.NOTE_UPDATE_OWN);
}

export async function listClientNotes(
  user: CurrentUser,
  clientId: string,
  options: { importantOnly?: boolean } = {},
) {
  if (!user.permissions.has(PERMISSIONS.CLIENT_READ)) return deny(user, PERMISSIONS.CLIENT_READ);
  const client = await prisma.client.findFirst({
    where: { id: clientId, ...clientVisibilityWhere(user) },
    select: {
      id: true,
      notes: {
        where: { deletedAt: null, ...(options.importantOnly ? { isImportant: true } : {}) },
        orderBy: { createdAt: "desc" },
        include: { author: { select: { id: true, name: true } } },
      },
      _count: { select: { notes: { where: { deletedAt: null, isImportant: true } } } },
    },
  });
  if (!client) return null;
  return {
    canCreate: user.permissions.has(PERMISSIONS.NOTE_CREATE),
    importantCount: client._count.notes,
    notes: client.notes.map((n) => ({
      id: n.id,
      body: n.body,
      isImportant: n.isImportant,
      author: n.author,
      createdAt: n.createdAt,
      updatedAt: n.updatedAt,
      /** Editada después de crearla (más de 1 s de diferencia). */
      edited: n.updatedAt.getTime() - n.createdAt.getTime() > 1000,
      canModify: canModifyNote(user, n.author.id),
    })),
  };
}

export type ClientNotes = NonNullable<Awaited<ReturnType<typeof listClientNotes>>>;

/** Última nota importante (para el Resumen del perfil). */
export async function latestImportantNote(user: CurrentUser, clientId: string) {
  return prisma.note.findFirst({
    where: { clientId, deletedAt: null, isImportant: true, client: clientVisibilityWhere(user) },
    orderBy: { createdAt: "desc" },
    select: { id: true, body: true, createdAt: true, author: { select: { name: true } } },
  });
}

export async function createNote(user: CurrentUser, clientId: string, values: NoteValues) {
  if (!user.permissions.has(PERMISSIONS.NOTE_CREATE)) return deny(user, PERMISSIONS.NOTE_CREATE);
  const client = await prisma.client.findFirst({
    where: { id: clientId, ...clientVisibilityWhere(user) },
    select: { id: true },
  });
  if (!client) throw new ServiceError("NOT_FOUND");
  try {
    return await prisma.$transaction(async (tx) => {
      const note = await tx.note.create({
        data: { clientId, authorId: user.id, body: values.body, isImportant: values.isImportant },
      });
      // El texto vive en la nota; el historial solo registra que se creó (y si es importante).
      await recordActivity(tx, {
        clientId,
        actorId: user.id,
        entityType: "note",
        entityId: note.id,
        action: "CREATE",
        changes: { isImportant: { from: null, to: values.isImportant } },
      });
      return note.id;
    });
  } catch (error) {
    return rethrow(error);
  }
}

async function loadModifiableNote(user: CurrentUser, noteId: string) {
  const note = await prisma.note.findFirst({
    where: { id: noteId, deletedAt: null, client: clientVisibilityWhere(user) },
  });
  if (!note) throw new ServiceError("NOT_FOUND");
  if (!canModifyNote(user, note.authorId)) {
    await deny(
      user,
      user.permissions.has(PERMISSIONS.NOTE_UPDATE_OWN)
        ? PERMISSIONS.NOTE_UPDATE_ANY
        : PERMISSIONS.NOTE_UPDATE_OWN,
    );
  }
  return note;
}

/** Edita una nota. La versión anterior queda en el historial (de solo inserción). */
export async function updateNote(user: CurrentUser, noteId: string, values: NoteValues) {
  const note = await loadModifiableNote(user, noteId);
  const changes = diffChanges(note as unknown as Record<string, unknown>, values, {
    fields: ["body", "isImportant"],
  });
  if (!changes) return;
  try {
    await prisma.$transaction(async (tx) => {
      await tx.note.update({
        where: { id: note.id },
        data: { body: values.body, isImportant: values.isImportant },
      });
      await recordActivity(tx, {
        clientId: note.clientId,
        actorId: user.id,
        entityType: "note",
        entityId: note.id,
        action: "UPDATE",
        changes,
      });
    });
  } catch (error) {
    rethrow(error);
  }
}

/** Quita una nota (borrado lógico). Su texto queda en el historial. */
export async function deleteNote(user: CurrentUser, noteId: string) {
  const note = await loadModifiableNote(user, noteId);
  try {
    await prisma.$transaction(async (tx) => {
      await tx.note.update({ where: { id: note.id }, data: { deletedAt: new Date() } });
      await recordActivity(tx, {
        clientId: note.clientId,
        actorId: user.id,
        entityType: "note",
        entityId: note.id,
        action: "DELETE",
        changes: { body: { from: note.body, to: null } },
      });
    });
  } catch (error) {
    rethrow(error);
  }
}
