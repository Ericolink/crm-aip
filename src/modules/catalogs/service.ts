import "server-only";
import { recordAudit } from "@/lib/audit/audit-log";
import type { CurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/db";
import { describeDbErrorForLog, toSafeDbError } from "@/lib/db-errors";
import { ServiceError } from "@/lib/service-error";
import { requireSettingsManager } from "@/modules/carriers/service";
import {
  conditionSchema,
  consentCodeFromName,
  consentTypeSchema,
  type ConditionInput,
  type ConsentTypeInput,
} from "./schema";

/**
 * Catálogos de Configuración (settings.manage): condiciones crónicas y tipos de consentimiento.
 * Nunca se borran: se desactivan. Desactivar no quita nada a los clientes que ya los tienen,
 * solo deja de ofrecerse en registros nuevos.
 */

function rethrow(error: unknown, scope: string): never {
  if (error instanceof ServiceError) throw error;
  const safe = toSafeDbError(error);
  if (safe.kind === "unique_violation") {
    throw new ServiceError("CONFLICT", safe.constraint?.includes("nameEn") ? "nameEn" : "nameEs");
  }
  console.error(`[${scope}] ${describeDbErrorForLog(error)}`);
  throw new Error("CATALOG_SERVICE_FAILURE");
}

async function audit(
  user: CurrentUser,
  action: "CATALOG_ITEM_CREATED" | "CATALOG_ITEM_UPDATED",
  targetType: "chronic_condition" | "consent_type",
  targetId: string,
  metadata?: Record<string, unknown>,
) {
  await recordAudit({
    action,
    outcome: "SUCCESS",
    actorId: user.id,
    targetType,
    targetId,
    metadata,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Condiciones crónicas
// ─────────────────────────────────────────────────────────────────────────────

export async function listConditions(user: CurrentUser) {
  await requireSettingsManager(user);
  const rows = await prisma.chronicCondition.findMany({
    orderBy: [{ sortOrder: "asc" }, { nameEs: "asc" }],
    select: {
      id: true,
      nameEs: true,
      nameEn: true,
      isActive: true,
      _count: { select: { clients: { where: { deletedAt: null, client: { deletedAt: null } } } } },
    },
  });
  return rows.map(({ _count, ...c }) => ({ ...c, clients: _count.clients }));
}

export async function createCondition(user: CurrentUser, input: ConditionInput): Promise<string> {
  await requireSettingsManager(user);
  const parsed = conditionSchema.safeParse(input);
  if (!parsed.success) throw new ServiceError("INVALID");
  try {
    const last = await prisma.chronicCondition.aggregate({ _max: { sortOrder: true } });
    const created = await prisma.chronicCondition.create({
      data: { ...parsed.data, sortOrder: (last._max.sortOrder ?? 0) + 1 },
    });
    await audit(user, "CATALOG_ITEM_CREATED", "chronic_condition", created.id);
    return created.id;
  } catch (error) {
    return rethrow(error, "conditions");
  }
}

export async function updateCondition(
  user: CurrentUser,
  id: string,
  input: Partial<ConditionInput> & { isActive?: boolean },
): Promise<void> {
  await requireSettingsManager(user);
  const existing = await prisma.chronicCondition.findUnique({ where: { id } });
  if (!existing) throw new ServiceError("NOT_FOUND");
  const parsed = conditionSchema
    .partial()
    .safeParse({ nameEs: input.nameEs, nameEn: input.nameEn });
  if (!parsed.success) throw new ServiceError("INVALID");
  const data = {
    ...parsed.data,
    ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
  };
  try {
    await prisma.chronicCondition.update({ where: { id }, data });
  } catch (error) {
    rethrow(error, "conditions");
  }
  await audit(user, "CATALOG_ITEM_UPDATED", "chronic_condition", id, {
    renamed:
      (data.nameEs !== undefined && data.nameEs !== existing.nameEs) ||
      (data.nameEn !== undefined && data.nameEn !== existing.nameEn),
    ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
  });
}

/** Sube o baja una condición en el orden en que aparece en el formulario del cliente. */
export async function moveCondition(
  user: CurrentUser,
  id: string,
  direction: "up" | "down",
): Promise<void> {
  await requireSettingsManager(user);
  const all = await prisma.chronicCondition.findMany({
    orderBy: [{ sortOrder: "asc" }, { nameEs: "asc" }],
    select: { id: true },
  });
  const index = all.findIndex((c) => c.id === id);
  if (index === -1) throw new ServiceError("NOT_FOUND");
  const swap = direction === "up" ? index - 1 : index + 1;
  if (swap < 0 || swap >= all.length) return;
  [all[index], all[swap]] = [all[swap], all[index]];
  // Renumera todo (1..n): así el orden queda limpio aunque hubiera empates.
  await prisma.$transaction(
    all.map((c, i) =>
      prisma.chronicCondition.update({ where: { id: c.id }, data: { sortOrder: i + 1 } }),
    ),
  );
  await audit(user, "CATALOG_ITEM_UPDATED", "chronic_condition", id, { moved: direction });
}

// ─────────────────────────────────────────────────────────────────────────────
// Tipos de consentimiento
// ─────────────────────────────────────────────────────────────────────────────

export async function listConsentTypes(user: CurrentUser) {
  await requireSettingsManager(user);
  const rows = await prisma.consentType.findMany({
    orderBy: [{ isActive: "desc" }, { createdAt: "asc" }],
    select: {
      id: true,
      code: true,
      nameEs: true,
      nameEn: true,
      requiresDocument: true,
      defaultValidityDays: true,
      isActive: true,
      _count: { select: { consents: true } },
    },
  });
  return rows.map(({ _count, ...c }) => ({ ...c, consents: _count.consents }));
}

export async function createConsentType(
  user: CurrentUser,
  input: ConsentTypeInput,
): Promise<string> {
  await requireSettingsManager(user);
  const parsed = consentTypeSchema.safeParse(input);
  if (!parsed.success) throw new ServiceError("INVALID");
  // El código es estable (no cambia al renombrar); si ya existe, se agrega un sufijo.
  const base = consentCodeFromName(parsed.data.nameEn);
  const taken = new Set(
    (
      await prisma.consentType.findMany({
        where: { code: { startsWith: base } },
        select: { code: true },
      })
    ).map((c) => c.code),
  );
  let code = base;
  for (let n = 2; taken.has(code); n++) code = `${base.slice(0, 36)}_${n}`;
  try {
    const created = await prisma.consentType.create({ data: { ...parsed.data, code } });
    await audit(user, "CATALOG_ITEM_CREATED", "consent_type", created.id);
    return created.id;
  } catch (error) {
    return rethrow(error, "consent-types");
  }
}

export async function updateConsentType(
  user: CurrentUser,
  id: string,
  input: Partial<ConsentTypeInput> & { isActive?: boolean },
): Promise<void> {
  await requireSettingsManager(user);
  const existing = await prisma.consentType.findUnique({ where: { id } });
  if (!existing) throw new ServiceError("NOT_FOUND");
  const { isActive, ...fields } = input;
  const parsed = consentTypeSchema.partial().safeParse(fields);
  if (!parsed.success) throw new ServiceError("INVALID");
  const data = { ...parsed.data, ...(isActive !== undefined ? { isActive } : {}) };
  try {
    await prisma.consentType.update({ where: { id }, data });
  } catch (error) {
    rethrow(error, "consent-types");
  }
  await audit(user, "CATALOG_ITEM_UPDATED", "consent_type", id, {
    renamed:
      (data.nameEs !== undefined && data.nameEs !== existing.nameEs) ||
      (data.nameEn !== undefined && data.nameEn !== existing.nameEn),
    ...(data.requiresDocument !== undefined ? { requiresDocument: data.requiresDocument } : {}),
    ...(data.defaultValidityDays !== undefined ? { validityDays: data.defaultValidityDays } : {}),
    ...(isActive !== undefined ? { isActive } : {}),
  });
}
