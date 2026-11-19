import "server-only";
import { recordAudit } from "@/lib/audit/audit-log";
import type { CurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/db";
import { PERMISSIONS, type PermissionKey } from "@/lib/permissions/catalog";
import { ServiceError } from "@/lib/service-error";
import type { Prisma } from "@/generated/prisma/client";
import { clientVisibilityWhere } from "@/modules/clients/access";

/**
 * Historial de actividad del cliente (activity_logs, de solo inserción).
 * Cada tipo de registro exige el mismo permiso que su sección: un usuario nunca ve en el
 * historial lo que no puede ver en el perfil (p. ej. el Asistente no ve cambios médicos).
 */

export const ACTIVITY_CATEGORIES = ["client", "insurance", "medical", "notes"] as const;
export type ActivityCategory = (typeof ACTIVITY_CATEGORIES)[number];

const ENTITY_RULES: Record<string, { category: ActivityCategory; permission: PermissionKey }> = {
  client: { category: "client", permission: PERMISSIONS.CLIENT_READ },
  consent: { category: "client", permission: PERMISSIONS.CLIENT_READ },
  document: { category: "client", permission: PERMISSIONS.CLIENT_READ },
  enrollment: { category: "insurance", permission: PERMISSIONS.INSURANCE_READ },
  insurance: { category: "insurance", permission: PERMISSIONS.INSURANCE_READ },
  condition: { category: "medical", permission: PERMISSIONS.MEDICAL_READ },
  doctor: { category: "medical", permission: PERMISSIONS.MEDICAL_READ },
  medication: { category: "medical", permission: PERMISSIONS.MEDICAL_READ },
  note: { category: "notes", permission: PERMISSIONS.CLIENT_READ },
  reminder: { category: "notes", permission: PERMISSIONS.CLIENT_READ },
};

/** Tipos de registro que el usuario puede ver, opcionalmente de una sola categoría. */
export function visibleEntityTypes(
  user: { permissions: ReadonlySet<PermissionKey> },
  category?: ActivityCategory,
) {
  return Object.entries(ENTITY_RULES)
    .filter(
      ([, rule]) =>
        user.permissions.has(rule.permission) && (!category || rule.category === category),
    )
    .map(([type]) => type);
}

/** Categorías con al menos un tipo visible (para mostrar los filtros). */
export function visibleCategories(user: {
  permissions: ReadonlySet<PermissionKey>;
}): ActivityCategory[] {
  return ACTIVITY_CATEGORIES.filter((c) => visibleEntityTypes(user, c).length > 0);
}

const PAGE = 30;

/** Cursor estable para paginar hacia atrás: "<ISO>_<id>". */
function parseCursor(cursor: string | undefined): { createdAt: Date; id: string } | null {
  if (!cursor) return null;
  const [iso, id] = cursor.split("_");
  const createdAt = new Date(iso ?? "");
  if (Number.isNaN(createdAt.getTime()) || !id || !/^[a-z0-9]{10,40}$/i.test(id)) return null;
  return { createdAt, id };
}

export async function listClientActivity(
  user: CurrentUser,
  clientId: string,
  options: { category?: ActivityCategory; before?: string } = {},
) {
  if (!user.permissions.has(PERMISSIONS.CLIENT_READ)) {
    await recordAudit({
      action: "ACCESS_DENIED",
      outcome: "DENIED",
      actorId: user.id,
      metadata: { permission: PERMISSIONS.CLIENT_READ },
    });
    throw new ServiceError("FORBIDDEN");
  }
  const client = await prisma.client.findFirst({
    where: { id: clientId, ...clientVisibilityWhere(user) },
    select: { id: true },
  });
  if (!client) return null;

  const cursor = parseCursor(options.before);
  const where: Prisma.ActivityLogWhereInput = {
    clientId,
    entityType: { in: visibleEntityTypes(user, options.category) },
    ...(cursor
      ? {
          OR: [
            { createdAt: { lt: cursor.createdAt } },
            { createdAt: cursor.createdAt, id: { lt: cursor.id } },
          ],
        }
      : {}),
  };
  const rows = await prisma.activityLog.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: PAGE + 1,
    include: { actor: { select: { name: true } } },
  });
  const page = rows.slice(0, PAGE);
  const last = page.at(-1);

  // Los cambios de agente asignado guardan ids: se muestran con el nombre.
  const agentIds = new Set<string>();
  for (const r of page) {
    const change = (r.changes as Record<string, { from?: unknown; to?: unknown }> | null)
      ?.assignedAgentId;
    for (const v of [change?.from, change?.to]) if (typeof v === "string") agentIds.add(v);
  }
  const agents = agentIds.size
    ? Object.fromEntries(
        (
          await prisma.user.findMany({
            where: { id: { in: [...agentIds] } },
            select: { id: true, name: true },
          })
        ).map((u) => [u.id, u.name]),
      )
    : {};

  return {
    categories: visibleCategories(user),
    entries: page.map((r) => ({
      id: r.id,
      createdAt: r.createdAt,
      actorName: r.actor?.name ?? null,
      entityType: r.entityType,
      category: ENTITY_RULES[r.entityType]?.category ?? "client",
      action: r.action,
      changes: (r.changes ?? null) as Record<
        string,
        { from?: unknown; to?: unknown; changed?: true }
      > | null,
    })),
    agentNames: agents as Record<string, string>,
    nextCursor: rows.length > PAGE && last ? `${last.createdAt.toISOString()}_${last.id}` : null,
  };
}

export type ClientActivity = NonNullable<Awaited<ReturnType<typeof listClientActivity>>>;
