import "server-only";
import { diffChanges } from "@/lib/activity/diff";
import { recordActivity } from "@/lib/activity/record";
import { recordAudit } from "@/lib/audit/audit-log";
import type { CurrentUser } from "@/lib/auth/current-user";
import { getFieldProtector, SENSITIVE_FIELDS, type ProtectedValue } from "@/lib/crypto";
import { prisma } from "@/lib/db";
import { describeDbErrorForLog, toSafeDbError } from "@/lib/db-errors";
import { parseDateOnly } from "@/lib/format";
import { PERMISSIONS, type PermissionKey } from "@/lib/permissions/catalog";
import { ServiceError } from "@/lib/service-error";
import { carrierOffersProgram, carriersByProgram } from "@/modules/carriers/service";
import { clientVisibilityWhere } from "@/modules/clients/access";
import type {
  AddCoverageValues,
  ChangeCarrierValues,
  EndCoverageValues,
  UpdateCoverageValues,
} from "./schema";

/**
 * Coberturas del cliente con HISTORIAL.
 * - Nunca se sobrescribe una aseguradora: cambiar de aseguradora cierra la cobertura actual
 *   (isCurrent=false, ENDED, endDate) y crea una nueva enlazada (replacesInsuranceId).
 * - Solo la cobertura ACTUAL se edita; el historial es de solo lectura.
 * - Solo se ofrecen aseguradoras activas cuya relación con el programa está activa.
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

async function requirePermission(user: CurrentUser, permission: PermissionKey) {
  if (!user.permissions.has(permission)) await deny(user, permission);
}

function rethrow(error: unknown): never {
  if (error instanceof ServiceError) throw error;
  const safe = toSafeDbError(error);
  if (safe.kind === "unique_violation") throw new ServiceError("CONFLICT");
  if (safe.kind === "check_violation" && safe.constraint === "insurances_dates_order") {
    throw new ServiceError("INVALID", "endDate");
  }
  console.error(`[insurance] ${describeDbErrorForLog(error)}`);
  throw new Error("INSURANCE_SERVICE_FAILURE");
}

const DIFF = {
  fields: [
    "carrier",
    "planName",
    "status",
    "applicationSubmittedAt",
    "effectiveDate",
    "endDate",
    "memberNumber",
    "confirmationNumber",
    "changeReason",
  ] as const,
  sensitive: ["memberNumber", "confirmationNumber"] as const,
  dateOnly: ["applicationSubmittedAt", "effectiveDate", "endDate"] as const,
};

/** Cobertura visible para el usuario (por la visibilidad de su cliente). */
async function loadVisibleInsurance(user: CurrentUser, insuranceId: string) {
  const insurance = await prisma.clientInsurance.findFirst({
    where: { id: insuranceId, deletedAt: null, client: clientVisibilityWhere(user) },
    include: { carrier: true, program: true, client: { select: { assignedAgentId: true } } },
  });
  if (!insurance) throw new ServiceError("NOT_FOUND");
  return insurance;
}

function protectNumbers(values: { memberNumber?: string; confirmationNumber?: string }) {
  const protector = getFieldProtector();
  return {
    member: protector.protect(SENSITIVE_FIELDS.MEMBER_NUMBER, values.memberNumber),
    confirmation: protector.protect(
      SENSITIVE_FIELDS.CONFIRMATION_NUMBER,
      values.confirmationNumber,
    ),
  };
}

const numberColumns = (member: ProtectedValue | null, confirmation: ProtectedValue | null) => ({
  ...(member
    ? { memberNumberEnc: member.enc, memberNumberIdx: member.idx, memberNumberLast4: member.last4 }
    : {}),
  ...(confirmation
    ? {
        confirmationNumberEnc: confirmation.enc,
        confirmationNumberIdx: confirmation.idx,
        confirmationNumberLast4: confirmation.last4,
      }
    : {}),
});

// ─────────────────────────────────────────────────────────────────────────────
// Lectura
// ─────────────────────────────────────────────────────────────────────────────

