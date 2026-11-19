import "server-only";
import { recordAudit } from "@/lib/audit/audit-log";
import type { CurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/db";
import { describeDbErrorForLog, toSafeDbError } from "@/lib/db-errors";
import { PERMISSIONS } from "@/lib/permissions/catalog";
import { ServiceError } from "@/lib/service-error";
import { carrierNameSchema } from "./schema";

/**
 * Configuración de aseguradoras y de qué programas ofrece cada una.
 * La relación aseguradora ↔ programa decide qué aseguradoras se ofrecen al registrar
 * una cobertura. Desactivar no borra coberturas existentes: solo deja de ofrecerse.
 */

export async function requireSettingsManager(user: CurrentUser) {
  if (user.permissions.has(PERMISSIONS.SETTINGS_MANAGE)) return;
  await recordAudit({
    action: "ACCESS_DENIED",
    outcome: "DENIED",
    actorId: user.id,
    metadata: { permission: PERMISSIONS.SETTINGS_MANAGE },
  });
  throw new ServiceError("FORBIDDEN");
}

function rethrow(error: unknown): never {
  if (error instanceof ServiceError) throw error;
  if (toSafeDbError(error).kind === "unique_violation") throw new ServiceError("CONFLICT", "name");
  console.error(`[carriers] ${describeDbErrorForLog(error)}`);
  throw new Error("CARRIER_SERVICE_FAILURE");
}

export async function listCarriersWithPrograms(user: CurrentUser) {
  await requireSettingsManager(user);
  const [programs, carriers] = await Promise.all([
    prisma.coverageProgram.findMany({
      orderBy: { sortOrder: "asc" },
      select: { id: true, code: true, nameEs: true, nameEn: true },
    }),
    prisma.insuranceCarrier.findMany({
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        isActive: true,
        programs: { where: { isActive: true }, select: { program: { select: { code: true } } } },
        _count: { select: { insurances: { where: { isCurrent: true, deletedAt: null } } } },
      },
    }),
  ]);
  return {
    programs,
    carriers: carriers.map((c) => ({
      id: c.id,
      name: c.name,
      isActive: c.isActive,
      programCodes: c.programs.map((p) => p.program.code),
      currentCoverages: c._count.insurances,
    })),
  };
}

export async function createCarrier(user: CurrentUser, rawName: unknown): Promise<string> {
  await requireSettingsManager(user);
  const parsed = carrierNameSchema.safeParse(rawName);
  if (!parsed.success) throw new ServiceError("INVALID", "name");
  try {
    const carrier = await prisma.insuranceCarrier.create({ data: { name: parsed.data } });
    await recordAudit({
      action: "CARRIER_CREATED",
      outcome: "SUCCESS",
      actorId: user.id,
      targetType: "carrier",
      targetId: carrier.id,
    });
    return carrier.id;
  } catch (error) {
    return rethrow(error);
  }
}

export async function updateCarrier(
  user: CurrentUser,
  carrierId: string,
  input: { name?: unknown; isActive?: boolean },
): Promise<void> {
  await requireSettingsManager(user);
  const existing = await prisma.insuranceCarrier.findUnique({ where: { id: carrierId } });
  if (!existing) throw new ServiceError("NOT_FOUND");

  const data: { name?: string; isActive?: boolean } = {};
  if (input.name !== undefined) {
    const parsed = carrierNameSchema.safeParse(input.name);
    if (!parsed.success) throw new ServiceError("INVALID", "name");
    data.name = parsed.data;
  }
  if (input.isActive !== undefined) data.isActive = input.isActive;

  try {
    await prisma.insuranceCarrier.update({ where: { id: carrierId }, data });
    await recordAudit({
      action: "CARRIER_UPDATED",
      outcome: "SUCCESS",
      actorId: user.id,
      targetType: "carrier",
      targetId: carrierId,
      metadata: {
        renamed: data.name !== undefined && data.name !== existing.name,
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
      },
    });
  } catch (error) {
    rethrow(error);
  }
}

/** Activa o desactiva que una aseguradora ofrezca un programa. */
export async function setCarrierProgram(
  user: CurrentUser,
  carrierId: string,
  programCode: string,
  enabled: boolean,
): Promise<void> {
  await requireSettingsManager(user);
  const [carrier, program] = await Promise.all([
    prisma.insuranceCarrier.findUnique({ where: { id: carrierId }, select: { id: true } }),
    prisma.coverageProgram.findUnique({ where: { code: programCode }, select: { id: true } }),
  ]);
  if (!carrier || !program) throw new ServiceError("NOT_FOUND");

  await prisma.carrierProgram.upsert({
    where: { carrierId_programId: { carrierId, programId: program.id } },
    create: { carrierId, programId: program.id, isActive: enabled },
    update: { isActive: enabled },
  });
  await recordAudit({
    action: "CARRIER_PROGRAM_CHANGED",
    outcome: "SUCCESS",
    actorId: user.id,
    targetType: "carrier",
    targetId: carrierId,
    metadata: { program: programCode, enabled },
  });
}

/** Aseguradoras ACTIVAS que ofrecen (relación ACTIVA) cada programa. Para formularios de cobertura. */
export async function carriersByProgram(): Promise<Record<string, { id: string; name: string }[]>> {
  const links = await prisma.carrierProgram.findMany({
    where: { isActive: true, carrier: { isActive: true } },
    orderBy: { carrier: { name: "asc" } },
    select: { program: { select: { code: true } }, carrier: { select: { id: true, name: true } } },
  });
  const map: Record<string, { id: string; name: string }[]> = {};
  for (const l of links) (map[l.program.code] ??= []).push(l.carrier);
  return map;
}

/** ¿La aseguradora está activa y ofrece (activo) el programa? Regla para registrar coberturas. */
export async function carrierOffersProgram(carrierId: string, programId: string): Promise<boolean> {
  const link = await prisma.carrierProgram.findFirst({
    where: { carrierId, programId, isActive: true, carrier: { isActive: true } },
    select: { carrierId: true },
  });
  return Boolean(link);
}
