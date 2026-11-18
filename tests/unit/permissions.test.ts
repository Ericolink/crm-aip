import { describe, expect, it } from "vitest";
import {
  ALL_PERMISSIONS,
  DEFAULT_ROLES,
  PERMISSIONS,
  ROLE_KEYS,
  isPermissionKey,
} from "@/lib/permissions/catalog";

const role = (key: string) => DEFAULT_ROLES.find((r) => r.key === key)!;

describe("catálogo de permisos", () => {
  it("no tiene claves duplicadas", () => {
    expect(new Set(ALL_PERMISSIONS).size).toBe(ALL_PERMISSIONS.length);
  });

  it("todas las claves siguen el formato dominio.accion", () => {
    for (const key of ALL_PERMISSIONS) expect(key).toMatch(/^[a-z_]+(\.[a-z_]+)+$/);
  });

  it("los roles solo usan permisos que existen en el catálogo", () => {
    for (const r of DEFAULT_ROLES) {
      for (const p of r.permissions) expect(isPermissionKey(p), `${r.key}: ${p}`).toBe(true);
    }
  });

  it("existen exactamente los tres roles iniciales con nombre en ambos idiomas", () => {
    expect(DEFAULT_ROLES.map((r) => r.key).sort()).toEqual(["ADMIN", "AGENT", "ASSISTANT"]);
    for (const r of DEFAULT_ROLES) {
      expect(r.nameEs.length).toBeGreaterThan(0);
      expect(r.nameEn.length).toBeGreaterThan(0);
    }
  });
});

describe("permisos por rol", () => {
  it("el administrador tiene todos los permisos", () => {
    expect([...role(ROLE_KEYS.ADMIN).permissions].sort()).toEqual([...ALL_PERMISSIONS].sort());
  });

  it("solo el administrador administra usuarios, configuración y auditoría", () => {
    for (const key of [ROLE_KEYS.AGENT, ROLE_KEYS.ASSISTANT]) {
      const perms = role(key).permissions;
      expect(perms).not.toContain(PERMISSIONS.USER_MANAGE);
      expect(perms).not.toContain(PERMISSIONS.SETTINGS_MANAGE);
      expect(perms).not.toContain(PERMISSIONS.AUDIT_READ);
    }
  });

  it("agente y asistente no pueden eliminar clientes, ver todos los clientes ni exportar", () => {
    for (const key of [ROLE_KEYS.AGENT, ROLE_KEYS.ASSISTANT]) {
      const perms = role(key).permissions;
      expect(perms).not.toContain(PERMISSIONS.CLIENT_DELETE);
      expect(perms).not.toContain(PERMISSIONS.CLIENT_READ_ALL);
      expect(perms).not.toContain(PERMISSIONS.DATA_EXPORT);
      expect(perms).not.toContain(PERMISSIONS.DATA_IMPORT);
    }
  });

  it("el agente gestiona a sus clientes: registrar, editar, médicos, medicamentos y aseguranzas", () => {
    const perms = role(ROLE_KEYS.AGENT).permissions;
    for (const p of [
      PERMISSIONS.CLIENT_CREATE,
      PERMISSIONS.CLIENT_UPDATE,
      PERMISSIONS.MEDICAL_READ,
      PERMISSIONS.INSURANCE_READ,
      PERMISSIONS.NOTE_CREATE,
      PERMISSIONS.REMINDER_MANAGE,
    ]) {
      expect(perms).toContain(p);
    }
  });

  it("el asistente no ve información médica ni identificadores completos", () => {
    const perms = role(ROLE_KEYS.ASSISTANT).permissions;
    expect(perms).not.toContain(PERMISSIONS.MEDICAL_READ);
    expect(perms).not.toContain(PERMISSIONS.INSURANCE_READ);
    expect(perms).not.toContain(PERMISSIONS.SENSITIVE_REVEAL);
    expect(perms).not.toContain(PERMISSIONS.CLIENT_UPDATE);
    expect(perms).toContain(PERMISSIONS.CLIENT_UPDATE_BASIC);
    expect(perms).toContain(PERMISSIONS.NOTE_CREATE);
    expect(perms).toContain(PERMISSIONS.REMINDER_MANAGE);
  });
});
