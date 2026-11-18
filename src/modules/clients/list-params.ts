import { z } from "zod";
import { parseDateOnly } from "@/lib/format";
import { CLIENT_STATUSES, PROGRAM_CODES } from "./schema";

/**
 * Parámetros de la lista de clientes, guardados en la URL (se pueden compartir y
 * funcionan con el botón "atrás"). Cualquier valor inválido se ignora en silencio.
 */

export const CLIENT_SORTS = [
  "created_desc",
  "created_asc",
  "effective_asc",
  "effective_desc",
  "name_asc",
] as const;
export type ClientSort = (typeof CLIENT_SORTS)[number];

export const DEFAULT_SORT: ClientSort = "created_desc";
export const PAGE_SIZE = 25;

export type ClientListParams = {
  q?: string;
  statuses: (typeof CLIENT_STATUSES)[number][];
  program?: (typeof PROGRAM_CODES)[number];
  carrierId?: string;
  agentId?: string;
  conditionId?: string;
  createdFrom?: string;
  createdTo?: string;
  effectiveFrom?: string;
  effectiveTo?: string;
  sort: ClientSort;
  page: number;
};

type RawParams = Record<string, string | string[] | undefined>;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const id = z.string().regex(/^[A-Za-z0-9-]{1,64}$/);
const date = z.string().refine((v) => parseDateOnly(v) !== null);

function pick<T>(schema: z.ZodType<T>, value: unknown): T | undefined {
  const r = schema.safeParse(value);
  return r.success ? r.data : undefined;
}

export function parseClientListParams(raw: RawParams): ClientListParams {
  const q = first(raw.q)?.trim().slice(0, 100);
  const statusValues = (Array.isArray(raw.status) ? raw.status : (raw.status ?? "").split(","))
    .map((s) => s.trim().toUpperCase())
    .filter((s): s is ClientListParams["statuses"][number] =>
      (CLIENT_STATUSES as readonly string[]).includes(s),
    );
  const page = Number(first(raw.page));

  return {
    q: q || undefined,
    statuses: [...new Set(statusValues)],
    program: pick(z.enum(PROGRAM_CODES), first(raw.program)),
    carrierId: pick(id, first(raw.carrier)),
    agentId: pick(id, first(raw.agent)),
    conditionId: pick(id, first(raw.condition)),
    createdFrom: pick(date, first(raw.createdFrom)),
    createdTo: pick(date, first(raw.createdTo)),
    effectiveFrom: pick(date, first(raw.effectiveFrom)),
    effectiveTo: pick(date, first(raw.effectiveTo)),
    sort: pick(z.enum(CLIENT_SORTS), first(raw.sort)) ?? DEFAULT_SORT,
    page: Number.isInteger(page) && page > 0 && page < 100_000 ? page : 1,
  };
}

/**
 * Parámetros → query string. `overrides` cambia valores (undefined = quitar).
 * Cambiar cualquier filtro vuelve a la página 1 salvo que se indique `page`.
 */
export function clientListQuery(
  params: ClientListParams,
  overrides: Partial<ClientListParams> = {},
): string {
  const merged = { ...params, page: 1, ...overrides };
  const qs = new URLSearchParams();
  if (merged.q) qs.set("q", merged.q);
  if (merged.statuses.length) qs.set("status", merged.statuses.join(","));
  if (merged.program) qs.set("program", merged.program);
  if (merged.carrierId) qs.set("carrier", merged.carrierId);
  if (merged.agentId) qs.set("agent", merged.agentId);
  if (merged.conditionId) qs.set("condition", merged.conditionId);
  if (merged.createdFrom) qs.set("createdFrom", merged.createdFrom);
  if (merged.createdTo) qs.set("createdTo", merged.createdTo);
  if (merged.effectiveFrom) qs.set("effectiveFrom", merged.effectiveFrom);
  if (merged.effectiveTo) qs.set("effectiveTo", merged.effectiveTo);
  if (merged.sort !== DEFAULT_SORT) qs.set("sort", merged.sort);
  if (merged.page > 1) qs.set("page", String(merged.page));
  const s = qs.toString();
  return s ? `?${s}` : "";
}

/** ¿Hay algún filtro aplicado (sin contar orden ni página)? */
export function hasActiveFilters(p: ClientListParams): boolean {
  return Boolean(
    p.q ||
    p.statuses.length ||
    p.program ||
    p.carrierId ||
    p.agentId ||
    p.conditionId ||
    p.createdFrom ||
    p.createdTo ||
    p.effectiveFrom ||
    p.effectiveTo,
  );
}
