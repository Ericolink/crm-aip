import { describe, expect, it } from "vitest";
import { describeDbErrorForLog, toSafeDbError } from "@/lib/db-errors";

// Formas reales capturadas de Prisma 7 + adapter-pg (con datos ficticios).
const PII_ROW = "Failing row contains (c1, Linda, Herrera, 1949-10-01, linda@example.com, 12345)";

const checkError = {
  name: "PrismaClientKnownRequestError",
  code: "P2039",
  message: `violates check constraint ... ${PII_ROW}`,
  meta: {
    modelName: "Client",
    driverAdapterError: {
      cause: {
        originalCode: "23514",
        originalMessage:
          'new row for relation "clients" violates check constraint "clients_primary_phone_digits"',
        kind: "postgres",
        detail: PII_ROW,
      },
    },
  },
};
const uniqueError = {
  code: "P2002",
  meta: {
    driverAdapterError: {
      cause: {
        originalCode: "23505",
        kind: "UniqueConstraintViolation",
        constraint: { index: "client_doctors_one_active_pcp" },
      },
    },
  },
};
const fkError = {
  code: "P2003",
  meta: {
    driverAdapterError: {
      cause: { originalCode: "23503", constraint: { index: "client_doctors_clientId_fkey" } },
    },
  },
};
const triggerError = {
  code: "P2039",
  meta: {
    driverAdapterError: {
      cause: {
        originalCode: "P0001",
        originalMessage: "activity_logs es de solo inserción: DELETE no está permitido",
      },
    },
  },
};

describe("errores de base de datos seguros", () => {
  it("clasifica violaciones de reglas", () => {
    expect(toSafeDbError(checkError)).toEqual({
      kind: "check_violation",
      constraint: "clients_primary_phone_digits",
    });
    expect(toSafeDbError(uniqueError)).toEqual({
      kind: "unique_violation",
      constraint: "client_doctors_one_active_pcp",
    });
    expect(toSafeDbError(fkError).kind).toBe("foreign_key_violation");
    expect(toSafeDbError(triggerError)).toEqual({ kind: "append_only", constraint: null });
    expect(toSafeDbError({ code: "P2025" }).kind).toBe("not_found");
  });

  it("nunca deja pasar datos de la fila (detail) ni el mensaje original", () => {
    const text = JSON.stringify(toSafeDbError(checkError)) + describeDbErrorForLog(checkError);
    expect(text).not.toContain("Linda");
    expect(text).not.toContain("1949");
    expect(text).not.toContain("example.com");
    expect(describeDbErrorForLog(checkError)).toBe(
      "db_error kind=check_violation constraint=clients_primary_phone_digits",
    );
  });

  it("descarta nombres de regla que no son identificadores", () => {
    const evil = {
      code: "P2002",
      meta: { driverAdapterError: { cause: { constraint: { index: "x'; DROP TABLE (Linda)" } } } },
    };
    expect(toSafeDbError(evil)).toEqual({ kind: "unique_violation", constraint: null });
  });

  it("cualquier otra cosa es 'unknown' sin detalles", () => {
    expect(toSafeDbError(new Error(PII_ROW))).toEqual({ kind: "unknown", constraint: null });
    expect(toSafeDbError(null)).toEqual({ kind: "unknown", constraint: null });
    expect(describeDbErrorForLog("texto")).toBe("db_error kind=unknown");
  });
});
