import "server-only";
import en from "@/messages/en.json";
import es from "@/messages/es.json";
import { recordAudit } from "@/lib/audit/audit-log";
import type { CurrentUser } from "@/lib/auth/session";
import { getFieldProtector, maskLast4, SENSITIVE_FIELDS } from "@/lib/crypto";
import { prisma } from "@/lib/db";
import { formatPhone, toDateInputValue } from "@/lib/format";
import { PERMISSIONS } from "@/lib/permissions/catalog";
import { ServiceError } from "@/lib/service-error";
import { DEFAULT_SORT, type ClientListParams } from "@/modules/clients/list-params";
import { buildClientWhere, clientOrderBy } from "@/modules/clients/search";
import { resolveIdentifierSearch } from "@/modules/clients/service";
import { IMPORT_COLUMNS, type Locale } from "./columns";
import { MIME, writeTable, type FileFormat } from "./spreadsheet";

/**
 * Exportación de clientes con los MISMOS filtros y visibilidad que la lista.
 * - Coberturas e identificadores solo con `insurance.read`.
 * - Identificadores completos solo con `data.export_sensitive` + `client.sensitive.reveal`
 *   (administrador) y confirmación explícita; si no, "•••• 1234".
 * - Cada exportación queda en export_jobs y en auditoría (sin el texto buscado).
 */

export const EXPORT_MAX_ROWS = 10_000;

const EXTRA_HEADERS = {
  assignedAgentName: { es: "Agente asignado", en: "Assigned agent" },
  createdAt: { es: "Fecha de alta", en: "Created" },
  programs: { es: "Programas", en: "Programs" },
  medicareNumber: { es: "Nº de Medicare", en: "Medicare number" },
  medicaidNumber: { es: "Nº de Medicaid", en: "Medicaid number" },
  carrier: { es: "Aseguradora actual", en: "Current carrier" },
  plan: { es: "Plan", en: "Plan" },
  insuranceStatus: { es: "Estatus de cobertura", en: "Coverage status" },
  effectiveDate: { es: "Fecha efectiva", en: "Effective date" },
  memberNumber: { es: "Nº de miembro", en: "Member number" },
} as const;

type ExportColumn = (typeof IMPORT_COLUMNS)[number]["key"] | keyof typeof EXTRA_HEADERS;

const BASE_COLUMNS: ExportColumn[] = [
  ...IMPORT_COLUMNS.map((c) => c.key),
  "assignedAgentName",
  "createdAt",
];
const INSURANCE_COLUMNS: ExportColumn[] = [
  "programs",
  "medicareNumber",
  "medicaidNumber",
  "carrier",
  "plan",
  "insuranceStatus",
  "effectiveDate",
  "memberNumber",
];

export function canExportSensitive(user: CurrentUser): boolean {
  return (
    user.permissions.has(PERMISSIONS.DATA_EXPORT_SENSITIVE) &&
    user.permissions.has(PERMISSIONS.SENSITIVE_REVEAL) &&
    user.permissions.has(PERMISSIONS.INSURANCE_READ)
  );
}

export type ExportRequest = {
  format: FileFormat;
  params: ClientListParams;
  includeSensitive: boolean;
  locale: Locale;
};

export type ExportFile = { fileName: string; mimeType: string; bytes: Buffer; rowCount: number };

