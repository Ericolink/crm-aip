import "server-only";
import { diffChanges } from "@/lib/activity/diff";
import { recordActivity } from "@/lib/activity/record";
import { recordAudit } from "@/lib/audit/audit-log";
import type { CurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/db";
import { describeDbErrorForLog, toSafeDbError } from "@/lib/db-errors";
import { PERMISSIONS, type PermissionKey } from "@/lib/permissions/catalog";
import { ServiceError } from "@/lib/service-error";
import type { Prisma } from "@/generated/prisma/client";
import { clientVisibilityWhere } from "@/modules/clients/access";
import type { ClientMedicationValues } from "./schema";

/**
 * Medicamentos del cliente (separados de las pólizas).
 * - El NOMBRE vive en un catálogo (`medications`), único sin importar mayúsculas: se reutiliza.
 * - Dosis, frecuencia, presentación, médico que prescribe y notas son de cada cliente.
 * - El médico que prescribe debe ser uno de los médicos ACTIVOS de ese mismo cliente.
 * - Quitar es borrado lógico (queda en el historial).
 */

type Tx = Prisma.TransactionClient;

async function requirePermission(user: CurrentUser, permission: PermissionKey) {
  if (user.permissions.has(permission)) return;
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
  const safe = toSafeDbError(error);
  if (safe.kind === "check_violation") throw new ServiceError("INVALID", "formOther");
  console.error(`[medications] ${describeDbErrorForLog(error)}`);
  throw new Error("MEDICATION_SERVICE_FAILURE");
}

const FIELDS = [
  "medication",
  "dose",
  "frequency",
  "form",
  "formOther",
  "prescriber",
  "notes",
] as const;

/** Busca el medicamento por nombre sin importar mayúsculas; si no existe, lo crea. */
async function resolveMedication(tx: Tx, name: string) {
  const existing = await tx.medication.findFirst({
    where: { name: { equals: name, mode: "insensitive" } },
  });
  if (existing) return existing;
  // INSERT … ON CONFLICT DO NOTHING: si alguien lo creó a la vez (índice único lower(name)),
  // no se produce error (un error invalidaría toda la transacción) y se usa el existente.
  await tx.medication.createMany({ data: [{ name }], skipDuplicates: true });
  return tx.medication.findFirstOrThrow({ where: { name: { equals: name, mode: "insensitive" } } });
}

/** El médico que prescribe debe ser un médico ACTIVO del mismo cliente. */
async function resolvePrescriber(tx: Tx, clientId: string, prescriberId: string | undefined) {
  if (!prescriberId) return null;
  const link = await tx.clientDoctor.findFirst({
    where: { id: prescriberId, clientId, deletedAt: null },
    include: { doctor: { select: { name: true } } },
  });
  if (!link) throw new ServiceError("INVALID", "prescriberClientDoctorId");
  return link;
}

function linkData(v: ClientMedicationValues) {
  return {
    dose: v.dose ?? null,
    frequency: v.frequency ?? null,
    form: v.form ?? null,
    formOther: v.form === "OTHER" ? (v.formOther ?? null) : null,
    notes: v.notes ?? null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Lectura
// ─────────────────────────────────────────────────────────────────────────────

export async function getClientMedications(user: CurrentUser, clientId: string) {
  await requirePermission(user, PERMISSIONS.MEDICAL_READ);
  const client = await prisma.client.findFirst({
    where: { id: clientId, ...clientVisibilityWhere(user) },
    select: {
      medications: {
        where: { deletedAt: null },
        orderBy: { medication: { name: "asc" } },
        include: {
          medication: { select: { name: true } },
          prescriber: { select: { id: true, deletedAt: true, doctor: { select: { name: true } } } },
        },
      },
      doctors: {
        where: { deletedAt: null },
        orderBy: [{ role: "asc" }, { doctor: { name: "asc" } }],
        select: { id: true, role: true, doctor: { select: { name: true } } },
      },
    },
  });
  if (!client) return null;

  return {
    canWrite: user.permissions.has(PERMISSIONS.MEDICAL_WRITE),
    medications: client.medications.map((m) => ({
      id: m.id,
      name: m.medication.name,
      dose: m.dose,
      frequency: m.frequency,
      form: m.form,
      formOther: m.formOther,
      notes: m.notes,
      prescriber: m.prescriber
        ? {
            id: m.prescriber.id,
            name: m.prescriber.doctor.name,
            /** El médico ya no está en la lista del cliente (se conserva el dato histórico). */
            removed: m.prescriber.deletedAt !== null,
          }
        : null,
    })),
    /** Médicos activos del cliente que pueden prescribir. */
    prescribers: client.doctors.map((d) => ({ id: d.id, name: d.doctor.name, role: d.role })),
  };
}

export type ClientMedications = NonNullable<Awaited<ReturnType<typeof getClientMedications>>>;

/** Sugerencias del catálogo mientras se escribe el nombre (máx. 8). */
export async function suggestMedications(user: CurrentUser, query: string) {
  await requirePermission(user, PERMISSIONS.MEDICAL_READ);
  const q = query
    .trim()
    .replace(/[%_\\]/g, "")
    .slice(0, 60);
  if (q.length < 2) return [];
  const rows = await prisma.medication.findMany({
    where: { name: { contains: q, mode: "insensitive" } },
    orderBy: { name: "asc" },
    take: 8,
    select: { name: true },
  });
  return rows.map((r) => r.name);
}

// ─────────────────────────────────────────────────────────────────────────────
// Escritura
// ─────────────────────────────────────────────────────────────────────────────

export async function addClientMedication(
  user: CurrentUser,
  clientId: string,
  values: ClientMedicationValues,
) {
  await requirePermission(user, PERMISSIONS.MEDICAL_WRITE);
  const client = await prisma.client.findFirst({
    where: { id: clientId, ...clientVisibilityWhere(user) },
    select: { id: true },
  });
  if (!client) throw new ServiceError("NOT_FOUND");

  try {
    return await prisma.$transaction(async (tx) => {
      const medication = await resolveMedication(tx, values.name);
      const prescriber = await resolvePrescriber(tx, clientId, values.prescriberClientDoctorId);
      const data = linkData(values);
      const created = await tx.clientMedication.create({
        data: {
          clientId,
          medicationId: medication.id,
          prescriberClientDoctorId: prescriber?.id ?? null,
          ...data,
        },
      });
      await recordActivity(tx, {
        clientId,
        actorId: user.id,
        entityType: "medication",
        entityId: created.id,
        action: "CREATE",
        changes: diffChanges(
          null,
          { medication: medication.name, prescriber: prescriber?.doctor.name, ...data },
          { fields: FIELDS },
        ),
      });
      return created.id;
    });
  } catch (error) {
    return rethrow(error);
  }
}

export async function updateClientMedication(
  user: CurrentUser,
  clientMedicationId: string,
  values: ClientMedicationValues,
) {
  await requirePermission(user, PERMISSIONS.MEDICAL_WRITE);
  const current = await prisma.clientMedication.findFirst({
    where: { id: clientMedicationId, deletedAt: null, client: clientVisibilityWhere(user) },
    include: { medication: true, prescriber: { include: { doctor: { select: { name: true } } } } },
  });
  if (!current) throw new ServiceError("NOT_FOUND");

  try {
    await prisma.$transaction(async (tx) => {
      const medication = await resolveMedication(tx, values.name);
      // Se conserva un médico que ya fue quitado del cliente si no se cambió (dato histórico).
      const keepsRemovedPrescriber =
        values.prescriberClientDoctorId !== undefined &&
        values.prescriberClientDoctorId === current.prescriberClientDoctorId;
      const prescriber = keepsRemovedPrescriber
        ? current.prescriber
        : await resolvePrescriber(tx, current.clientId, values.prescriberClientDoctorId);
      const data = linkData(values);
      const changes = diffChanges(
        {
          medication: current.medication.name,
          prescriber: current.prescriber?.doctor.name,
          dose: current.dose,
          frequency: current.frequency,
          form: current.form,
          formOther: current.formOther,
          notes: current.notes,
        },
        { medication: medication.name, prescriber: prescriber?.doctor.name, ...data },
        { fields: FIELDS },
      );
      if (!changes) return;
      await tx.clientMedication.update({
        where: { id: current.id },
        data: {
          medicationId: medication.id,
          prescriberClientDoctorId: prescriber?.id ?? null,
          ...data,
        },
      });
      await recordActivity(tx, {
        clientId: current.clientId,
        actorId: user.id,
        entityType: "medication",
        entityId: current.id,
        action: "UPDATE",
        changes,
      });
    });
  } catch (error) {
    rethrow(error);
  }
}

export async function removeClientMedication(user: CurrentUser, clientMedicationId: string) {
  await requirePermission(user, PERMISSIONS.MEDICAL_WRITE);
  const current = await prisma.clientMedication.findFirst({
    where: { id: clientMedicationId, deletedAt: null, client: clientVisibilityWhere(user) },
    include: { medication: true },
  });
  if (!current) throw new ServiceError("NOT_FOUND");
  try {
    await prisma.$transaction(async (tx) => {
      await tx.clientMedication.update({
        where: { id: current.id },
        data: { deletedAt: new Date() },
      });
      await recordActivity(tx, {
        clientId: current.clientId,
        actorId: user.id,
        entityType: "medication",
        entityId: current.id,
        action: "DELETE",
        changes: { medication: { from: current.medication.name, to: null } },
      });
    });
  } catch (error) {
    rethrow(error);
  }
}
