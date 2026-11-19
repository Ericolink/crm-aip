import "server-only";
import { diffChanges } from "@/lib/activity/diff";
import { recordActivity } from "@/lib/activity/record";
import { recordAudit } from "@/lib/audit/audit-log";
import type { CurrentUser } from "@/lib/auth/session";
import { getFieldProtector, SENSITIVE_FIELDS } from "@/lib/crypto";
import { prisma } from "@/lib/db";
import { describeDbErrorForLog, toSafeDbError } from "@/lib/db-errors";
import { parseDateOnly, toDateInputValue } from "@/lib/format";
import { PERMISSIONS, type PermissionKey } from "@/lib/permissions/catalog";
import { ServiceError } from "@/lib/service-error";
import type { Prisma } from "@/generated/prisma/client";
import {
  canEditMedicalAndPrograms,
  clientEditScope,
  clientVisibilityWhere,
  editableClientFields,
  FULL_CLIENT_FIELDS,
  type ClientField,
} from "./access";
import { DEFAULT_SORT, type ClientListParams } from "./list-params";
import {
  buildClientWhere,
  canSearchIdentifiers,
  clientOrderBy,
  identifierCandidate,
  type IdentifierIndexes,
} from "./search";
import {
  CLIENT_STATUSES,
  emptyClientForm,
  PROGRAM_CODES,
  type ClientFormInput,
  type ClientFormValues,
  type ProgramCode,
} from "./schema";

/**
 * Servicio de clientes: ÚNICO punto de lectura y escritura de clientes.
 * Cada función recibe el usuario actual y aplica permisos y visibilidad.
 */

export { ServiceError };

async function deny(user: CurrentUser, permission: PermissionKey): Promise<never> {
  await recordAudit({
    action: "ACCESS_DENIED",
    outcome: "DENIED",
    actorId: user.id,
    metadata: { permission },
  });
  throw new ServiceError("FORBIDDEN");
}

/** Convierte errores de base en ServiceError sin dejar pasar datos de la fila. */
function rethrowDbError(error: unknown): never {
  if (error instanceof ServiceError) throw error;
  const safe = toSafeDbError(error);
  if (safe.kind === "unique_violation") throw new ServiceError("CONFLICT");
  if (safe.kind === "not_found") throw new ServiceError("NOT_FOUND");
  console.error(`[clients] ${describeDbErrorForLog(error)}`);
  throw new Error("CLIENT_SERVICE_FAILURE");
}

// ─────────────────────────────────────────────────────────────────────────────
// Lectura
// ─────────────────────────────────────────────────────────────────────────────

export type ClientListItem = {
  id: string;
  firstName: string;
  lastName: string;
  primaryPhone: string | null;
  preferredLanguage: string;
  status: string;
  programs: string[];
  currentCarrier: string | null;
  effectiveDate: Date | null;
  assignedAgentName: string | null;
  createdAt: Date;
};

export type ClientListResult = {
  items: ClientListItem[];
  total: number;
  /** Conteo por estatus con los demás filtros aplicados (para las pastillas de estatus). */
  statusCounts: Record<string, number>;
};

/**
 * Lista con búsqueda, filtros combinados, orden y paginación.
 * La búsqueda por identificadores sensibles solo se activa para quien puede revelarlos,
 * y se registra en auditoría SIN el valor buscado.
 */