export async function getClientCoverage(user: CurrentUser, clientId: string) {
  await requirePermission(user, PERMISSIONS.INSURANCE_READ);
  const client = await prisma.client.findFirst({
    where: { id: clientId, ...clientVisibilityWhere(user) },
    select: {
      id: true,
      programs: {
        where: { deletedAt: null },
        orderBy: { program: { sortOrder: "asc" } },
        include: { program: true },
      },
      insurances: {
        where: { deletedAt: null },
        orderBy: [
          { isCurrent: "desc" },
          { effectiveDate: { sort: "desc", nulls: "first" } },
          { createdAt: "desc" },
        ],
        include: {
          carrier: { select: { id: true, name: true } },
          program: { select: { code: true, nameEs: true, nameEn: true } },
          writingAgent: { select: { name: true } },
          replacedBy: { select: { carrier: { select: { name: true } } } },
        },
      },
    },
  });
  if (!client) return null;

  const canWrite = user.permissions.has(PERMISSIONS.INSURANCE_WRITE);
  return {
    canWrite,
    canReveal: user.permissions.has(PERMISSIONS.SENSITIVE_REVEAL),
    programs: client.programs.map((p) => ({
      enrollmentId: p.id,
      code: p.program.code,
      name: { es: p.program.nameEs, en: p.program.nameEn },
      beneficiaryLast4: p.beneficiaryNumberLast4,
      partAEffectiveDate: p.partAEffectiveDate,
      partBEffectiveDate: p.partBEffectiveDate,
    })),
    coverages: client.insurances.map((i) => ({
      id: i.id,
      programCode: i.program.code,
      programName: { es: i.program.nameEs, en: i.program.nameEn },
      carrier: i.carrier,
      planName: i.planName,
      memberLast4: i.memberNumberLast4,
      confirmationLast4: i.confirmationNumberLast4,
      applicationSubmittedAt: i.applicationSubmittedAt,
      effectiveDate: i.effectiveDate,
      endDate: i.endDate,
      status: i.status,
      isCurrent: i.isCurrent,
      changeReason: i.changeReason,
      replacedByCarrier: i.replacedBy?.carrier.name ?? null,
      writingAgentName: i.writingAgent?.name ?? null,
      createdAt: i.createdAt,
    })),
    carriersByProgram: canWrite ? await carriersByProgram() : {},
  };
}

export type ClientCoverage = NonNullable<Awaited<ReturnType<typeof getClientCoverage>>>;

// ─────────────────────────────────────────────────────────────────────────────
// Escritura
// ─────────────────────────────────────────────────────────────────────────────

export async function addCoverage(user: CurrentUser, clientId: string, values: AddCoverageValues) {
  await requirePermission(user, PERMISSIONS.INSURANCE_WRITE);
  const client = await prisma.client.findFirst({
    where: { id: clientId, ...clientVisibilityWhere(user) },
    select: { id: true, assignedAgentId: true },
  });
  if (!client) throw new ServiceError("NOT_FOUND");

  const enrollment = await prisma.clientProgramEnrollment.findFirst({
    where: { clientId, deletedAt: null, program: { code: values.programCode } },
    select: { programId: true },
  });
  // La cobertura debe ser de un programa que el cliente tiene registrado.
  if (!enrollment) throw new ServiceError("INVALID", "programCode");
  if (!(await carrierOffersProgram(values.carrierId, enrollment.programId))) {
    throw new ServiceError("INVALID", "carrierId");
  }
  const carrier = await prisma.insuranceCarrier.findUniqueOrThrow({
    where: { id: values.carrierId },
  });
  const { member, confirmation } = protectNumbers(values);
  const data = {
    planName: values.planName ?? null,
    applicationSubmittedAt: parseDateOnly(values.applicationSubmittedAt),
    effectiveDate: parseDateOnly(values.effectiveDate),
    status: values.status,
  };

  try {
    return await prisma.$transaction(async (tx) => {
      const created = await tx.clientInsurance.create({
        data: {
          clientId,
          programId: enrollment.programId,
          carrierId: values.carrierId,
          ...data,
          ...numberColumns(member, confirmation),
          isCurrent: true,
          writingAgentId: client.assignedAgentId ?? user.id,
          createdById: user.id,
        },
      });
      await recordActivity(tx, {
        clientId,
        actorId: user.id,
        entityType: "insurance",
        entityId: created.id,
        action: "CREATE",
        changes: {
          program: { from: null, to: values.programCode },
          ...diffChanges(
            null,
            {
              ...data,
              carrier: carrier.name,
              memberNumber: member?.idx,
              confirmationNumber: confirmation?.idx,
            },
            DIFF,
          ),
        },
      });
      return created.id;
    });
  } catch (error) {
    return rethrow(error);
  }
}

