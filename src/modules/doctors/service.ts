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
import { normalizeSearchText } from "@/modules/clients/search";
import type { AddClientDoctorValues, UpdateClientDoctorValues } from "./schema";

/**
 * Médicos del cliente.
 * - `Doctor` es un DIRECTORIO compartido: un PCP con muchos pacientes se registra una vez.
 * - `ClientDoctor` vincula al cliente con su papel (PCP / especialista) y notas propias.
 * - Un solo PCP activo por cliente (índice único en la base). Asignar un PCP nuevo convierte
 *   al anterior en especialista dentro de la misma transacción: no se pierde nada.
 * - Quitar un médico es borrado lógico (queda en el historial).
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
  if (safe.kind === "unique_violation") {
    throw new ServiceError("CONFLICT", safe.constraint === "doctors_npi_key" ? "npi" : "doctorId");
  }
  console.error(`[doctors] ${describeDbErrorForLog(error)}`);
  throw new Error("DOCTOR_SERVICE_FAILURE");
}

const DOCTOR_FIELDS = ["name", "specialty", "clinic", "phone", "address", "npi"] as const;
const LINK_FIELDS = ["role", "notes"] as const;

async function requireVisibleClient(user: CurrentUser, clientId: string) {
  const client = await prisma.client.findFirst({
    where: { id: clientId, ...clientVisibilityWhere(user) },
    select: { id: true },
  });
  if (!client) throw new ServiceError("NOT_FOUND");
}

async function loadVisibleLink(user: CurrentUser, clientDoctorId: string) {
  const link = await prisma.clientDoctor.findFirst({
    where: { id: clientDoctorId, deletedAt: null, client: clientVisibilityWhere(user) },
    include: { doctor: true },
  });
  if (!link) throw new ServiceError("NOT_FOUND");
  return link;
}

/** Si ya hay un PCP activo (distinto de `exceptLinkId`), lo convierte en especialista. */
async function demoteCurrentPcp(tx: Tx, clientId: string, actorId: string, exceptLinkId?: string) {
  const current = await tx.clientDoctor.findFirst({
    where: {
      clientId,
      role: "PCP",
      deletedAt: null,
      ...(exceptLinkId ? { id: { not: exceptLinkId } } : {}),
    },
  });
  if (!current) return;
  await tx.clientDoctor.update({ where: { id: current.id }, data: { role: "SPECIALIST" } });
  await recordActivity(tx, {
    clientId,
    actorId,
    entityType: "doctor",
    entityId: current.id,
    action: "UPDATE",
    changes: { role: { from: "PCP", to: "SPECIALIST" } },
  });
}

