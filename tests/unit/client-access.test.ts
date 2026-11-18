import { describe, expect, it } from "vitest";
import { DEFAULT_ROLES, type PermissionKey } from "@/lib/permissions/catalog";
import {
  BASIC_CLIENT_FIELDS,
  canEditMedicalAndPrograms,
  clientEditScope,
  clientVisibilityWhere,
  editableClientFields,
} from "@/modules/clients/access";

const userWithRole = (key: string) => ({
  id: "u1",
  permissions: new Set<PermissionKey>(DEFAULT_ROLES.find((r) => r.key === key)!.permissions),
});

describe("visibilidad de clientes", () => {
  it("el administrador ve todos los clientes (no eliminados)", () => {
    expect(clientVisibilityWhere(userWithRole("ADMIN"))).toEqual({ deletedAt: null });
  });

  it("agente y asistente sin vínculos solo ven los clientes asignados a ellos", () => {
    for (const role of ["AGENT", "ASSISTANT"]) {
      expect(clientVisibilityWhere(userWithRole(role))).toEqual({
        deletedAt: null,
        assignedAgentId: { in: ["u1"] },
      });
    }
  });

  it("el asistente ve además los clientes de sus agentes vinculados", () => {
    const assistant = {
      ...userWithRole("ASSISTANT"),
      linkedAgentIds: ["agentA", "agentB", "agentA"],
    };
    expect(clientVisibilityWhere(assistant)).toEqual({
      deletedAt: null,
      assignedAgentId: { in: ["u1", "agentA", "agentB"] },
    });
  });

  it("los vínculos no amplían nada a quien ya ve todos", () => {
    const admin = { ...userWithRole("ADMIN"), linkedAgentIds: ["agentA"] };
    expect(clientVisibilityWhere(admin)).toEqual({ deletedAt: null });
  });
});

describe("edición de clientes por rol", () => {
  it("administrador y agente: edición completa", () => {
    expect(clientEditScope(userWithRole("ADMIN"))).toBe("full");
    expect(clientEditScope(userWithRole("AGENT"))).toBe("full");
    expect(canEditMedicalAndPrograms("full")).toBe(true);
  });

  it("asistente: solo contacto y dirección; nada de programas ni condiciones", () => {
    const scope = clientEditScope(userWithRole("ASSISTANT"));
    expect(scope).toBe("basic");
    expect(editableClientFields(scope)).toEqual(BASIC_CLIENT_FIELDS);
    expect(editableClientFields(scope)).not.toContain("status");
    expect(editableClientFields(scope)).not.toContain("dateOfBirth");
    expect(canEditMedicalAndPrograms(scope)).toBe(false);
  });

  it("sin permisos de edición no puede editar nada", () => {
    const scope = clientEditScope({ id: "u", permissions: new Set() });
    expect(scope).toBe("none");
    expect(editableClientFields(scope)).toEqual([]);
  });
});