/** Edita la cobertura ACTUAL (plan, números, fechas, estado pendiente/activa). */
export async function updateCoverage(
  user: CurrentUser,
  insuranceId: string,
  values: UpdateCoverageValues,
) {
  await requirePermission(user, PERMISSIONS.INSURANCE_WRITE);
  const current = await loadVisibleInsurance(user, insuranceId);
  if (!current.isCurrent) throw new ServiceError("INVALID", "isCurrent");

  const { member, confirmation } = protectNumbers(values);
  const data = {
    planName: values.planName ?? null,
    applicationSubmittedAt: parseDateOnly(values.applicationSubmittedAt),
    effectiveDate: parseDateOnly(values.effectiveDate),
    status: values.status,
  };
  const memberChanged = member !== null && member.idx !== current.memberNumberIdx;
  const confirmationChanged =
    confirmation !== null && confirmation.idx !== current.confirmationNumberIdx;
  const changes = {
    ...diffChanges(current as unknown as Record<string, unknown>, data, DIFF),
    ...(memberChanged ? { memberNumber: { changed: true as const } } : {}),
    ...(confirmationChanged ? { confirmationNumber: { changed: true as const } } : {}),
  };
  if (Object.keys(changes).length === 0) return;

  try {
    await prisma.$transaction(async (tx) => {
      await tx.clientInsurance.update({
        where: { id: insuranceId },
        data: {
          ...data,
          ...numberColumns(
            memberChanged ? member : null,
            confirmationChanged ? confirmation : null,
          ),
        },
      });
      await recordActivity(tx, {
        clientId: current.clientId,
        actorId: user.id,
        entityType: "insurance",
        entityId: insuranceId,
        action: "UPDATE",
        changes,
      });
    });
  } catch (error) {
    rethrow(error);
  }
}

function dayBefore(dateOnly: Date): Date {
  return new Date(dateOnly.getTime() - 86_400_000);
}

function todayUtcDate(): Date {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(
    new Date(),
  );
  return parseDateOnly(today)!;
}

/**
 * Cambio de aseguradora (o de plan): cierra la cobertura actual y crea una nueva enlazada.
 * La anterior queda en el historial con su fecha de fin y el motivo del cambio.
 */