export async function listClients(
  user: CurrentUser,
  options: Partial<ClientListParams> & { page: number; pageSize: number },
): Promise<ClientListResult> {
  const params: ClientListParams = {
    statuses: [],
    sort: DEFAULT_SORT,
    ...options,
  };

  let identifierIndexes: IdentifierIndexes | null = null;
  const candidate = params.q ? identifierCandidate(params.q) : null;
  if (candidate && canSearchIdentifiers(user)) {
    const protector = getFieldProtector();
    identifierIndexes = {
      beneficiary: protector.blindIndex(SENSITIVE_FIELDS.BENEFICIARY_NUMBER, candidate),
      member: protector.blindIndex(SENSITIVE_FIELDS.MEMBER_NUMBER, candidate),
      confirmation: protector.blindIndex(SENSITIVE_FIELDS.CONFIRMATION_NUMBER, candidate),
    };
    await recordAudit({
      action: "IDENTIFIER_SEARCH",
      outcome: "SUCCESS",
      actorId: user.id,
      metadata: { length: candidate.length },
      dedupeWindowSeconds: 10,
      dedupeDiscriminator: identifierIndexes.member,
    });
  }

  const where = buildClientWhere(user, params, { identifierIndexes });
  const countWhere = buildClientWhere(user, params, { identifierIndexes, ignoreStatus: true });

  const [total, rows, grouped] = await Promise.all([
    prisma.client.count({ where }),
    prisma.client.findMany({
      where,
      // Ordenar por fecha efectiva revela datos de cobertura: sin permiso, orden por defecto.
      orderBy: clientOrderBy(
        params.sort.startsWith("effective") && !user.permissions.has(PERMISSIONS.INSURANCE_READ)
          ? DEFAULT_SORT
          : params.sort,
      ),
      skip: (options.page - 1) * options.pageSize,
      take: options.pageSize,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        primaryPhone: true,
        preferredLanguage: true,
        status: true,
        createdAt: true,
        currentEffectiveDate: true,
        assignedAgent: { select: { name: true } },
        programs: {
          where: { deletedAt: null },
          orderBy: { program: { sortOrder: "asc" } },
          select: { program: { select: { code: true } } },
        },
        insurances: {
          where: { isCurrent: true, deletedAt: null },
          orderBy: { effectiveDate: { sort: "asc", nulls: "last" } },
          take: 1,
          select: { carrier: { select: { name: true } } },
        },
      },
    }),
    prisma.client.groupBy({ by: ["status"], where: countWhere, _count: { _all: true } }),
  ]);

  const seesInsurance = user.permissions.has(PERMISSIONS.INSURANCE_READ);
  return {
    total,
    statusCounts: Object.fromEntries(grouped.map((g) => [g.status, g._count._all])),
    items: rows.map((r) => ({
      id: r.id,
      firstName: r.firstName,
      lastName: r.lastName,
      primaryPhone: r.primaryPhone,
      preferredLanguage: r.preferredLanguage,
      status: r.status,
      // Sin permiso de cobertura, esas columnas no se envían.
      programs: seesInsurance ? r.programs.map((p) => p.program.code) : [],
      currentCarrier: seesInsurance ? (r.insurances[0]?.carrier.name ?? null) : null,
      effectiveDate: seesInsurance ? r.currentEffectiveDate : null,
      assignedAgentName: r.assignedAgent?.name ?? null,
      createdAt: r.createdAt,
    })),
  };
}

