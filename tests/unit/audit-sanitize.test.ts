import { describe, expect, it } from "vitest";
import { clientIpFrom, sanitizeAuditMetadata, userAgentFrom } from "@/lib/audit/sanitize";

describe("metadatos de auditoría", () => {
  it("descarta claves con datos sensibles aunque se pasen por error", () => {
    const result = sanitizeAuditMetadata({
      password: "x",
      email: "a@b.com",
      medicareNumber: "1EG4",
      memberId: "123",
      phone: "555",
      dateOfBirth: "1950-01-01",
      totpCode: "123456",
      sessionToken: "abc",
      status: 401,
      permission: "client.read",
    });
    expect(result).toEqual({ status: 401, permission: "client.read" });
  });

  it("solo acepta valores primitivos", () => {
    const result = sanitizeAuditMetadata({ ok: true, nested: { a: 1 }, list: [1, 2], n: null });
    expect(result).toEqual({ ok: true, n: null });
  });

  it("recorta textos largos y limita el número de claves", () => {
    const long = sanitizeAuditMetadata({ note: "x".repeat(1000) });
    expect(String(long?.note).length).toBe(200);
    const many = Object.fromEntries(Array.from({ length: 50 }, (_, i) => [`k${i}`, i]));
    expect(Object.keys(sanitizeAuditMetadata(many)!).length).toBe(20);
  });

  it("devuelve undefined si no queda nada", () => {
    expect(sanitizeAuditMetadata({ password: "x" })).toBeUndefined();
    expect(sanitizeAuditMetadata(undefined)).toBeUndefined();
  });
});

describe("datos de conexión", () => {
  it("toma la primera IP de x-forwarded-for", () => {
    expect(clientIpFrom(new Headers({ "x-forwarded-for": "203.0.113.5, 10.0.0.1" }))).toBe(
      "203.0.113.5",
    );
    expect(clientIpFrom(new Headers())).toBeNull();
    expect(clientIpFrom(null)).toBeNull();
  });

  it("recorta el user-agent", () => {
    expect(userAgentFrom(new Headers({ "user-agent": "a".repeat(500) }))?.length).toBe(300);
  });
});