export async function changeCarrier(
  user: CurrentUser,
  insuranceId: string,
  values: ChangeCarrierValues,
) {
  await requirePermission(user, PERMISSIONS.INSURANCE_WRITE);
  const previous = await loadVisibleInsurance(user, insuranceId);
  if (!previous.isCurrent) throw new ServiceError("INVALID", "isCurrent");
  if (!(await carrierOffersProgram(values.carrierId, previous.programId))) {
    throw new ServiceError("INVALID", "carrierId");
  }

  const newCarrier = await prisma.insuranceCarrier.findUniqueOrThrow({
    where: { id: values.carrierId },
  });
  const effectiveDate = parseDateOnly(values.effectiveDate);
  const previousEndDate =
    parseDateOnly(values.previousEndDate) ??
    (effectiveDate ? dayBefore(effectiveDate) : todayUtcDate());
  const { member, confirmation } = protectNumbers(values);

  try {
    return await prisma.$transaction(async (tx) => {
      // 1. Cerrar la anterior (antes de crear la nueva: solo puede haber una actual por programa).
      await tx.clientInsurance.update({
        where: { id: previous.id },
        data: { isCurrent: false, status: "ENDED", endDate: previousEndDate },
      });
      await recordActivity(tx, {
        clientId: previous.clientId,
        actorId: user.id,
        entityType: "insurance",
        entityId: previous.id,
        action: "UPDATE",
        changes: diffChanges(
          { status: previous.status, endDate: previous.endDate },
          { status: "ENDED", endDate: previousEndDate },
          DIFF,
        ),
      });

      // 2. Crear la nueva, enlazada a la anterior.
      const created = await tx.clientInsurance.create({
        data: {
          clientId: previous.clientId,
          programId: previous.programId,
          carrierId: values.carrierId,
          planName: values.planName ?? null,
          applicationSubmittedAt: parseDateOnly(values.applicationSubmittedAt),
          effectiveDate,
          status: values.status,
          ...numberColumns(member, confirmation),
          isCurrent: true,
          changeReason: values.changeReason ?? null,
          replacesInsuranceId: previous.id,
          writingAgentId: previous.client.assignedAgentId ?? user.id,
          createdById: user.id,
        },
      });
      await recordActivity(tx, {
        clientId: previous.clientId,
        actorId: user.id,
        entityType: "insurance",
        entityId: created.id,
        action: "CREATE",
        changes: {
          carrier: { from: previous.carrier.name, to: newCarrier.name },
          ...diffChanges(
            null,
            {
              status: values.status,
              effectiveDate,
              changeReason: values.changeReason,
              memberNumber: member?.idx,
              confirmationNumber: confirmation?.idx,
            },
            DIFF,
          ),
        },
      });
      return created.id;
    });
  } catch (error) {
    return rethrow(error);
  }
}

/** Termina la cobertura actual (finalizada, cancelada o denegada). Queda en el historial. */
export async function endCoverage(
  user: CurrentUser,
  insuranceId: string,
  values: EndCoverageValues,
) {
  await requirePermission(user, PERMISSIONS.INSURANCE_WRITE);
  const current = await loadVisibleInsurance(user, insuranceId);
  if (!current.isCurrent) throw new ServiceError("INVALID", "isCurrent");
  const endDate =
    parseDateOnly(values.endDate) ?? (values.status === "ENDED" ? todayUtcDate() : null);

  try {
    await prisma.$transaction(async (tx) => {
      await tx.clientInsurance.update({
        where: { id: insuranceId },
        data: {
          isCurrent: false,
          status: values.status,
          endDate,
          changeReason: values.reason ?? current.changeReason,
        },
      });
      await recordActivity(tx, {
        clientId: current.clientId,
        actorId: user.id,
        entityType: "insurance",
        entityId: insuranceId,
        action: "UPDATE",
        changes: diffChanges(
          { status: current.status, endDate: current.endDate, changeReason: current.changeReason },
          { status: values.status, endDate, changeReason: values.reason ?? current.changeReason },
          DIFF,
        ),
      });
    });
  } catch (error) {
    rethrow(error);
  }
}

/** Revela el número de miembro o de confirmación. Requiere permiso y queda en auditoría. */
export async function revealInsuranceNumber(
  user: CurrentUser,
  insuranceId: string,
  field: "member" | "confirmation",
) {
  await requirePermission(user, PERMISSIONS.SENSITIVE_REVEAL);
  const insurance = await loadVisibleInsurance(user, insuranceId);
  const payload = field === "member" ? insurance.memberNumberEnc : insurance.confirmationNumberEnc;
  if (!payload) throw new ServiceError("NOT_FOUND");
  const value = getFieldProtector().decrypt(
    field === "member" ? SENSITIVE_FIELDS.MEMBER_NUMBER : SENSITIVE_FIELDS.CONFIRMATION_NUMBER,
    payload,
  );
  await recordAudit({
    action: "SENSITIVE_REVEALED",
    outcome: "SUCCESS",
    actorId: user.id,
    targetType: "insurance",
    targetId: insurance.id,
    metadata: {
      field: field === "member" ? "member_number" : "confirmation_number",
      clientId: insurance.clientId,
    },
  });
  return { value };
}
