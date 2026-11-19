import "server-only";
import type { CurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { PERMISSIONS } from "@/lib/permissions/catalog";

/** Últimas importaciones y exportaciones. Con `audit.read` se ven las de todos; si no, las propias. */
export async function listRecentJobs(user: CurrentUser, take = 10) {
  const who = user.permissions.has(PERMISSIONS.AUDIT_READ) ? {} : { createdById: user.id };
  const [imports, exports] = await Promise.all([
    user.permissions.has(PERMISSIONS.DATA_IMPORT)
      ? prisma.importJob.findMany({
          where: who,
          orderBy: { createdAt: "desc" },
          take,
          select: {
            id: true,
            createdAt: true,
            fileName: true,
            status: true,
            totalRows: true,
            importedRows: true,
            createdBy: { select: { name: true } },
          },
        })
      : [],
    user.permissions.has(PERMISSIONS.DATA_EXPORT)
      ? prisma.exportJob.findMany({
          where: who,
          orderBy: { createdAt: "desc" },
          take,
          select: {
            id: true,
            createdAt: true,
            format: true,
            rowCount: true,
            includesSensitive: true,
            createdBy: { select: { name: true } },
          },
        })
      : [],
  ]);
  return { imports, exports };
}
