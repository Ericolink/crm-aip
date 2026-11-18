import type { Prisma } from "@/generated/prisma/client";
import { normalizeIdentifier } from "@/lib/crypto/sensitive-field";
import { PERMISSIONS, type PermissionKey } from "@/lib/permissions/catalog";
import { clientVisibilityWhere, visibleAgentIds } from "./access";
import type { ClientListParams, ClientSort } from "./list-params";

/**
 * Construcción de la consulta de la lista de clientes. Funciones puras (sin base de datos).
 * La visibilidad por usuario se aplica SIEMPRE como primera condición.
 */

type UserLike = {
  id: string;
  permissions: ReadonlySet<PermissionKey>;
  linkedAgentIds?: readonly string[];
};

/** Minúsculas y sin acentos, igual que la columna searchName de la base. */
export function normalizeSearchText(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

/** Palabras de búsqueda (máx. 5, sin caracteres comodín de SQL). */
export function searchTokens(q: string): string[] {
  return normalizeSearchText(q)
    .replace(/[%_\\]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 0)
    .slice(0, 5);
}

/** Dígitos si el texto parece un teléfono (≥ 3 dígitos y solo caracteres de teléfono). */
export function phoneSearchDigits(q: string): string | null {
  if (!/^[\d\s()+.-]+$/.test(q)) return null;
  const digits = q.replace(/\D/g, "");
  return digits.length >= 3 ? digits.replace(/^1(?=\d{10}$)/, "") : null;
}

/**
 * Valor normalizado si el texto puede ser un identificador (miembro, confirmación,
 * Medicare/Medicaid): 5–40 caracteres alfanuméricos con al menos un dígito.
 */
export function identifierCandidate(q: string): string | null {
  const value = normalizeIdentifier(q);
  return /^[A-Z0-9]{5,40}$/.test(value) && /\d/.test(value) ? value : null;
}

/** Puede buscar por identificadores sensibles: los mismos usuarios que pueden revelarlos. */
export function canSearchIdentifiers(user: UserLike): boolean {
  return user.permissions.has(PERMISSIONS.SENSITIVE_REVEAL);
}

/** Índices ciegos precalculados por el servicio (la llave no vive en este módulo). */
export type IdentifierIndexes = { beneficiary: string; member: string; confirmation: string };

/** Inicio del día (00:00 de Florida) en UTC. Funciona con horario de verano. */
export function easternDayStart(dateOnly: string, timeZone = "America/New_York"): Date {
  const [y, m, d] = dateOnly.split("-").map(Number);
  const utcMidnight = Date.UTC(y, m - 1, d);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(new Date(utcMidnight));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asLocal = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
  const offset = asLocal - utcMidnight; // negativo en Florida (UTC-4/-5)
  return new Date(utcMidnight - offset);
}

function nextDay(dateOnly: string): string {
  const [y, m, d] = dateOnly.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

const asDate = (dateOnly: string) => new Date(`${dateOnly}T00:00:00.000Z`);

type WhereOptions = {
  /** Ignorar el filtro de estatus (para contar por estatus). */
  ignoreStatus?: boolean;
  identifierIndexes?: IdentifierIndexes | null;
};

export function buildClientWhere(
  user: UserLike,
  p: ClientListParams,
  options: WhereOptions = {},
): Prisma.ClientWhereInput {
  const and: Prisma.ClientWhereInput[] = [clientVisibilityWhere(user)];

  if (p.q) {
    const or: Prisma.ClientWhereInput[] = [];
    const tokens = searchTokens(p.q);
    if (tokens.length) {
      or.push({ AND: tokens.map((t) => ({ searchName: { contains: t } })) });
    }
    if (p.q.includes("@") || tokens.length === 1) {
      or.push({ email: { contains: normalizeSearchText(p.q), mode: "insensitive" } });
    }
    const digits = phoneSearchDigits(p.q);
    if (digits) {
      or.push({ primaryPhone: { contains: digits } }, { altPhone: { contains: digits } });
    }
    const idx = options.identifierIndexes;
    if (idx) {
      or.push(
        { programs: { some: { deletedAt: null, beneficiaryNumberIdx: idx.beneficiary } } },
        {
          insurances: {
            some: {
              deletedAt: null,
              OR: [{ memberNumberIdx: idx.member }, { confirmationNumberIdx: idx.confirmation }],
            },
          },
        },
      );
    }
    // Sin ninguna forma válida de buscar, no debe devolver todo.
    and.push(or.length ? { OR: or } : { id: { in: [] } });
  }

  if (p.statuses.length && !options.ignoreStatus) and.push({ status: { in: p.statuses } });
  if (p.program)
    and.push({ programs: { some: { deletedAt: null, program: { code: p.program } } } });
  if (p.carrierId) {
    and.push({
      insurances: { some: { deletedAt: null, isCurrent: true, carrierId: p.carrierId } },
    });
  }
  if (p.conditionId) {
    and.push({ conditions: { some: { deletedAt: null, conditionId: p.conditionId } } });
  }
  if (p.agentId) {
    // Solo se aplica si el usuario puede ver a ese agente; si no, no hay resultados.
    const allowed =
      user.permissions.has(PERMISSIONS.CLIENT_READ_ALL) ||
      visibleAgentIds(user).includes(p.agentId);
    and.push(allowed ? { assignedAgentId: p.agentId } : { id: { in: [] } });
  }
  if (p.createdFrom || p.createdTo) {
    and.push({
      createdAt: {
        ...(p.createdFrom ? { gte: easternDayStart(p.createdFrom) } : {}),
        ...(p.createdTo ? { lt: easternDayStart(nextDay(p.createdTo)) } : {}),
      },
    });
  }
  if (p.effectiveFrom || p.effectiveTo) {
    and.push({
      currentEffectiveDate: {
        ...(p.effectiveFrom ? { gte: asDate(p.effectiveFrom) } : {}),
        ...(p.effectiveTo ? { lte: asDate(p.effectiveTo) } : {}),
      },
    });
  }

  return { AND: and };
}

export function clientOrderBy(sort: ClientSort): Prisma.ClientOrderByWithRelationInput[] {
  switch (sort) {
    case "created_asc":
      return [{ createdAt: "asc" }, { id: "asc" }];
    case "effective_asc":
      return [
        { currentEffectiveDate: { sort: "asc", nulls: "last" } },
        { createdAt: "desc" },
        { id: "asc" },
      ];
    case "effective_desc":
      return [
        { currentEffectiveDate: { sort: "desc", nulls: "last" } },
        { createdAt: "desc" },
        { id: "asc" },
      ];
    case "name_asc":
      return [{ lastName: "asc" }, { firstName: "asc" }, { id: "asc" }];
    default:
      return [{ createdAt: "desc" }, { id: "asc" }];
  }
}