function directoryData(v: UpdateClientDoctorValues) {
  return {
    name: v.name,
    specialty: v.specialty ?? null,
    clinic: v.clinic ?? null,
    phone: v.phone ?? null,
    address: v.address ?? null,
    npi: v.npi ?? null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Lectura
// ─────────────────────────────────────────────────────────────────────────────

export async function getClientDoctors(user: CurrentUser, clientId: string) {
  await requirePermission(user, PERMISSIONS.MEDICAL_READ);
  const client = await prisma.client.findFirst({
    where: { id: clientId, ...clientVisibilityWhere(user) },
    select: {
      id: true,
      doctors: {
        where: { deletedAt: null },
        orderBy: [{ role: "asc" }, { doctor: { name: "asc" } }],
        include: {
          doctor: { include: { _count: { select: { clients: { where: { deletedAt: null } } } } } },
        },
      },
    },
  });
  if (!client) return null;

  const doctors = client.doctors.map((cd) => ({
    id: cd.id,
    role: cd.role,
    notes: cd.notes,
    doctor: {
      id: cd.doctor.id,
      name: cd.doctor.name,
      specialty: cd.doctor.specialty,
      clinic: cd.doctor.clinic,
      phone: cd.doctor.phone,
      address: cd.doctor.address,
      npi: cd.doctor.npi,
      /** Cuántos clientes comparten este médico (editar sus datos los afecta a todos). */
      sharedWith: cd.doctor._count.clients,
    },
  }));
  return {
    canWrite: user.permissions.has(PERMISSIONS.MEDICAL_WRITE),
    pcp: doctors.find((d) => d.role === "PCP") ?? null,
    specialists: doctors.filter((d) => d.role === "SPECIALIST"),
  };
}

export type ClientDoctors = NonNullable<Awaited<ReturnType<typeof getClientDoctors>>>;

/** Búsqueda en el directorio (nombre, especialidad o clínica; sin acentos). Máx. 10 resultados. */
export async function searchDoctorDirectory(user: CurrentUser, query: string) {
  await requirePermission(user, PERMISSIONS.MEDICAL_READ);
  const q = normalizeSearchText(query)
    .replace(/[%_\\]/g, " ")
    .trim()
    .slice(0, 60);
  if (q.length < 2) return [];
  const words = q.split(/\s+/).slice(0, 4);
  const doctors = await prisma.doctor.findMany({
    where: {
      isActive: true,
      // searchText ya está en minúsculas y sin acentos (trigger), igual que las palabras buscadas.
      AND: words.map((w) => ({ searchText: { contains: w } })),
    },
    orderBy: { name: "asc" },
    take: 10,
    select: { id: true, name: true, specialty: true, clinic: true, phone: true },
  });
  return doctors;
}

// ─────────────────────────────────────────────────────────────────────────────
// Escritura
// ─────────────────────────────────────────────────────────────────────────────

export async function addClientDoctor(
  user: CurrentUser,
  clientId: string,
  values: AddClientDoctorValues,
) {
  await requirePermission(user, PERMISSIONS.MEDICAL_WRITE);
  await requireVisibleClient(user, clientId);

  try {
    return await prisma.$transaction(async (tx) => {
      let doctorId: string;
      let doctorName: string;
      if (values.doctorId) {
        const existing = await tx.doctor.findFirst({
          where: { id: values.doctorId, isActive: true },
        });
        if (!existing) throw new ServiceError("INVALID", "doctorId");
        doctorId = existing.id;
        doctorName = existing.name;
      } else {
        const created = await tx.doctor.create({
          data: directoryData(values as UpdateClientDoctorValues),
        });
        doctorId = created.id;
        doctorName = created.name;
      }

      const already = await tx.clientDoctor.findFirst({
        where: { clientId, doctorId, deletedAt: null },
      });
      if (already) throw new ServiceError("CONFLICT", "doctorId");
      if (values.role === "PCP") await demoteCurrentPcp(tx, clientId, user.id);

      const link = await tx.clientDoctor.create({
        data: { clientId, doctorId, role: values.role, notes: values.notes ?? null },
      });
      await recordActivity(tx, {
        clientId,
        actorId: user.id,
        entityType: "doctor",
        entityId: link.id,
        action: "CREATE",
        changes: {
          doctor: { from: null, to: doctorName },
          ...diffChanges(null, link, { fields: LINK_FIELDS }),
        },
      });
      return link.id;
    });
  } catch (error) {
    return rethrow(error);
  }
}

/** Edita los datos del médico (directorio compartido) y su papel/notas para ESTE cliente. */
export async function updateClientDoctor(
  user: CurrentUser,
  clientDoctorId: string,
  values: UpdateClientDoctorValues,
) {
  await requirePermission(user, PERMISSIONS.MEDICAL_WRITE);
  const link = await loadVisibleLink(user, clientDoctorId);
  const doctorData = directoryData(values);
  const doctorChanges = diffChanges(link.doctor as unknown as Record<string, unknown>, doctorData, {
    fields: DOCTOR_FIELDS,
  });
  const linkData = { role: values.role, notes: values.notes ?? null };
  const linkChanges = diffChanges(link as unknown as Record<string, unknown>, linkData, {
    fields: LINK_FIELDS,
  });
  if (!doctorChanges && !linkChanges) return;

  try {
    await prisma.$transaction(async (tx) => {
      if (doctorChanges) await tx.doctor.update({ where: { id: link.doctorId }, data: doctorData });
      if (linkChanges) {
        if (values.role === "PCP" && link.role !== "PCP") {
          await demoteCurrentPcp(tx, link.clientId, user.id, link.id);
        }
        await tx.clientDoctor.update({ where: { id: link.id }, data: linkData });
      }
      await recordActivity(tx, {
        clientId: link.clientId,
        actorId: user.id,
        entityType: "doctor",
        entityId: link.id,
        action: "UPDATE",
        changes: { ...doctorChanges, ...linkChanges },
      });
    });
  } catch (error) {
    rethrow(error);
  }
}

/** Quita el médico del cliente (borrado lógico). El médico sigue en el directorio. */
export async function removeClientDoctor(user: CurrentUser, clientDoctorId: string) {
  await requirePermission(user, PERMISSIONS.MEDICAL_WRITE);
  const link = await loadVisibleLink(user, clientDoctorId);
  try {
    await prisma.$transaction(async (tx) => {
      await tx.clientDoctor.update({ where: { id: link.id }, data: { deletedAt: new Date() } });
      await recordActivity(tx, {
        clientId: link.clientId,
        actorId: user.id,
        entityType: "doctor",
        entityId: link.id,
        action: "DELETE",
        changes: {
          doctor: { from: link.doctor.name, to: null },
          role: { from: link.role, to: null },
        },
      });
    });
  } catch (error) {
    rethrow(error);
  }
}
