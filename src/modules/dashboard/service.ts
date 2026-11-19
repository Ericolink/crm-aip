import "server-only";
import type { CurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/db";
import { parseDateOnly } from "@/lib/format";
import { PERMISSIONS } from "@/lib/permissions/catalog";
import { visibleEntityTypes } from "@/modules/activity/service";
import { clientVisibilityWhere } from "@/modules/clients/access";

/**
 * Datos del panel principal. Todo se calcula con la MISMA visibilidad que la lista de
 * clientes (agente: los suyos; asistente: los de sus agentes vinculados; admin: todos)
 * y respetando permisos: sin `insurance.read` no hay datos de cobertura; la actividad
 * reciente se filtra igual que el historial del cliente.
 * Se calcula en cada petición: los indicadores siempre están al día.
 */

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** Hoy (día de Florida) como fecha DATE en UTC. */
function todayDateOnly(): Date {
  return parseDateOnly(
    new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date()),
  )!;
}

export async function getDashboard(user: CurrentUser) {
  const visible = clientVisibilityWhere(user);
  const seesInsurance = user.permissions.has(PERMISSIONS.INSURANCE_READ);
  const weekAgo = new Date(Date.now() - WEEK_MS);
  const today = todayDateOnly();
  const visibleClient = { client: visible };

  const [statusGroups, newThisWeek, recentClients, followUps, overdueCount, activity] =
    await Promise.all([
      prisma.client.groupBy({ by: ["status"], where: visible, _count: { _all: true } }),
      prisma.client.count({ where: { ...visible, createdAt: { gte: weekAgo } } }),
      prisma.client.findMany({
        where: visible,
        orderBy: { createdAt: "desc" },
        take: 5,
        select: { id: true, firstName: true, lastName: true, status: true, createdAt: true },
      }),
      prisma.reminder.findMany({
        where: { status: "PENDING", ...visibleClient },
        orderBy: { dueAt: "asc" },
        take: 6,
        select: {
          id: true,
          description: true,
          dueAt: true,
          priority: true,
          assignedTo: { select: { name: true } },
          client: { select: { id: true, firstName: true, lastName: true, primaryPhone: true } },
        },
      }),
      prisma.reminder.count({
        where: { status: "PENDING", dueAt: { lt: new Date() }, ...visibleClient },
      }),
      prisma.activityLog.findMany({
        where: { entityType: { in: visibleEntityTypes(user) }, client: visible },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 8,
        select: {
          id: true,
          createdAt: true,
          entityType: true,
          action: true,
          actor: { select: { name: true } },
          client: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
    ]);

  // Datos de cobertura: solo con permiso (si no, ni se consultan).
  const coverage = seesInsurance
    ? await Promise.all([
        prisma.clientProgramEnrollment.groupBy({
          by: ["programId"],
          where: { deletedAt: null, ...visibleClient },
          _count: { _all: true },
        }),
        prisma.coverageProgram.findMany({
          where: { isActive: true },
          orderBy: { sortOrder: "asc" },
          select: { id: true, code: true, nameEs: true, nameEn: true },
        }),
        prisma.clientInsurance.findMany({
          where: {
            isCurrent: true,
            deletedAt: null,
            status: "APPLICATION_PENDING",
            ...visibleClient,
          },
          orderBy: { applicationSubmittedAt: { sort: "asc", nulls: "last" } },
          take: 5,
          select: {
            id: true,
            applicationSubmittedAt: true,
            carrier: { select: { name: true } },
            program: { select: { code: true } },
            client: { select: { id: true, firstName: true, lastName: true } },
          },
        }),
        prisma.clientInsurance.count({
          where: {
            isCurrent: true,
            deletedAt: null,
            status: "APPLICATION_PENDING",
            ...visibleClient,
          },
        }),
        prisma.clientInsurance.findMany({
          where: {
            isCurrent: true,
            deletedAt: null,
            effectiveDate: { gte: today },
            ...visibleClient,
          },
          orderBy: { effectiveDate: "asc" },
          take: 5,
          select: {
            id: true,
            effectiveDate: true,
            status: true,
            carrier: { select: { name: true } },
            program: { select: { code: true } },
            client: { select: { id: true, firstName: true, lastName: true } },
          },
        }),
      ])
    : null;

  const statusCounts = Object.fromEntries(
    statusGroups.map((g) => [g.status, g._count._all]),
  ) as Record<string, number>;
  const total = Object.values(statusCounts).reduce((a, b) => a + b, 0);

  return {
    /** Momento del cálculo: la página lo usa para "hoy", "mañana" y fechas relativas. */
    now: new Date(),
    total,
    newThisWeek,
    statusCounts: {
      NEW: statusCounts.NEW ?? 0,
      PENDING: statusCounts.PENDING ?? 0,
      ACTIVE: statusCounts.ACTIVE ?? 0,
      URGENT: statusCounts.URGENT ?? 0,
    },
    recentClients,
    followUps: followUps.map((r) => ({ ...r, overdue: r.dueAt < new Date() })),
    overdueCount,
    activity,
    coverage: coverage
      ? {
          programs: coverage[1].map((p) => ({
            code: p.code,
            name: { es: p.nameEs, en: p.nameEn },
            count: coverage[0].find((g) => g.programId === p.id)?._count._all ?? 0,
          })),
          pendingApplications: coverage[2].map((i) => ({
            ...i,
            daysWaiting: i.applicationSubmittedAt
              ? Math.max(
                  0,
                  Math.floor((today.getTime() - i.applicationSubmittedAt.getTime()) / 86_400_000),
                )
              : null,
          })),
          pendingApplicationsCount: coverage[3],
          upcomingEffective: coverage[4],
        }
      : null,
  };
}

export type DashboardData = Awaited<ReturnType<typeof getDashboard>>;
