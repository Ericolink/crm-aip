import { beforeAll, describe, expect, it } from "vitest";
import type { CurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/db";
import { ServiceError } from "@/lib/service-error";
import { utcToZonedLocal } from "@/lib/timezone";
import { clientFormSchema } from "@/modules/clients/schema";
import { createClient } from "@/modules/clients/service";
import { reminderSchema } from "@/modules/reminders/schema";
import {
  assignableUsers,
  closeReminder,
  createReminder,
  listReminders,
  overdueCountForUser,
  searchClientsForReminder,
  updateReminder,
} from "@/modules/reminders/service";
import { linkAssistantToAgent } from "@/modules/users/service";
import { asCurrentUser, clientInput, createTestUser } from "./helpers";

const expectError = async (p: Promise<unknown>, code: ServiceError["code"], field?: string) => {
  await expect(p).rejects.toBeInstanceOf(ServiceError);
  await expect(p).rejects.toMatchObject(field ? { code, field } : { code });
};
const inHours = (h: number) => utcToZonedLocal(new Date(Date.now() + h * 3_600_000));
const rem = (overrides: Record<string, unknown> = {}) =>
  reminderSchema.parse({
    description: "Llamada de seguimiento",
    dueAt: inHours(24),
    priority: "NORMAL",
    ...overrides,
  });

let admin: CurrentUser;
let agent: CurrentUser;
let otherAgent: CurrentUser;
let assistant: CurrentUser;
let clientId: string;

beforeAll(async () => {
  admin = await createTestUser("ADMIN", "Admin Recordatorios");
  agent = await createTestUser("AGENT", "Agente Recordatorios");
  otherAgent = await createTestUser("AGENT", "Otro Agente Recordatorios");
  const a = await createTestUser("ASSISTANT", "Asistente Recordatorios");
  await linkAssistantToAgent(admin, a.id, agent.id);
  assistant = await asCurrentUser(a.id);
  clientId = await createClient(
    agent,
    clientFormSchema.parse(clientInput({ firstName: "Rosalía", lastName: "Recordatorio" })),
  );
});

describe("crear", () => {
  it("guarda la hora de Florida correctamente y lo asigna a quien lo crea", async () => {
    const id = await createReminder(agent, clientId, rem({ dueAt: "2027-01-15T10:00" }));
    const r = await prisma.reminder.findUniqueOrThrow({ where: { id } });
    expect(r.dueAt.toISOString()).toBe("2027-01-15T15:00:00.000Z");
    expect(r.assignedToId).toBe(agent.id);
    expect(r.status).toBe("PENDING");
    const log = await prisma.activityLog.findFirstOrThrow({
      where: { entityId: id, action: "CREATE" },
    });
    expect(log.changes).toMatchObject({
      description: { to: "Llamada de seguimiento" },
      assignedTo: { to: "Agente Recordatorios" },
    });
  });

  it("el asistente vinculado crea recordatorios y puede asignarlos a su agente", async () => {
    const id = await createReminder(
      assistant,
      clientId,
      rem({ assignedToId: agent.id, priority: "URGENT" }),
    );
    expect((await prisma.reminder.findUniqueOrThrow({ where: { id } })).assignedToId).toBe(
      agent.id,
    );
  });

  it("no se puede asignar a alguien que no ve al cliente", async () => {
    await expectError(
      createReminder(agent, clientId, rem({ assignedToId: otherAgent.id })),
      "INVALID",
      "assignedToId",
    );
    const options = (await assignableUsers(agent, clientId)).map((u) => u.id);
    expect(options).toEqual(expect.arrayContaining([agent.id, assistant.id, admin.id]));
    expect(options).not.toContain(otherAgent.id);
  });

  it("otro agente no puede crear para un cliente ajeno; valida fecha y texto", async () => {
    await expectError(createReminder(otherAgent, clientId, rem()), "NOT_FOUND");
    expect(
      reminderSchema.safeParse({ description: "", dueAt: inHours(1), priority: "NORMAL" }).success,
    ).toBe(false);
    expect(
      reminderSchema.safeParse({ description: "x", dueAt: "2026-02-30T10:00", priority: "NORMAL" })
        .success,
    ).toBe(false);
    expect(
      reminderSchema.safeParse({ description: "x", dueAt: "2099-01-01T10:00", priority: "NORMAL" })
        .success,
    ).toBe(false);
  });

  it("busca clientes visibles por nombre sin acentos", async () => {
    expect((await searchClientsForReminder(agent, "rosalia")).map((c) => c.id)).toContain(clientId);
    expect(await searchClientsForReminder(otherAgent, "rosalia")).toEqual([]);
  });
});

describe("listar", () => {
  it("pendientes (lo más próximo primero), vencidos y contador del menú", async () => {
    await createReminder(
      agent,
      clientId,
      rem({ description: "Ya vencido", dueAt: inHours(-3), priority: "HIGH" }),
    );
    const pending = await listReminders(agent, { view: "pending", clientId });
    const times = pending.reminders.map((r) => r.dueAt.getTime());
    expect([...times].sort((a, b) => a - b)).toEqual(times);
    expect(pending.reminders[0]).toMatchObject({ description: "Ya vencido", overdue: true });
    const overdue = await listReminders(agent, { view: "overdue", clientId });
    expect(overdue.reminders.map((r) => r.description)).toEqual(["Ya vencido"]);
    expect(overdue.counts.overdue).toBe(1);
    expect(await overdueCountForUser(agent)).toBeGreaterThanOrEqual(1);
  });

  it("'asignados a mí' vs. todos los de mis clientes", async () => {
    const mine = await listReminders(assistant, { view: "pending", mine: true, clientId });
    const all = await listReminders(assistant, { view: "pending", clientId });
    expect(mine.reminders).toHaveLength(0);
    expect(all.reminders.length).toBeGreaterThan(0);
  });

  it("otro agente no ve recordatorios de clientes ajenos", async () => {
    expect((await listReminders(otherAgent, { view: "pending", clientId })).reminders).toEqual([]);
  });
});

describe("editar, posponer, completar y cancelar", () => {
  const pendingOf = async (description: string) =>
    prisma.reminder.findFirstOrThrow({ where: { clientId, description, status: "PENDING" } });

  it("posponer cambia la fecha y queda en el historial; sin cambios no registra", async () => {
    const r = await pendingOf("Ya vencido");
    const before = await prisma.activityLog.count({ where: { entityId: r.id } });
    await updateReminder(
      agent,
      r.id,
      rem({ description: "Ya vencido", dueAt: utcToZonedLocal(r.dueAt), priority: "HIGH" }),
    );
    expect(await prisma.activityLog.count({ where: { entityId: r.id } })).toBe(before);
    await updateReminder(
      agent,
      r.id,
      rem({ description: "Ya vencido", dueAt: "2027-03-01T09:30", priority: "HIGH" }),
    );
    expect(
      (await prisma.reminder.findUniqueOrThrow({ where: { id: r.id } })).dueAt.toISOString(),
    ).toBe("2027-03-01T14:30:00.000Z");
    const log = await prisma.activityLog.findFirstOrThrow({
      where: { entityId: r.id, action: "UPDATE" },
    });
    expect(Object.keys(log.changes as object)).toEqual(["dueAt"]);
  });

  it("completar y cancelar; después ya no se pueden modificar", async () => {
    const a = await pendingOf("Ya vencido");
    await closeReminder(agent, a.id, "DONE");
    const done = await prisma.reminder.findUniqueOrThrow({ where: { id: a.id } });
    expect(done.status).toBe("DONE");
    expect(done.completedAt).not.toBeNull();
    await expectError(closeReminder(agent, a.id, "CANCELLED"), "INVALID", "status");
    await expectError(updateReminder(agent, a.id, rem()), "INVALID", "status");

    const b = await pendingOf("Llamada de seguimiento");
    await closeReminder(assistant, b.id, "CANCELLED");
    expect(
      (await prisma.reminder.findUniqueOrThrow({ where: { id: b.id } })).cancelledAt,
    ).not.toBeNull();
    expect(
      (await listReminders(agent, { view: "done", clientId })).reminders.map((r) => r.id),
    ).toContain(a.id);
    expect(
      (await listReminders(agent, { view: "cancelled", clientId })).reminders.map((r) => r.id),
    ).toContain(b.id);
  });

  it("otro agente no puede modificar recordatorios ajenos", async () => {
    const r = await prisma.reminder.findFirstOrThrow({ where: { clientId, status: "PENDING" } });
    await expectError(updateReminder(otherAgent, r.id, rem()), "NOT_FOUND");
    await expectError(closeReminder(otherAgent, r.id, "DONE"), "NOT_FOUND");
  });
});
