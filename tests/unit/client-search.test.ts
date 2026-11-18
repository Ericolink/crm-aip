import { describe, expect, it } from "vitest";
import { DEFAULT_ROLES, type PermissionKey } from "@/lib/permissions/catalog";
import {
  clientListQuery,
  hasActiveFilters,
  parseClientListParams,
} from "@/modules/clients/list-params";
import {
  buildClientWhere,
  canSearchIdentifiers,
  clientOrderBy,
  easternDayStart,
  identifierCandidate,
  normalizeSearchText,
  phoneSearchDigits,
  searchTokens,
} from "@/modules/clients/search";

const userWithRole = (key: string, linkedAgentIds: string[] = []) => ({
  id: "me",
  linkedAgentIds,
  permissions: new Set<PermissionKey>(DEFAULT_ROLES.find((r) => r.key === key)!.permissions),
});

describe("parámetros de la lista (URL)", () => {
  it("lee filtros válidos e ignora los inválidos", () => {
    const p = parseClientListParams({
      q: "  maría  ",
      status: "urgent,PENDING,vip",
      program: "MEDICARE",
      carrier: "abc123",
      sort: "effective_asc",
      page: "3",
      createdFrom: "2026-02-30",
      effectiveTo: "2026-12-31",
    });
    expect(p).toMatchObject({
      q: "maría",
      statuses: ["URGENT", "PENDING"],
      program: "MEDICARE",
      carrierId: "abc123",
      sort: "effective_asc",
      page: 3,
      effectiveTo: "2026-12-31",
    });
    expect(p.createdFrom).toBeUndefined();
  });

  it("valores maliciosos o fuera de rango vuelven a los valores por defecto", () => {
    const p = parseClientListParams({
      program: "DROP TABLE",
      carrier: "x'; --",
      sort: "password",
      page: "-4",
    });
    expect(p).toMatchObject({
      program: undefined,
      carrierId: undefined,
      sort: "created_desc",
      page: 1,
    });
  });

  it("genera la URL y vuelve a la página 1 al cambiar un filtro", () => {
    const p = parseClientListParams({ q: "rosa", page: "4", status: "NEW" });
    expect(clientListQuery(p, { program: "ACA" })).toBe("?q=rosa&status=NEW&program=ACA");
    expect(clientListQuery(p, { page: 5 })).toBe("?q=rosa&status=NEW&page=5");
    expect(clientListQuery(parseClientListParams({}))).toBe("");
  });

  it("detecta si hay filtros activos", () => {
    expect(hasActiveFilters(parseClientListParams({ sort: "name_asc", page: "2" }))).toBe(false);
    expect(hasActiveFilters(parseClientListParams({ condition: "c1" }))).toBe(true);
  });
});

describe("texto de búsqueda", () => {
  it("quita acentos y mayúsculas como la columna searchName", () => {
    expect(normalizeSearchText(" María JOSÉ Núñez ")).toBe("maria jose nunez");
  });

  it("separa palabras y elimina comodines de SQL", () => {
    expect(searchTokens("Gómez  %_ María")).toEqual(["gomez", "maria"]);
  });

  it("reconoce teléfonos", () => {
    expect(phoneSearchDigits("(305) 555-0142")).toBe("3055550142");
    expect(phoneSearchDigits("+1 305 555 0142")).toBe("3055550142");
    expect(phoneSearchDigits("0142")).toBe("0142");
    expect(phoneSearchDigits("12")).toBeNull();
    expect(phoneSearchDigits("rosa")).toBeNull();
  });

  it("reconoce posibles identificadores", () => {
    expect(identifierCandidate("0eg4-te5-mk73")).toBe("0EG4TE5MK73");
    expect(identifierCandidate("DEMO1234567")).toBe("DEMO1234567");
    expect(identifierCandidate("Rosa")).toBeNull();
    expect(identifierCandidate("1234")).toBeNull();
  });

  it("solo quien puede revelar números puede buscar por ellos", () => {
    expect(canSearchIdentifiers(userWithRole("ADMIN"))).toBe(true);
    expect(canSearchIdentifiers(userWithRole("AGENT"))).toBe(true);
    expect(canSearchIdentifiers(userWithRole("ASSISTANT"))).toBe(false);
  });
});

describe("fechas de creación en hora de Florida", () => {
  it("el día empieza a medianoche del Este (EST y EDT)", () => {
    expect(easternDayStart("2026-01-15").toISOString()).toBe("2026-01-15T05:00:00.000Z");
    expect(easternDayStart("2026-07-15").toISOString()).toBe("2026-07-15T04:00:00.000Z");
  });
});

describe("consulta de la lista", () => {
  it("la visibilidad es siempre la primera condición", () => {
    const where = buildClientWhere(userWithRole("AGENT"), parseClientListParams({ q: "rosa" }));
    expect((where.AND as unknown[])[0]).toEqual({
      deletedAt: null,
      assignedAgentId: { in: ["me"] },
    });
  });

  it("combina búsqueda, estatus, programa, aseguradora, condición y fechas", () => {
    const where = buildClientWhere(
      userWithRole("ADMIN"),
      parseClientListParams({
        q: "maria gomez",
        status: "NEW,URGENT",
        program: "MEDICAID",
        carrier: "car1",
        condition: "cond1",
        effectiveFrom: "2026-01-01",
      }),
    );
    const and = where.AND as Record<string, unknown>[];
    expect(and).toHaveLength(7);
    expect(and[1]).toEqual({
      OR: [{ AND: [{ searchName: { contains: "maria" } }, { searchName: { contains: "gomez" } }] }],
    });
    expect(and[2]).toEqual({ status: { in: ["NEW", "URGENT"] } });
  });

  it("puede ignorar el estatus para contar por estatus", () => {
    const where = buildClientWhere(
      userWithRole("ADMIN"),
      parseClientListParams({ status: "NEW" }),
      {
        ignoreStatus: true,
      },
    );
    expect(where.AND).toHaveLength(1);
  });

  it("solo incluye la búsqueda por identificador si se le pasan los índices", () => {
    const p = parseClientListParams({ q: "DEMO1234567" });
    const without = JSON.stringify(buildClientWhere(userWithRole("ADMIN"), p));
    const withIdx = JSON.stringify(
      buildClientWhere(userWithRole("ADMIN"), p, {
        identifierIndexes: { beneficiary: "b", member: "m", confirmation: "c" },
      }),
    );
    expect(without).not.toContain("memberNumberIdx");
    expect(withIdx).toContain("memberNumberIdx");
  });

  it("filtrar por un agente no visible no amplía el acceso: no devuelve nada", () => {
    const agent = buildClientWhere(userWithRole("AGENT"), parseClientListParams({ agent: "otro" }));
    expect((agent.AND as unknown[])[1]).toEqual({ id: { in: [] } });
    const assistant = buildClientWhere(
      userWithRole("ASSISTANT", ["agenteVinculado"]),
      parseClientListParams({ agent: "agenteVinculado" }),
    );
    expect((assistant.AND as unknown[])[1]).toEqual({ assignedAgentId: "agenteVinculado" });
  });

  it("una búsqueda sin términos válidos no devuelve todo", () => {
    const where = buildClientWhere(userWithRole("ADMIN"), parseClientListParams({ q: "%%%" }));
    expect((where.AND as unknown[])[1]).toEqual({ id: { in: [] } });
  });

  it("orden por fecha efectiva deja al final a quien no tiene", () => {
    expect(clientOrderBy("effective_asc")[0]).toEqual({
      currentEffectiveDate: { sort: "asc", nulls: "last" },
    });
  });
});
