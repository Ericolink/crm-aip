import { describe, expect, it } from "vitest";
import { parseServerEnv } from "@/lib/env";

const SECRET = "contrasena-super-secreta-123";

describe("validación de variables de entorno", () => {
  it("acepta una configuración válida", () => {
    const env = parseServerEnv({
      NODE_ENV: "test",
      DATABASE_URL: `postgresql://user:${SECRET}@127.0.0.1:5432/db`,
    });
    expect(env.NODE_ENV).toBe("test");
  });

  it("falla si falta DATABASE_URL y nombra la variable", () => {
    expect(() => parseServerEnv({})).toThrow(/DATABASE_URL/);
  });

  it("rechaza URLs que no son de PostgreSQL", () => {
    expect(() => parseServerEnv({ DATABASE_URL: "mysql://u:p@localhost/db" })).toThrow(
      /PostgreSQL/,
    );
  });

  it("nunca incluye el valor de la variable en el mensaje de error", () => {
    try {
      parseServerEnv({ DATABASE_URL: `mysql://user:${SECRET}@localhost/db` });
      expect.unreachable();
    } catch (error) {
      expect(String(error)).not.toContain(SECRET);
    }
  });
});
