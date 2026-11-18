import "server-only";
import type { ActivityAction, Prisma } from "@/generated/prisma/client";
import type { ChangeSet } from "./diff";

export type ActivityEntityType =
  | "client"
  | "enrollment"
  | "insurance"
  | "condition"
  | "doctor"
  | "medication"
  | "note"
  | "reminder"
  | "consent"
  | "document";

export type ActivityEntry = {
  clientId: string | null;
  actorId: string | null;
  entityType: ActivityEntityType;
  entityId: string;
  action: ActivityAction;
  changes?: ChangeSet | null;
};

/**
 * Registra un cambio en el historial DENTRO de la misma transacción que el cambio.
 * Si la escritura falla, el historial tampoco se guarda (y viceversa): nunca quedan desfasados.
 */
export async function recordActivity(tx: Prisma.TransactionClient, entry: ActivityEntry) {
  await tx.activityLog.create({
    data: {
      clientId: entry.clientId,
      actorId: entry.actorId,
      entityType: entry.entityType,
      entityId: entry.entityId,
      action: entry.action,
      changes: entry.changes ?? undefined,
    },
  });
}