export async function exportClients(
  user: CurrentUser,
  request: ExportRequest,
): Promise<ExportFile> {
  if (!user.permissions.has(PERMISSIONS.DATA_EXPORT)) {
    await recordAudit({
      action: "ACCESS_DENIED",
      outcome: "DENIED",
      actorId: user.id,
      metadata: { permission: PERMISSIONS.DATA_EXPORT },
    });
    throw new ServiceError("FORBIDDEN");
  }
  if (request.includeSensitive && !canExportSensitive(user)) {
    await recordAudit({
      action: "ACCESS_DENIED",
      outcome: "DENIED",
      actorId: user.id,
      metadata: { permission: PERMISSIONS.DATA_EXPORT_SENSITIVE },
    });
    throw new ServiceError("FORBIDDEN");
  }

  const seesInsurance = user.permissions.has(PERMISSIONS.INSURANCE_READ);
  const columns = [...BASE_COLUMNS, ...(seesInsurance ? INSURANCE_COLUMNS : [])];
  const { params, locale } = request;
  const identifierIndexes = await resolveIdentifierSearch(user, params.q);
  const where = buildClientWhere(user, params, { identifierIndexes });

  const total = await prisma.client.count({ where });
  if (total > EXPORT_MAX_ROWS) throw new ServiceError("INVALID", "tooManyRows");

  const rows = await prisma.client.findMany({
    where,
    orderBy: clientOrderBy(
      params.sort.startsWith("effective") && !seesInsurance ? DEFAULT_SORT : params.sort,
    ),
    include: {
      assignedAgent: { select: { name: true, email: true } },
      // Sin permiso de cobertura no se lee nada de coberturas (filtro que no devuelve filas).
      programs: {
        where: seesInsurance ? { deletedAt: null } : { id: { in: [] } },
        orderBy: { program: { sortOrder: "asc" } },
        include: { program: { select: { code: true } } },
      },
      insurances: {
        where: seesInsurance ? { isCurrent: true, deletedAt: null } : { id: { in: [] } },
        orderBy: { effectiveDate: { sort: "asc", nulls: "last" } },
        include: { carrier: { select: { name: true } } },
      },
    },
  });

  const m = locale === "en" ? en : es;
  const protector = request.includeSensitive ? getFieldProtector() : null;
  const identifier = (
    field: (typeof SENSITIVE_FIELDS)[keyof typeof SENSITIVE_FIELDS],
    enc: string | null,
    last4: string | null,
  ) => (protector && enc ? protector.decrypt(field, enc) : last4 ? maskLast4(last4) : "");
  const date = (d: Date | null | undefined) => (d ? toDateInputValue(d) : "");
  const join = (values: string[]) => values.filter(Boolean).join("; ");

  const data = rows.map((c) => {
    const { programs, insurances } = c;
    const enrollment = (code: string) => programs.find((p) => p.program.code === code);
    const medicare = enrollment("MEDICARE");
    const medicaid = enrollment("MEDICAID");
    const values: Record<ExportColumn, string> = {
      firstName: c.firstName,
      lastName: c.lastName,
      dateOfBirth: date(c.dateOfBirth),
      status: m.Clients.status[c.status],
      preferredLanguage: m.Clients.language[c.preferredLanguage],
      primaryPhone: formatPhone(c.primaryPhone),
      email: c.email ?? "",
      altPhone: formatPhone(c.altPhone),
      altContactName: c.altContactName ?? "",
      altContactRelationship: c.altContactRelationship
        ? m.Clients.relationship[c.altContactRelationship]
        : "",
      altContactRelationshipOther: c.altContactRelationshipOther ?? "",
      homeStreet: c.homeStreet ?? "",
      homeUnit: c.homeUnit ?? "",
      homeCity: c.homeCity ?? "",
      homeState: c.homeState ?? "",
      homeZip: c.homeZip ?? "",
      mailingStreet: c.mailingStreet ?? "",
      mailingUnit: c.mailingUnit ?? "",
      mailingCity: c.mailingCity ?? "",
      mailingState: c.mailingState ?? "",
      mailingZip: c.mailingZip ?? "",
      assignedAgentEmail: c.assignedAgent?.email ?? "",
      assignedAgentName: c.assignedAgent?.name ?? "",
      createdAt: date(c.createdAt),
      programs: join(
        programs.map(
          (p) =>
            m.Clients.programs[p.program.code as keyof typeof m.Clients.programs] ?? p.program.code,
        ),
      ),
      medicareNumber: medicare
        ? identifier(
            SENSITIVE_FIELDS.BENEFICIARY_NUMBER,
            medicare.beneficiaryNumberEnc,
            medicare.beneficiaryNumberLast4,
          )
        : "",
      medicaidNumber: medicaid
        ? identifier(
            SENSITIVE_FIELDS.BENEFICIARY_NUMBER,
            medicaid.beneficiaryNumberEnc,
            medicaid.beneficiaryNumberLast4,
          )
        : "",
      carrier: join(insurances.map((i) => i.carrier.name)),
      plan: join(insurances.map((i) => i.planName ?? "")),
      insuranceStatus: join(insurances.map((i) => m.Insurance.statuses[i.status])),
      effectiveDate: join(insurances.map((i) => date(i.effectiveDate))),
      memberNumber: join(
        insurances.map((i) =>
          identifier(SENSITIVE_FIELDS.MEMBER_NUMBER, i.memberNumberEnc, i.memberNumberLast4),
        ),
      ),
    };
    return columns.map((k) => values[k]);
  });

  const headerFor = (k: ExportColumn) =>
    k in EXTRA_HEADERS
      ? EXTRA_HEADERS[k as keyof typeof EXTRA_HEADERS][locale]
      : IMPORT_COLUMNS.find((c) => c.key === k)![locale];
  const bytes = await writeTable(request.format, columns.map(headerFor), data);

  const includesSensitive = request.includeSensitive && seesInsurance;
  const { q, page: _page, ...filters } = params;
  const job = await prisma.exportJob.create({
    data: {
      createdById: user.id,
      format: request.format,
      // El texto buscado puede ser un nombre o un identificador: no se guarda.
      filters: { ...filters, hasSearch: Boolean(q) },
      columns,
      rowCount: data.length,
      includesSensitive,
    },
  });
  await recordAudit({
    action: "DATA_EXPORTED",
    outcome: "SUCCESS",
    actorId: user.id,
    targetType: "export_job",
    targetId: job.id,
    metadata: { format: request.format, rows: data.length, includesSensitive },
  });

  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
  return {
    fileName: `${locale === "en" ? "clients" : "clientes"}-${day}.${request.format.toLowerCase()}`,
    mimeType: MIME[request.format],
    bytes,
    rowCount: data.length,
  };
}

export async function buildTemplate(user: CurrentUser, format: FileFormat, locale: Locale) {
  if (!user.permissions.has(PERMISSIONS.DATA_IMPORT)) throw new ServiceError("FORBIDDEN");
  const bytes = await writeTable(
    format,
    IMPORT_COLUMNS.map((c) => c[locale]),
    [],
  );
  return {
    fileName: `${locale === "en" ? "clients-template" : "plantilla-clientes"}.${format.toLowerCase()}`,
    mimeType: MIME[format],
    bytes,
  };
}