/** Opciones de los filtros según lo que el usuario puede ver. */
export async function getClientListOptions(user: CurrentUser) {
  const seesAll = user.permissions.has(PERMISSIONS.CLIENT_READ_ALL);
  const linked = user.linkedAgentIds ?? [];
  const seesInsurance = user.permissions.has(PERMISSIONS.INSURANCE_READ);
  const seesMedical = user.permissions.has(PERMISSIONS.MEDICAL_READ);
  const none = Promise.resolve([] as never[]);
  const [programs, carriers, conditions, agents] = await Promise.all([
    !seesInsurance
      ? none
      : prisma.coverageProgram.findMany({
          where: { isActive: true },
          orderBy: { sortOrder: "asc" },
          select: { code: true, nameEs: true, nameEn: true },
        }),
    !seesInsurance
      ? none
      : prisma.insuranceCarrier.findMany({
          where: { isActive: true },
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        }),
    !seesMedical
      ? none
      : prisma.chronicCondition.findMany({
          where: { isActive: true },
          orderBy: { sortOrder: "asc" },
          select: { id: true, nameEs: true, nameEn: true },
        }),
    seesAll || linked.length
      ? prisma.user.findMany({
          where: seesAll
            ? { role: { key: { in: ["ADMIN", "AGENT"] } } }
            : { id: { in: [...linked] } },
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
  ]);
  return { programs, carriers, conditions, agents, seesInsurance, seesMedical };
}

const detailInclude = {
  assignedAgent: { select: { id: true, name: true } },
  createdBy: { select: { name: true } },
  programs: {
    where: { deletedAt: null },
    include: { program: true },
    orderBy: { program: { sortOrder: "asc" } },
  },
  conditions: { where: { deletedAt: null }, include: { condition: true } },
  insurances: {
    where: { isCurrent: true, deletedAt: null },
    include: { carrier: true, program: true },
  },
  doctors: { where: { role: "PCP", deletedAt: null }, include: { doctor: true } },
} satisfies Prisma.ClientInclude;

type ClientWithDetail = Prisma.ClientGetPayload<{ include: typeof detailInclude }>;

/** Detalle de un cliente, SIN valores cifrados (solo "últimos 4"). Registra el acceso. */
export async function getClientDetail(user: CurrentUser, clientId: string) {
  const client = await prisma.client.findFirst({
    where: { id: clientId, ...clientVisibilityWhere(user) },
    include: detailInclude,
  });
  if (!client) return null;

  await recordAudit({
    action: "CLIENT_VIEWED",
    outcome: "SUCCESS",
    actorId: user.id,
    targetType: "client",
    targetId: client.id,
    dedupeWindowSeconds: 10,
  });
  return toDetailDto(client, detailAccess(user));
}

/** Qué partes del detalle puede ver el usuario. Sin permiso, esos datos ni se envían. */
export function detailAccess(user: CurrentUser) {
  return {
    insurance: user.permissions.has(PERMISSIONS.INSURANCE_READ),
    medical: user.permissions.has(PERMISSIONS.MEDICAL_READ),
  };
}

function toDetailDto(c: ClientWithDetail, access: { insurance: boolean; medical: boolean }) {
  return {
    access,
    id: c.id,
    firstName: c.firstName,
    lastName: c.lastName,
    dateOfBirth: c.dateOfBirth,
    email: c.email,
    primaryPhone: c.primaryPhone,
    altPhone: c.altPhone,
    altContactName: c.altContactName,
    altContactRelationship: c.altContactRelationship,
    altContactRelationshipOther: c.altContactRelationshipOther,
    preferredLanguage: c.preferredLanguage,
    home: {
      street: c.homeStreet,
      unit: c.homeUnit,
      city: c.homeCity,
      state: c.homeState,
      zip: c.homeZip,
    },
    mailingSameAsHome: c.mailingSameAsHome,
    mailing: {
      street: c.mailingStreet,
      unit: c.mailingUnit,
      city: c.mailingCity,
      state: c.mailingState,
      zip: c.mailingZip,
    },
    status: c.status,
    assignedAgent: c.assignedAgent,
    createdByName: c.createdBy.name,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    programs: (access.insurance ? c.programs : []).map((p) => ({
      enrollmentId: p.id,
      code: p.program.code,
      name: { es: p.program.nameEs, en: p.program.nameEn },
      beneficiaryLast4: p.beneficiaryNumberLast4,
      partAEffectiveDate: p.partAEffectiveDate,
      partBEffectiveDate: p.partBEffectiveDate,
    })),
    conditions: (access.medical ? c.conditions : []).map((cc) => ({
      id: cc.id,
      name: cc.condition
        ? { es: cc.condition.nameEs, en: cc.condition.nameEn }
        : { es: cc.customName ?? "", en: cc.customName ?? "" },
    })),
    currentInsurances: (access.insurance ? c.insurances : []).map((i) => ({
      id: i.id,
      programCode: i.program.code,
      carrier: i.carrier.name,
      status: i.status,
      effectiveDate: i.effectiveDate,
      memberLast4: i.memberNumberLast4,
    })),
    pcp:
      access.medical && c.doctors[0]
        ? { name: c.doctors[0].doctor.name, phone: c.doctors[0].doctor.phone }
        : null,
  };
}

export type ClientDetail = ReturnType<typeof toDetailDto>;

/** Datos para el formulario de edición. Los números sensibles NUNCA se envían: solo "últimos 4". */
export async function getClientForEdit(user: CurrentUser, clientId: string) {
  const scope = clientEditScope(user);
  if (scope === "none") return deny(user, PERMISSIONS.CLIENT_UPDATE);

  const c = await prisma.client.findFirst({
    where: { id: clientId, ...clientVisibilityWhere(user) },
    include: {
      programs: { where: { deletedAt: null }, include: { program: true } },
      conditions: { where: { deletedAt: null } },
    },
  });
  if (!c) return null;

  const program = (code: ProgramCode) => c.programs.find((p) => p.program.code === code);
  const medicare = program("MEDICARE");
  const values: ClientFormInput = {
    ...emptyClientForm(),
    firstName: c.firstName,
    lastName: c.lastName,
    dateOfBirth: toDateInputValue(c.dateOfBirth),
    preferredLanguage: c.preferredLanguage,
    status: c.status,
    primaryPhone: c.primaryPhone ?? "",
    email: c.email ?? "",
    altPhone: c.altPhone ?? "",
    altContactName: c.altContactName ?? "",
    altContactRelationship: c.altContactRelationship ?? "",
    altContactRelationshipOther: c.altContactRelationshipOther ?? "",
    homeStreet: c.homeStreet ?? "",
    homeUnit: c.homeUnit ?? "",
    homeCity: c.homeCity ?? "",
    homeState: c.homeState ?? "",
    homeZip: c.homeZip ?? "",
    mailingSameAsHome: c.mailingSameAsHome,
    mailingStreet: c.mailingStreet ?? "",
    mailingUnit: c.mailingUnit ?? "",
    mailingCity: c.mailingCity ?? "",
    mailingState: c.mailingState ?? "",
    mailingZip: c.mailingZip ?? "",
    programs: {
      MEDICARE: {
        enabled: Boolean(medicare),
        beneficiaryNumber: "",
        partAEffectiveDate: toDateInputValue(medicare?.partAEffectiveDate),
        partBEffectiveDate: toDateInputValue(medicare?.partBEffectiveDate),
      },
      MEDICAID: { enabled: Boolean(program("MEDICAID")), beneficiaryNumber: "" },
      ACA: { enabled: Boolean(program("ACA")) },
    },
    conditionIds: c.conditions.flatMap((cc) => (cc.conditionId ? [cc.conditionId] : [])),
    customConditions: c.conditions.flatMap((cc) => (cc.customName ? [cc.customName] : [])),
    assignedAgentId: c.assignedAgentId ?? "",
  };

  // Con edición básica (asistente), programas, números y condiciones NO se envían al navegador:
  // el formulario no los muestra y el servidor los ignora al guardar.
  if (!canEditMedicalAndPrograms(scope)) {
    const empty = emptyClientForm();
    return {
      values: { ...values, programs: empty.programs, conditionIds: [], customConditions: [] },
      scope,
      savedNumbersLast4: { MEDICARE: null, MEDICAID: null },
    };
  }

  return {
    values,
    scope,
    savedNumbersLast4: {
      MEDICARE: medicare?.beneficiaryNumberLast4 ?? null,
      MEDICAID: program("MEDICAID")?.beneficiaryNumberLast4 ?? null,
    },
  };
}

/** Opciones para el formulario: catálogo de condiciones y, si puede asignar, los agentes. */
export async function getClientFormOptions(user: CurrentUser) {
  const [conditions, agents] = await Promise.all([
    prisma.chronicCondition.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
      select: { id: true, nameEs: true, nameEn: true },
    }),
    user.permissions.has(PERMISSIONS.CLIENT_ASSIGN)
      ? prisma.user.findMany({
          where: { isActive: true, role: { key: { in: ["ADMIN", "AGENT"] } } },
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
  ]);
  return { conditions, agents, canAssign: user.permissions.has(PERMISSIONS.CLIENT_ASSIGN) };
}

// ─────────────────────────────────────────────────────────────────────────────
// Escritura
// ─────────────────────────────────────────────────────────────────────────────

/** Valores del formulario → columnas de la tabla clients (solo los campos permitidos). */
function clientColumns(v: ClientFormValues, allowed: readonly ClientField[]) {
  const separateMailing = !v.mailingSameAsHome;
  const all: Record<ClientField, unknown> = {
    firstName: v.firstName,
    lastName: v.lastName,
    dateOfBirth: parseDateOnly(v.dateOfBirth),
    status: v.status,
    preferredLanguage: v.preferredLanguage,
    primaryPhone: v.primaryPhone ?? null,
    email: v.email ?? null,
    altPhone: v.altPhone ?? null,
    altContactName: v.altContactName ?? null,
    altContactRelationship: v.altContactRelationship ?? null,
    altContactRelationshipOther:
      v.altContactRelationship === "OTHER" ? (v.altContactRelationshipOther ?? null) : null,
    homeStreet: v.homeStreet ?? null,
    homeUnit: v.homeUnit ?? null,
    homeCity: v.homeCity ?? null,
    homeState: v.homeState ?? null,
    homeZip: v.homeZip ?? null,
    mailingSameAsHome: v.mailingSameAsHome,
    mailingStreet: separateMailing ? (v.mailingStreet ?? null) : null,
    mailingUnit: separateMailing ? (v.mailingUnit ?? null) : null,
    mailingCity: separateMailing ? (v.mailingCity ?? null) : null,
    mailingState: separateMailing ? (v.mailingState ?? null) : null,
    mailingZip: separateMailing ? (v.mailingZip ?? null) : null,
  };
  return Object.fromEntries(allowed.map((f) => [f, all[f]])) as Partial<
    Record<ClientField, unknown>
  >;
}

const DIFF_OPTIONS = {
  fields: [...FULL_CLIENT_FIELDS, "assignedAgentId"] as const,
  dateOnly: ["dateOfBirth"] as const,
};

async function resolveAssignedAgent(
  user: CurrentUser,
  requested: string | undefined,
  fallback: string | null,
): Promise<string | null> {
  if (!user.permissions.has(PERMISSIONS.CLIENT_ASSIGN) || !requested) return fallback;
  const agent = await prisma.user.findFirst({
    where: { id: requested, isActive: true },
    select: { id: true },
  });
  if (!agent) throw new ServiceError("INVALID", "assignedAgentId");
  return agent.id;
}

type Tx = Prisma.TransactionClient;

async function syncPrograms(
  tx: Tx,
  clientId: string,
  actorId: string,
  programs: ClientFormValues["programs"],
) {
  const protector = getFieldProtector();
  const catalog = await tx.coverageProgram.findMany({ select: { id: true, code: true } });
  const programId = (code: ProgramCode) => {
    const found = catalog.find((p) => p.code === code);
    if (!found) throw new ServiceError("INVALID", "programs");
    return found.id;
  };
  const existing = await tx.clientProgramEnrollment.findMany({
    where: { clientId, deletedAt: null },
    include: { program: { select: { code: true } } },
  });

  for (const code of PROGRAM_CODES) {
    const input = programs[code];
    const current = existing.find((e) => e.program.code === code);
    const number =
      "beneficiaryNumber" in input && input.beneficiaryNumber
        ? protector.protect(SENSITIVE_FIELDS.BENEFICIARY_NUMBER, input.beneficiaryNumber)
        : null;
    const partA = code === "MEDICARE" ? parseDateOnly(programs.MEDICARE.partAEffectiveDate) : null;
    const partB = code === "MEDICARE" ? parseDateOnly(programs.MEDICARE.partBEffectiveDate) : null;

    if (input.enabled && !current) {
      const created = await tx.clientProgramEnrollment.create({
        data: {
          clientId,
          programId: programId(code),
          beneficiaryNumberEnc: number?.enc,
          beneficiaryNumberIdx: number?.idx,
          beneficiaryNumberLast4: number?.last4,
          partAEffectiveDate: partA,
          partBEffectiveDate: partB,
        },
      });
      await recordActivity(tx, {
        clientId,
        actorId,
        entityType: "enrollment",
        entityId: created.id,
        action: "CREATE",
        changes: {
          program: { from: null, to: code },
          ...(number ? { beneficiaryNumber: { changed: true } } : {}),
          ...diffChanges(
            null,
            { partAEffectiveDate: partA, partBEffectiveDate: partB },
            {
              fields: ["partAEffectiveDate", "partBEffectiveDate"],
              dateOnly: ["partAEffectiveDate", "partBEffectiveDate"],
            },
          ),
        },
      });
    } else if (input.enabled && current) {
      const dateChanges =
        code === "MEDICARE"
          ? diffChanges(
              {
                partAEffectiveDate: current.partAEffectiveDate,
                partBEffectiveDate: current.partBEffectiveDate,
              },
              { partAEffectiveDate: partA, partBEffectiveDate: partB },
              {
                fields: ["partAEffectiveDate", "partBEffectiveDate"],
                dateOnly: ["partAEffectiveDate", "partBEffectiveDate"],
              },
            )
          : null;
      const numberChanged = number !== null && number.idx !== current.beneficiaryNumberIdx;
      if (dateChanges || numberChanged) {
        await tx.clientProgramEnrollment.update({
          where: { id: current.id },
          data: {
            ...(code === "MEDICARE"
              ? { partAEffectiveDate: partA, partBEffectiveDate: partB }
              : {}),
            ...(numberChanged
              ? {
                  beneficiaryNumberEnc: number.enc,
                  beneficiaryNumberIdx: number.idx,
                  beneficiaryNumberLast4: number.last4,
                }
              : {}),
          },
        });
        await recordActivity(tx, {
          clientId,
          actorId,
          entityType: "enrollment",
          entityId: current.id,
          action: "UPDATE",
          changes: {
            ...dateChanges,
            ...(numberChanged ? { beneficiaryNumber: { changed: true } } : {}),
          },
        });
      }
    } else if (!input.enabled && current) {
      await tx.clientProgramEnrollment.update({
        where: { id: current.id },
        data: { deletedAt: new Date() },
      });
      await recordActivity(tx, {
        clientId,
        actorId,
        entityType: "enrollment",
        entityId: current.id,
        action: "DELETE",
        changes: { program: { from: code, to: null } },
      });
    }
  }
}

async function syncConditions(
  tx: Tx,
  clientId: string,
  actorId: string,
  conditionIds: string[],
  customConditions: string[],
) {
  const catalog = await tx.chronicCondition.findMany({
    where: { isActive: true },
    select: { id: true, nameEs: true, nameEn: true },
  });
  const catalogIds = new Set(catalog.map((c) => c.id));
  if (conditionIds.some((id) => !catalogIds.has(id)))
    throw new ServiceError("INVALID", "conditionIds");

  // Un nombre propio que coincide con el catálogo se guarda como del catálogo (permite filtrar).
  const desiredIds = new Set(conditionIds);
  const desiredCustom = new Map<string, string>();
  for (const name of customConditions) {
    const match = catalog.find(
      (c) =>
        c.nameEs.toLowerCase() === name.toLowerCase() ||
        c.nameEn.toLowerCase() === name.toLowerCase(),
    );
    if (match) desiredIds.add(match.id);
    else desiredCustom.set(name.toLowerCase(), name);
  }

  const existing = await tx.clientCondition.findMany({ where: { clientId, deletedAt: null } });
  const label = (id: string) => catalog.find((c) => c.id === id)?.nameEn ?? id;

  for (const cc of existing) {
    const keep = cc.conditionId
      ? desiredIds.has(cc.conditionId)
      : desiredCustom.has((cc.customName ?? "").toLowerCase());
    if (keep) {
      if (cc.conditionId) desiredIds.delete(cc.conditionId);
      else desiredCustom.delete((cc.customName ?? "").toLowerCase());
      continue;
    }
    await tx.clientCondition.update({ where: { id: cc.id }, data: { deletedAt: new Date() } });
    await recordActivity(tx, {
      clientId,
      actorId,
      entityType: "condition",
      entityId: cc.id,
      action: "DELETE",
      changes: {
        condition: { from: cc.conditionId ? label(cc.conditionId) : cc.customName, to: null },
      },
    });
  }

  for (const conditionId of desiredIds) {
    const created = await tx.clientCondition.create({ data: { clientId, conditionId } });
    await recordActivity(tx, {
      clientId,
      actorId,
      entityType: "condition",
      entityId: created.id,
      action: "CREATE",
      changes: { condition: { from: null, to: label(conditionId) } },
    });
  }
  for (const customName of desiredCustom.values()) {
    const created = await tx.clientCondition.create({ data: { clientId, customName } });
    await recordActivity(tx, {
      clientId,
      actorId,
      entityType: "condition",
      entityId: created.id,
      action: "CREATE",
      changes: { condition: { from: null, to: customName } },
    });
  }
}

export async function createClient(user: CurrentUser, values: ClientFormValues): Promise<string> {
  if (!user.permissions.has(PERMISSIONS.CLIENT_CREATE))
    return deny(user, PERMISSIONS.CLIENT_CREATE);
  const assignedAgentId = await resolveAssignedAgent(user, values.assignedAgentId, user.id);
  const columns = clientColumns(values, FULL_CLIENT_FIELDS);

  try {
    return await prisma.$transaction(async (tx) => {
      const client = await tx.client.create({
        data: {
          ...(columns as Prisma.ClientUncheckedCreateInput),
          assignedAgentId,
          createdById: user.id,
        },
      });
      await recordActivity(tx, {
        clientId: client.id,
        actorId: user.id,
        entityType: "client",
        entityId: client.id,
        action: "CREATE",
        changes: diffChanges(null, { ...columns, assignedAgentId }, DIFF_OPTIONS),
      });
      await syncPrograms(tx, client.id, user.id, values.programs);
      await syncConditions(tx, client.id, user.id, values.conditionIds, values.customConditions);
      return client.id;
    });
  } catch (error) {
    return rethrowDbError(error);
  }
}

export async function updateClient(
  user: CurrentUser,
  clientId: string,
  values: ClientFormValues,
): Promise<void> {
  const scope = clientEditScope(user);
  if (scope === "none") return deny(user, PERMISSIONS.CLIENT_UPDATE);

  const existing = await prisma.client.findFirst({
    where: { id: clientId, ...clientVisibilityWhere(user) },
  });
  if (!existing) throw new ServiceError("NOT_FOUND");

  // Los campos que el rol no puede editar se ignoran aunque lleguen en la petición.
  const columns = clientColumns(values, editableClientFields(scope));
  const assignedAgentId = await resolveAssignedAgent(
    user,
    values.assignedAgentId,
    existing.assignedAgentId,
  );

  try {
    await prisma.$transaction(async (tx) => {
      const changes = diffChanges(
        existing as unknown as Record<string, unknown>,
        { ...columns, assignedAgentId },
        DIFF_OPTIONS,
      );
      if (changes) {
        await tx.client.update({
          where: { id: clientId },
          data: { ...(columns as Prisma.ClientUncheckedUpdateInput), assignedAgentId },
        });
        await recordActivity(tx, {
          clientId,
          actorId: user.id,
          entityType: "client",
          entityId: clientId,
          action: "UPDATE",
          changes,
        });
      }
      if (canEditMedicalAndPrograms(scope)) {
        await syncPrograms(tx, clientId, user.id, values.programs);
        await syncConditions(tx, clientId, user.id, values.conditionIds, values.customConditions);
      }
    });
  } catch (error) {
    rethrowDbError(error);
  }
}

/** Cambio rápido de estatus (desde la tabla o el perfil). Requiere edición completa. */
export async function updateClientStatus(
  user: CurrentUser,
  clientId: string,
  status: (typeof CLIENT_STATUSES)[number],
): Promise<void> {
  if (!user.permissions.has(PERMISSIONS.CLIENT_UPDATE))
    return deny(user, PERMISSIONS.CLIENT_UPDATE);
  if (!(CLIENT_STATUSES as readonly string[]).includes(status))
    throw new ServiceError("INVALID", "status");
  const existing = await prisma.client.findFirst({
    where: { id: clientId, ...clientVisibilityWhere(user) },
    select: { id: true, status: true },
  });
  if (!existing) throw new ServiceError("NOT_FOUND");
  if (existing.status === status) return;

  try {
    await prisma.$transaction(async (tx) => {
      await tx.client.update({ where: { id: clientId }, data: { status } });
      await recordActivity(tx, {
        clientId,
        actorId: user.id,
        entityType: "client",
        entityId: clientId,
        action: "UPDATE",
        changes: { status: { from: existing.status, to: status } },
      });
    });
  } catch (error) {
    rethrowDbError(error);
  }
}

/** Borrado lógico: el cliente deja de verse, pero su información e historial se conservan. */
export async function deleteClient(user: CurrentUser, clientId: string): Promise<void> {
  if (!user.permissions.has(PERMISSIONS.CLIENT_DELETE))
    return deny(user, PERMISSIONS.CLIENT_DELETE);
  const existing = await prisma.client.findFirst({
    where: { id: clientId, ...clientVisibilityWhere(user) },
    select: { id: true },
  });
  if (!existing) throw new ServiceError("NOT_FOUND");

  try {
    await prisma.$transaction(async (tx) => {
      await tx.client.update({ where: { id: clientId }, data: { deletedAt: new Date() } });
      await recordActivity(tx, {
        clientId,
        actorId: user.id,
        entityType: "client",
        entityId: clientId,
        action: "DELETE",
      });
    });
  } catch (error) {
    rethrowDbError(error);
  }
}

/** Revela el número completo de Medicare/Medicaid. Requiere permiso y queda en auditoría. */
export async function revealBeneficiaryNumber(user: CurrentUser, enrollmentId: string) {
  if (!user.permissions.has(PERMISSIONS.SENSITIVE_REVEAL))
    return deny(user, PERMISSIONS.SENSITIVE_REVEAL);
  const enrollment = await prisma.clientProgramEnrollment.findFirst({
    where: { id: enrollmentId, deletedAt: null, client: clientVisibilityWhere(user) },
    select: {
      id: true,
      clientId: true,
      beneficiaryNumberEnc: true,
      program: { select: { code: true } },
    },
  });
  if (!enrollment?.beneficiaryNumberEnc) throw new ServiceError("NOT_FOUND");

  const value = getFieldProtector().decrypt(
    SENSITIVE_FIELDS.BENEFICIARY_NUMBER,
    enrollment.beneficiaryNumberEnc,
  );
  await recordAudit({
    action: "SENSITIVE_REVEALED",
    outcome: "SUCCESS",
    actorId: user.id,
    targetType: "enrollment",
    targetId: enrollment.id,
    metadata: {
      field: "beneficiary_number",
      program: enrollment.program.code,
      clientId: enrollment.clientId,
    },
  });
  return { value, programCode: enrollment.program.code };
}
