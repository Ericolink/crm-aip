import { verifyPassword } from "better-auth/crypto";
import { beforeAll, describe, expect, it } from "vitest";
import type { CurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/db";
import { ServiceError } from "@/lib/service-error";
import {
  createCondition,
  createConsentType,
  listConditions,
  moveCondition,
  updateCondition,
  updateConsentType,
} from "@/modules/catalogs/service";
import { clientFormSchema } from "@/modules/clients/schema";
import { createClient, getClientFormOptions, updateClient } from "@/modules/clients/service";
import { reminderSchema } from "@/modules/reminders/schema";
import { createReminder } from "@/modules/reminders/service";
import {
  createUser,
  resetUserPassword,
  resetUserTwoFactor,
  setUserActive,
  updateUser,
} from "@/modules/users/management";
import { linkAssistantToAgent } from "@/modules/users/service";
import { asCurrentUser, clientInput, createTestUser } from "./helpers";

const expectError = async (p: Promise<unknown>, code: ServiceError["code"], field?: string) => {
  await expect(p).rejects.toBeInstanceOf(ServiceError);
  await expect(p).rejects.toMatchObject(field ? { code, field } : { code });
};

const tag = Date.now().toString(36);
const email = (name: string) => `${name}-${tag}@ejemplo.local`;
const newUser = (overrides: Record<string, unknown> = {}) => ({
  name: "Usuario Prueba",
  email: email(Math.random().toString(36).slice(2, 8)),
  roleKey: "AGENT" as const,
  preferredLocale: "es" as const,
  password: "frase-larga-de-prueba-1",
  ...overrides,
});

let admin: CurrentUser;
let agent: CurrentUser;
let receiver: CurrentUser;

beforeAll(async () => {
  admin = await createTestUser("ADMIN", "Admin Usuarios");
  agent = await createTestUser("AGENT", "Agente Usuarios");
  receiver = await createTestUser("AGENT", "Agente Receptor");
});

describe("alta de usuarios", () => {
  it("crea la cuenta con contraseña (hash) y obliga a cambiarla", async () => {
    const id = await createUser(admin, newUser({ email: email("nueva"), roleKey: "ASSISTANT" }));
    const user = await prisma.user.findUniqueOrThrow({
      where: { id },
      include: { role: true, accounts: true },
    });
    expect(user).toMatchObject({
      email: email("nueva"),
      mustChangePassword: true,
      isActive: true,
      twoFactorEnabled: false,
    });
    expect(user.role.key).toBe("ASSISTANT");
    const hash = user.accounts[0].password!;
    expect(hash).not.toContain("frase-larga");
    expect(await verifyPassword({ hash, password: "frase-larga-de-prueba-1" })).toBe(true);
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { action: "USER_CREATED", targetId: id },
    });
    expect(audit.metadata).toEqual({ role: "ASSISTANT" });
    // La sesión ve la marca y la usa para exigir el cambio.
    expect((await asCurrentUser(id)).mustChangePassword).toBe(true);
  });

  it("correo repetido (sin importar mayúsculas) → conflicto", async () => {
    await createUser(admin, newUser({ email: email("repetido") }));
    await expectError(
      createUser(admin, newUser({ email: email("repetido").toUpperCase() })),
      "CONFLICT",
      "email",
    );
  });

  it("solo con user.manage", async () => {
    await expectError(createUser(agent, newUser()), "FORBIDDEN");
  });
});

