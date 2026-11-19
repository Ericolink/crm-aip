import { beforeAll, describe, expect, it } from "vitest";
import type { CurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/db";
import { ServiceError } from "@/lib/service-error";
import { listClientActivity } from "@/modules/activity/service";
import { clientFormSchema } from "@/modules/clients/schema";
import { createClient, updateClientStatus } from "@/modules/clients/service";
import { addClientDoctorSchema } from "@/modules/doctors/schema";
import { addClientDoctor } from "@/modules/doctors/service";
import { noteSchema } from "@/modules/notes/schema";
import {
  createNote,
  deleteNote,
  latestImportantNote,
  listClientNotes,
  updateNote,
} from "@/modules/notes/service";
import { linkAssistantToAgent } from "@/modules/users/service";
import { asCurrentUser, clientInput, createTestUser } from "./helpers";

const expectError = async (p: Promise<unknown>, code: ServiceError["code"]) => {
  await expect(p).rejects.toBeInstanceOf(ServiceError);
  await expect(p).rejects.toMatchObject({ code });
};
const note = (body: string, isImportant: unknown = false) =>
  noteSchema.parse({ body, isImportant });

let admin: CurrentUser;
let agent: CurrentUser;
let otherAgent: CurrentUser;
let assistant: CurrentUser;
let clientId: string;

beforeAll(async () => {
  admin = await createTestUser("ADMIN", "Admin Notas");
  agent = await createTestUser("AGENT", "Agente Notas");
  otherAgent = await createTestUser("AGENT", "Otro Agente Notas");
  const a = await createTestUser("ASSISTANT", "Asistente Notas");
  await linkAssistantToAgent(admin, a.id, agent.id);
  assistant = await asCurrentUser(a.id);
  clientId = await createClient(agent, clientFormSchema.parse(clientInput({ lastName: "Notas" })));
});

describe("notas", () => {
  it("cada nota es un registro independiente con autor y fechas; orden más reciente primero", async () => {
    await createNote(agent, clientId, note("Se comunicó con el cliente."));
    await createNote(assistant, clientId, note("Esperando documentación.", "on"));
    const data = (await listClientNotes(agent, clientId))!;
    expect(data.notes.map((n) => n.body)).toEqual([
      "Esperando documentación.",
      "Se comunicó con el cliente.",
    ]);
    expect(data.notes[0]).toMatchObject({
      isImportant: true,
      author: { name: "Asistente Notas" },
      edited: false,
    });
    expect(data.importantCount).toBe(1);
  });

  it("filtra solo las importantes y muestra la última importante en el resumen", async () => {
    const data = (await listClientNotes(agent, clientId, { importantOnly: true }))!;
    expect(data.notes.map((n) => n.body)).toEqual(["Esperando documentación."]);
    expect((await latestImportantNote(agent, clientId))?.body).toBe("Esperando documentación.");
  });

  it("valida texto vacío o demasiado largo", () => {
    expect(noteSchema.safeParse({ body: "   " }).success).toBe(false);
    expect(noteSchema.safeParse({ body: "x".repeat(5001) }).success).toBe(false);
  });

  it("cada quien edita sus notas; el administrador puede editar cualquiera", async () => {
    const data = (await listClientNotes(agent, clientId))!;
    const mine = data.notes.find((n) => n.author.name === "Agente Notas")!;
    const theirs = data.notes.find((n) => n.author.name === "Asistente Notas")!;
    expect(mine.canModify).toBe(true);
    expect(theirs.canModify).toBe(false);
    await expectError(updateNote(agent, theirs.id, note("Cambio ajeno")), "FORBIDDEN");
    await expectError(deleteNote(agent, theirs.id), "FORBIDDEN");
    await updateNote(admin, theirs.id, note("Esperando documentación (actualizado).", true));
    expect((await prisma.note.findUniqueOrThrow({ where: { id: theirs.id } })).body).toBe(
      "Esperando documentación (actualizado).",
    );
  });

  it("editar no pierde el texto anterior: queda en el historial", async () => {
    const mine = (await listClientNotes(agent, clientId))!.notes.find(
      (n) => n.author.name === "Agente Notas",
    )!;
    await updateNote(
      agent,
      mine.id,
      note("Se comunicó con el cliente; quiere cambiar de aseguradora."),
    );
    const log = await prisma.activityLog.findFirstOrThrow({
      where: { entityId: mine.id, action: "UPDATE" },
    });
    expect(log.changes).toEqual({
      body: {
        from: "Se comunicó con el cliente.",
        to: "Se comunicó con el cliente; quiere cambiar de aseguradora.",
      },
    });
    const after = (await listClientNotes(agent, clientId))!.notes.find((n) => n.id === mine.id)!;
    expect(after.updatedAt.getTime()).toBeGreaterThanOrEqual(after.createdAt.getTime());
  });

  it("quitar es borrado lógico y su texto queda en el historial", async () => {
    const id = await createNote(agent, clientId, note("Nota temporal"));
    await deleteNote(agent, id);
    expect((await listClientNotes(agent, clientId))!.notes.map((n) => n.id)).not.toContain(id);
    expect((await prisma.note.findUniqueOrThrow({ where: { id } })).deletedAt).not.toBeNull();
    const log = await prisma.activityLog.findFirstOrThrow({
      where: { entityId: id, action: "DELETE" },
    });
    expect(log.changes).toEqual({ body: { from: "Nota temporal", to: null } });
    await expectError(deleteNote(agent, id), "NOT_FOUND");
  });

  it("otro agente no ve ni escribe notas de este cliente", async () => {
    expect(await listClientNotes(otherAgent, clientId)).toBeNull();
    await expectError(createNote(otherAgent, clientId, note("Intento")), "NOT_FOUND");
  });
});

describe("historial de actividad", () => {
  beforeAll(async () => {
    await updateClientStatus(agent, clientId, "URGENT");
    await addClientDoctor(
      agent,
      clientId,
      addClientDoctorSchema.parse({ name: "Dr. Historial", role: "PCP" }),
    );
  });

  it("el agente ve todo, del más reciente al más antiguo", async () => {
    const a = (await listClientActivity(agent, clientId))!;
    expect(a.entries.length).toBeGreaterThan(5);
    const times = a.entries.map((e) => e.createdAt.getTime());
    expect([...times].sort((x, y) => y - x)).toEqual(times);
    expect(a.entries.some((e) => e.entityType === "doctor")).toBe(true);
    expect(
      a.entries.find((e) => e.entityType === "client" && e.action === "UPDATE")?.changes,
    ).toEqual({
      status: { from: "NEW", to: "URGENT" },
    });
    expect(a.categories).toEqual(["client", "insurance", "medical", "notes"]);
  });

  it("el asistente no ve cambios médicos ni de cobertura en el historial", async () => {
    const a = (await listClientActivity(assistant, clientId))!;
    expect(
      a.entries.some((e) =>
        ["doctor", "medication", "condition", "insurance", "enrollment"].includes(e.entityType),
      ),
    ).toBe(false);
    expect(a.entries.some((e) => e.entityType === "note")).toBe(true);
    expect(a.categories).toEqual(["client", "notes"]);
    // Pedir la categoría médica no le da acceso: devuelve vacío.
    expect(
      (await listClientActivity(assistant, clientId, { category: "medical" }))!.entries,
    ).toEqual([]);
  });

  it("filtra por categoría", async () => {
    const notes = (await listClientActivity(agent, clientId, { category: "notes" }))!;
    expect(notes.entries.every((e) => e.entityType === "note")).toBe(true);
  });

  it("pagina hacia atrás con cursor sin repetir registros", async () => {
    for (let i = 0; i < 31; i++) await createNote(agent, clientId, note(`Nota ${i}`));
    const first = (await listClientActivity(agent, clientId))!;
    expect(first.entries).toHaveLength(30);
    expect(first.nextCursor).not.toBeNull();
    const second = (await listClientActivity(agent, clientId, { before: first.nextCursor! }))!;
    const ids = new Set(first.entries.map((e) => e.id));
    expect(second.entries.some((e) => ids.has(e.id))).toBe(false);
    expect(second.entries.length).toBeGreaterThan(0);
    // Un cursor manipulado se ignora (vuelve al inicio) en lugar de fallar.
    expect((await listClientActivity(agent, clientId, { before: "x'; drop" }))!.entries[0].id).toBe(
      first.entries[0].id,
    );
  });

  it("otro agente no ve el historial", async () => {
    expect(await listClientActivity(otherAgent, clientId)).toBeNull();
  });
});
