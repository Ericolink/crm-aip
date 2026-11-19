import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { recordAudit } from "@/lib/audit/audit-log";
import { AUDIT_ACTIONS, type AuditAction } from "@/lib/audit/sanitize";
import type { CurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/db";
import { PERMISSIONS } from "@/lib/permissions/catalog";
import { ServiceError } from "@/lib/service-error";
import { zonedLocalToUtc } from "@/lib/timezone";

/**
 * Visor de la bitácora de auditoría (solo lectura, permiso audit.read).
 * La bitácora es de solo inserción y nunca contiene PHI (ver src/lib/audit/sanitize.ts):
 * aquí solo se consulta. Consultarla también queda registrado.
 */

export const AUDIT_OUTCOMES = ["SUCCESS", "FAILURE", "DENIED"] as const;
const PAGE = 50;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export type AuditFilters = {
  from?: string;
  to?: string;
  action?: AuditAction;
  outcome?: (typeof AUDIT_OUTCOMES)[number];
  actorId?: string;
  before?: string;
};

/** Lee los filtros de la URL: cualquier valor desconocido se ignora. */
export function parseAuditFilters(sp: Record<string, string | string[] | undefined>): AuditFilters {
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const action = one("action");
  const outcome = one("outcome");
  const actorId = one("actor");
  return {
    from: DATE.test(one("from") ?? "") ? one("from") : undefined,
    to: DATE.test(one("to") ?? "") ? one("to") : undefined,
    action: (AUDIT_ACTIONS as readonly string[]).includes(action ?? "")
      ? (action as AuditAction)
      : undefined,
    outcome: (AUDIT_OUTCOMES as readonly string[]).includes(outcome ?? "")
      ? (outcome as AuditFilters["outcome"])
      : undefined,
    actorId: actorId && /^[A-Za-z0-9-]{8,64}$/.test(actorId) ? actorId : undefined,
    before: one("before"),
  };
}

function parseCursor(cursor: string | undefined): { createdAt: Date; id: string } | null {
  if (!cursor) return null;
  const [iso, id] = cursor.split("_");
  const createdAt = new Date(iso ?? "");
  if (Number.isNaN(createdAt.getTime()) || !id || !/^[a-z0-9]{10,40}$/i.test(id)) return null;
  return { createdAt, id };
}

async function requireAuditReader(user: CurrentUser) {
  if (user.permissions.has(PERMISSIONS.AUDIT_READ)) return;
  await recordAudit({
    action: "ACCESS_DENIED",
    outcome: "DENIED",
    actorId: user.id,
    metadata: { permission: PERMISSIONS.AUDIT_READ },
  });
  throw new ServiceError("FORBIDDEN");
}

export async function listAuditLog(user: CurrentUser, filters: AuditFilters) {
  await requireAuditReader(user);

  // Las fechas del filtro son días completos en la hora del negocio (ET).
  const from = filters.from ? zonedLocalToUtc(`${filters.from}T00:00`) : null;
  const toStart = filters.to ? zonedLocalToUtc(`${filters.to}T00:00`) : null;
  const to = toStart ? new Date(toStart.getTime() + 24 * 3_600_000) : null;
  const cursor = parseCursor(filters.before);

  const where: Prisma.AuditLogWhereInput = {
    ...(filters.action ? { action: filters.action } : {}),
    ...(filters.outcome ? { outcome: filters.outcome } : {}),
    ...(filters.actorId ? { actorId: filters.actorId } : {}),
    ...(from || to
      ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) } }
      : {}),
    ...(cursor
      ? {
          OR: [
            { createdAt: { lt: cursor.createdAt } },
            { createdAt: cursor.createdAt, id: { lt: cursor.id } },
          ],
        }
      : {}),
  };

  const [rows, actors] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: PAGE + 1,
      select: {
        id: true,
        createdAt: true,
        action: true,
        outcome: true,
        targetType: true,
        targetId: true,
        ipAddress: true,
        metadata: true,
        actor: { select: { id: true, name: true } },
      },
    }),
    prisma.user.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  // Consultar la bitácora también se registra (una vez por minuto y filtro).
  await recordAudit({
    action: "AUDIT_VIEWED",
    outcome: "SUCCESS",
    actorId: user.id,
    metadata: {
      action: filters.action ?? null,
      outcome: filters.outcome ?? null,
      byUser: Boolean(filters.actorId),
      from: filters.from ?? null,
      to: filters.to ?? null,
    },
    dedupeWindowSeconds: 60,
  });

  const page = rows.slice(0, PAGE);
  const last = page.at(-1);
  return {
    entries: page.map((r) => ({
      ...r,
      metadata: (r.metadata as Record<string, string | number | boolean | null> | null) ?? null,
    })),
    nextCursor:
      rows.length > PAGE && last ? `${last.createdAt.toISOString()}_${last.id}` : undefined,
    actors,
  };
}