describe("edición y roles", () => {
  it("cambia nombre, correo, idioma y rol (auditado sin datos personales)", async () => {
    const id = await createUser(admin, newUser({ email: email("editar") }));
    await updateUser(admin, id, {
      name: "Nombre Nuevo",
      email: email("editado"),
      roleKey: "ADMIN",
      preferredLocale: "en",
    });
    const user = await prisma.user.findUniqueOrThrow({ where: { id }, include: { role: true } });
    expect(user).toMatchObject({ name: "Nombre Nuevo", preferredLocale: "en" });
    expect(user.role.key).toBe("ADMIN");
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { action: "USER_UPDATED", targetId: id },
    });
    expect(audit.metadata).toMatchObject({
      renamed: true,
      loginChanged: true,
      roleFrom: "AGENT",
      roleTo: "ADMIN",
    });
    expect(JSON.stringify(audit.metadata)).not.toContain("Nombre Nuevo");
  });

  it("nadie puede cambiarse su propio rol", async () => {
    await expectError(
      updateUser(admin, admin.id, {
        name: admin.name,
        email: admin.email,
        roleKey: "AGENT",
        preferredLocale: "es",
      }),
      "INVALID",
      "roleKey.self",
    );
  });

  it("asistente → agente: se desactivan sus vínculos (no conserva acceso a otros clientes)", async () => {
    const a = await createTestUser("ASSISTANT", "Asistente que asciende");
    await linkAssistantToAgent(admin, a.id, agent.id);
    expect((await asCurrentUser(a.id)).linkedAgentIds).toEqual([agent.id]);
    await updateUser(admin, a.id, {
      name: a.name,
      email: a.email,
      roleKey: "AGENT",
      preferredLocale: "es",
    });
    expect((await asCurrentUser(a.id)).linkedAgentIds).toEqual([]);
  });

  it("agente con clientes → asistente: exige reasignar y los mueve con historial", async () => {
    const ag = await createTestUser("AGENT", "Agente que pasa a asistente");
    const clientId = await createClient(
      ag,
      clientFormSchema.parse(clientInput({ lastName: `Rol${tag}` })),
    );
    const input = {
      name: ag.name,
      email: ag.email,
      roleKey: "ASSISTANT" as const,
      preferredLocale: "es" as const,
    };
    await expectError(updateUser(admin, ag.id, input), "INVALID", "reassignToId.required");
    await updateUser(admin, ag.id, input, receiver.id);
    const client = await prisma.client.findUniqueOrThrow({ where: { id: clientId } });
    expect(client.assignedAgentId).toBe(receiver.id);
    const log = await prisma.activityLog.findFirstOrThrow({
      where: { clientId, action: "UPDATE", entityType: "client" },
    });
    expect(log.changes).toEqual({ assignedAgentId: { from: ag.id, to: receiver.id } });
  });
});

describe("desactivar y reactivar", () => {
  it("con clientes y recordatorios: exige reasignar, los mueve, cierra sesiones y bloquea el acceso", async () => {
    const ag = await createTestUser("AGENT", "Agente que se va");
    const clientId = await createClient(
      ag,
      clientFormSchema.parse(clientInput({ lastName: `Baja${tag}` })),
    );
    const reminderId = await createReminder(
      ag,
      clientId,
      reminderSchema.parse({
        description: "Llamar",
        dueAt: "2027-06-15T10:00",
        priority: "NORMAL",
      }),
    );
    await prisma.session.create({
      data: {
        id: `s-${tag}`,
        token: `t-${tag}`,
        userId: ag.id,
        expiresAt: new Date(Date.now() + 60_000),
      },
    });

    await expectError(setUserActive(admin, ag.id, false), "INVALID", "reassignToId.required");
    await expectError(
      setUserActive(admin, ag.id, false, ag.id),
      "INVALID",
      "reassignToId.invalidOption",
    );

    const moved = await setUserActive(admin, ag.id, false, receiver.id);
    expect(moved).toEqual({ clients: 1, reminders: 1 });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: ag.id } })).isActive).toBe(false);
    expect(await prisma.session.count({ where: { userId: ag.id } })).toBe(0);
    expect(
      (await prisma.reminder.findUniqueOrThrow({ where: { id: reminderId } })).assignedToId,
    ).toBe(receiver.id);
    const reminderLog = await prisma.activityLog.findFirstOrThrow({
      where: { entityId: reminderId, action: "UPDATE" },
    });
    expect(reminderLog.changes).toEqual({
      assignedTo: { from: "Agente que se va", to: "Agente Receptor" },
    });
    // No se puede reasignar a un usuario inactivo.
    const other = await createTestUser("AGENT", "Otro");
    await createClient(other, clientFormSchema.parse(clientInput()));
    await expectError(
      setUserActive(admin, other.id, false, ag.id),
      "INVALID",
      "reassignToId.invalidOption",
    );

    await setUserActive(admin, ag.id, true);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: ag.id } })).isActive).toBe(true);
    expect(
      await prisma.auditLog.count({
        where: { targetId: ag.id, action: { in: ["USER_DEACTIVATED", "USER_REACTIVATED"] } },
      }),
    ).toBe(2);
  });

  it("sin clientes no pide reasignar; nadie puede desactivarse a sí mismo", async () => {
    const empty = await createTestUser("ASSISTANT", "Asistente sin cartera");
    expect(await setUserActive(admin, empty.id, false)).toEqual({ clients: 0, reminders: 0 });
    await expectError(setUserActive(admin, admin.id, false), "INVALID", "user.self");
  });
});

