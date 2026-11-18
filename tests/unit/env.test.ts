import { describe, expect, it } from "vitest";
import { parseServerEnv } from "@/lib/env";

const SECRET = "contrasena-super-secreta-123";
const valid = {
  NODE_ENV: "test",
  DATABASE_URL: `postgresql://user:${SECRET}@127.0.0.1:5432/db`,
  BETTER_AUTH_SECRET: "x".repeat(44),
  BETTER_AUTH_URL: "http://localhost:3000",
  FIELD_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString("base64"),
  BLIND_INDEX_KEY: Buffer.alloc(32, 2).toString("base64"),
};

describe("validación de variables de entorno", () => {
  it("acepta una configuración válida", () => {
    expect(parseServerEnv(valid).NODE_ENV).toBe("test");
  });

  it("falla si falta DATABASE_URL y nombra la variable", () => {
    expect(() => parseServerEnv({ ...valid, DATABASE_URL: undefined })).toThrow(/DATABASE_URL/);
  });

  it("rechaza URLs que no son de PostgreSQL", () => {
    expect(() => parseServerEnv({ ...valid, DATABASE_URL: "mysql://u:p@localhost/db" })).toThrow(
      /PostgreSQL/,
    );
  });

  it("exige un secreto de autenticación de al menos 32 caracteres", () => {
    expect(() => parseServerEnv({ ...valid, BETTER_AUTH_SECRET: "corto" })).toThrow(
      /BETTER_AUTH_SECRET/,
    );
  });

  it("exige llaves de cifrado de 32 bytes", () => {
    const short = Buffer.alloc(16, 1).toString("base64");
    expect(() => parseServerEnv({ ...valid, FIELD_ENCRYPTION_KEY: short })).toThrow(
      /FIELD_ENCRYPTION_KEY/,
    );
    expect(() => parseServerEnv({ ...valid, BLIND_INDEX_KEY: undefined })).toThrow(
      /BLIND_INDEX_KEY/,
    );
  });

  it("nunca incluye el valor de la variable en el mensaje de error", () => {
    try {
      parseServerEnv({ ...valid, DATABASE_URL: `mysql://user:${SECRET}@localhost/db` });
      expect.unreachable();
    } catch (error) {
      expect(String(error)).not.toContain(SECRET);
    }
  });
});
