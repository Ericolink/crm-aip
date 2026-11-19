import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptBackup, encryptBackup, parseBackupKey } from "../../scripts/backup/crypto";
import { AUDIT_ACTIONS } from "@/lib/audit/sanitize";
import { buildCsp, createNonce } from "@/lib/security/csp";
import en from "@/messages/en.json";
import es from "@/messages/es.json";

describe("Content-Security-Policy", () => {
  it("producción: scripts solo con nonce, sin eval ni inline, sin iframes ni incrustación", () => {
    const csp = buildCsp("abc123");
    const script = csp.split("; ").find((d) => d.startsWith("script-src"))!;
    expect(script).toBe("script-src 'self' 'nonce-abc123' 'strict-dynamic'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("form-action 'self'");
    expect(csp).toContain("connect-src 'self'");
    expect(csp).toContain("upgrade-insecure-requests");
  });

  it("desarrollo: permite eval (errores de React) y la recarga en caliente", () => {
    const csp = buildCsp("abc", { dev: true });
    expect(csp).toContain("'unsafe-eval'");
    expect(csp).toContain("connect-src 'self' ws:");
    expect(csp).not.toContain("upgrade-insecure-requests");
  });

  it("nonce aleatorio de 128 bits", () => {
    const a = createNonce();
    expect(Buffer.from(a, "base64")).toHaveLength(16);
    expect(createNonce()).not.toBe(a);
  });
});

describe("respaldos cifrados", () => {
  const key = randomBytes(32);
  const data = Buffer.from("PGDMP volcado de prueba con datos ficticios");

  it("ida y vuelta; el archivo no contiene el texto original", () => {
    const file = encryptBackup(data, key);
    expect(file.subarray(0, 6).toString()).toBe("CRMBK1");
    expect(file.includes(Buffer.from("ficticios"))).toBe(false);
    expect(decryptBackup(file, key)).toEqual(data);
  });

  it("falla con otra llave o si el archivo se altera", () => {
    const file = encryptBackup(data, key);
    expect(() => decryptBackup(file, randomBytes(32))).toThrow(/llave|alterado/);
    const tampered = Buffer.from(file);
    tampered[tampered.length - 1] ^= 1;
    expect(() => decryptBackup(tampered, key)).toThrow(/alterado/);
    expect(() => decryptBackup(Buffer.from("otra cosa"), key)).toThrow(/no es un respaldo/);
  });

  it("exige una llave de 32 bytes", () => {
    expect(() => parseBackupKey(undefined)).toThrow(/BACKUP_ENCRYPTION_KEY/);
    expect(() => parseBackupKey(Buffer.alloc(16).toString("base64"))).toThrow();
    expect(parseBackupKey(key.toString("base64"))).toEqual(key);
  });
});

describe("bitácora de auditoría", () => {
  it("cada acción tiene etiqueta en español e inglés", () => {
    for (const action of AUDIT_ACTIONS) {
      expect(es.Settings.audit.actions).toHaveProperty(action);
      expect(en.Settings.audit.actions).toHaveProperty(action);
    }
  });
});