describe("restablecimientos", () => {
  it("contraseña: nueva contraseña temporal, cambio obligatorio y sesiones cerradas", async () => {
    const u = await createTestUser("AGENT", "Olvidó su contraseña");
    await prisma.account.create({
      data: {
        id: `acc-${tag}`,
        userId: u.id,
        accountId: u.id,
        providerId: "credential",
        password: "x",
      },
    });
    await prisma.session.create({
      data: {
        id: `s2-${tag}`,
        token: `t2-${tag}`,
        userId: u.id,
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    await expectError(resetUserPassword(admin, u.id, "corta"), "INVALID", "password.tooShort");
    await resetUserPassword(admin, u.id, "otra-frase-temporal-9");
    const account = await prisma.account.findUniqueOrThrow({ where: { id: `acc-${tag}` } });
    expect(
      await verifyPassword({ hash: account.password!, password: "otra-frase-temporal-9" }),
    ).toBe(true);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: u.id } })).mustChangePassword).toBe(
      true,
    );
    expect(await prisma.session.count({ where: { userId: u.id } })).toBe(0);
    await expectError(
      resetUserPassword(admin, admin.id, "otra-frase-temporal-9"),
      "INVALID",
      "user.self",
    );
  });

  it("2FA: borra el secreto y obliga a configurarla de nuevo", async () => {
    const u = await createTestUser("AGENT", "Perdió el teléfono");
    await prisma.twoFactor.create({
      data: { id: `tf-${tag}`, userId: u.id, secret: "cifrado", backupCodes: "cifrados" },
    });
    await resetUserTwoFactor(admin, u.id);
    expect(await prisma.twoFactor.count({ where: { userId: u.id } })).toBe(0);
    expect((await asCurrentUser(u.id)).twoFactorEnabled).toBe(false);
    expect(
      await prisma.auditLog.count({ where: { action: "USER_2FA_RESET", targetId: u.id } }),
    ).toBe(1);
    await expectError(resetUserTwoFactor(agent, u.id), "FORBIDDEN");
  });
});

describe("catálogos", () => {
  it("condiciones: alta al final, nombre repetido, orden y desactivar sin quitarla al cliente", async () => {
    const id = await createCondition(admin, {
      nameEs: `Condición ${tag}`,
      nameEn: `Condition ${tag}`,
    });
    let list = await listConditions(admin);
    expect(list.at(-1)?.id).toBe(id);
    await expectError(
      createCondition(admin, { nameEs: `Otra ${tag}`, nameEn: `Condition ${tag}` }),
      "CONFLICT",
      "nameEn",
    );
    await moveCondition(admin, id, "up");
    list = await listConditions(admin);
    expect(list.at(-2)?.id).toBe(id);

    // Un cliente la tiene; luego se desactiva.
    const base = clientInput({ lastName: `Cond${tag}` });
    const clientId = await createClient(
      agent,
      clientFormSchema.parse({ ...base, conditionIds: [id] }),
    );
    await updateCondition(admin, id, { isActive: false });
    expect((await getClientFormOptions(agent)).conditions.some((c) => c.id === id)).toBe(false);
    expect(
      (await getClientFormOptions(agent, [id])).conditions.find((c) => c.id === id)?.isActive,
    ).toBe(false);

    // Editar al cliente conservándola funciona y no la borra…
    await updateClient(agent, clientId, clientFormSchema.parse({ ...base, conditionIds: [id] }));
    expect(
      await prisma.clientCondition.count({ where: { clientId, conditionId: id, deletedAt: null } }),
    ).toBe(1);
    // …pero no se puede asignar a un cliente nuevo.
    await expectError(
      createClient(agent, clientFormSchema.parse({ ...clientInput(), conditionIds: [id] })),
      "INVALID",
      "conditionIds",
    );
    expect((await listConditions(admin)).find((c) => c.id === id)?.clients).toBe(1);
  });

  it("tipos de consentimiento: código estable y único, vigencia y documento configurables", async () => {
    const a = await createConsentType(admin, {
      nameEs: "Prueba",
      nameEn: `Test consent ${tag}`,
      requiresDocument: true,
      defaultValidityDays: 365,
    });
    const b = await createConsentType(admin, {
      nameEs: "Prueba 2",
      nameEn: `Test consent ${tag}`,
      requiresDocument: false,
      defaultValidityDays: null,
    });
    const [ta, tb] = await Promise.all([
      prisma.consentType.findUniqueOrThrow({ where: { id: a } }),
      prisma.consentType.findUniqueOrThrow({ where: { id: b } }),
    ]);
    expect(ta.code).toBe(`TEST_CONSENT_${tag.toUpperCase()}`);
    expect(tb.code).toBe(`${ta.code}_2`);
    await updateConsentType(admin, a, {
      nameEs: "Renombrado",
      nameEn: "Renamed",
      requiresDocument: false,
      defaultValidityDays: null,
    });
    const updated = await prisma.consentType.findUniqueOrThrow({ where: { id: a } });
    expect(updated).toMatchObject({
      code: ta.code,
      nameEn: "Renamed",
      requiresDocument: false,
      defaultValidityDays: null,
    });
    await expectError(updateConsentType(agent, a, { isActive: false }), "FORBIDDEN");
  });
});
