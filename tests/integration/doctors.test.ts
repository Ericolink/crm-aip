import { beforeAll, describe, expect, it } from "vitest";
import type { CurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/db";
import { ServiceError } from "@/lib/service-error";
import { clientFormSchema } from "@/modules/clients/schema";
import { createClient, getClientDetail } from "@/modules/clients/service";
import { addClientDoctorSchema, updateClientDoctorSchema } from "@/modules/doctors/schema";
import {
  addClientDoctor,
  getClientDoctors,
  removeClientDoctor,
  searchDoctorDirectory,
  updateClientDoctor,
} from "@/modules/doctors/service";
import { linkAssistantToAgent } from "@/modules/users/service";
import { asCurrentUser, clientInput, createTestUser } from "./helpers";

const expectError = async (p: Promise<unknown>, code: ServiceError["code"], field?: string) => {
  await expect(p).rejects.toBeInstanceOf(ServiceError);
  await expect(p).rejects.toMatchObject(field ? { code, field } : { code });
};

let agent: CurrentUser;
let otherAgent: CurrentUser;
let assistant: CurrentUser;
let clientA: string;
let clientB: string;

const newDoctor = (overrides: Record<string, unknown> = {}) =>
  addClientDoctorSchema.parse({
    name: "Dra. Prueba Méndez",
    specialty: "Medicina familiar",
    clinic: "Clínica Ficticia",
    phone: "(305) 555-0177",
    role: "PCP",
    notes: "Atiende martes y jueves.",
    ...overrides,
  });

beforeAll(async () => {
  const admin = await createTestUser("ADMIN", "Admin Médicos");
  agent = await createTestUser("AGENT", "Agente Médicos");
  otherAgent = await createTestUser("AGENT", "Otro Agente Médicos");
  const a = await createTestUser("ASSISTANT", "Asistente Médicos");
  await linkAssistantToAgent(admin, a.id, agent.id);
  assistant = await asCurrentUser(a.id);
  clientA = await createClient(
    agent,
    clientFormSchema.parse(clientInput({ lastName: "Médicos A" })),
  );
  clientB = await createClient(
    agent,
    clientFormSchema.parse(clientInput({ lastName: "Médicos B" })),
  );
});

describe("permisos", () => {
  it("el asistente no ve ni modifica médicos; otro agente no encuentra al cliente", async () => {
    await expectError(getClientDoctors(assistant, clientA), "FORBIDDEN");
    await expectError(addClientDoctor(assistant, clientA, newDoctor()), "FORBIDDEN");
    await expectError(searchDoctorDirectory(assistant, "mendez"), "FORBIDDEN");
    expect(await getClientDoctors(otherAgent, clientA)).toBeNull();
    await expectError(addClientDoctor(otherAgent, clientA, newDoctor()), "NOT_FOUND");
  });
});

describe("agregar médicos", () => {
  it("crea el médico en el directorio y lo vincula como PCP; aparece en el resumen", async () => {
    await addClientDoctor(agent, clientA, newDoctor());
    const doctors = (await getClientDoctors(agent, clientA))!;
    expect(doctors.pcp?.doctor).toMatchObject({ name: "Dra. Prueba Méndez", phone: "3055550177" });
    expect(doctors.pcp?.notes).toBe("Atiende martes y jueves.");
    expect((await getClientDetail(agent, clientA))!.pcp?.name).toBe("Dra. Prueba Méndez");
    const log = await prisma.activityLog.findFirstOrThrow({
      where: { clientId: clientA, entityType: "doctor", action: "CREATE" },
    });
    expect(log.changes).toMatchObject({
      doctor: { to: "Dra. Prueba Méndez" },
      role: { to: "PCP" },
    });
  });

  it("busca en el directorio sin acentos y reutiliza el mismo médico en otro cliente", async () => {
    const results = await searchDoctorDirectory(agent, "prueba mendez");
    expect(results.map((d) => d.name)).toContain("Dra. Prueba Méndez");
    expect(await searchDoctorDirectory(agent, "m")).toEqual([]); // muy corto
    const doctorId = results.find((d) => d.name === "Dra. Prueba Méndez")!.id;
    await addClientDoctor(
      agent,
      clientB,
      addClientDoctorSchema.parse({ doctorId, role: "SPECIALIST" }),
    );
    expect(await prisma.doctor.count({ where: { name: "Dra. Prueba Méndez" } })).toBe(1);
    expect((await getClientDoctors(agent, clientB))!.specialists[0].doctor.sharedWith).toBe(2);
  });

  it("no permite vincular dos veces el mismo médico al mismo cliente", async () => {
    const doctorId = (
      await prisma.doctor.findFirstOrThrow({ where: { name: "Dra. Prueba Méndez" } })
    ).id;
    await expectError(
      addClientDoctor(
        agent,
        clientA,
        addClientDoctorSchema.parse({ doctorId, role: "SPECIALIST" }),
      ),
      "CONFLICT",
      "doctorId",
    );
  });

  it("varios especialistas; un PCP nuevo convierte al anterior en especialista", async () => {
    await addClientDoctor(
      agent,
      clientA,
      newDoctor({
        name: "Dr. Cardio Prueba",
        specialty: "Cardiología",
        role: "SPECIALIST",
        phone: "",
      }),
    );
    await addClientDoctor(
      agent,
      clientA,
      newDoctor({ name: "Dr. Nuevo PCP", role: "PCP", phone: "" }),
    );
    const doctors = (await getClientDoctors(agent, clientA))!;
    expect(doctors.pcp?.doctor.name).toBe("Dr. Nuevo PCP");
    expect(doctors.specialists.map((s) => s.doctor.name).sort()).toEqual([
      "Dr. Cardio Prueba",
      "Dra. Prueba Méndez",
    ]);
    expect(
      await prisma.clientDoctor.count({
        where: { clientId: clientA, role: "PCP", deletedAt: null },
      }),
    ).toBe(1);
    const demotion = await prisma.activityLog.findFirst({
      where: { clientId: clientA, entityType: "doctor", action: "UPDATE" },
      orderBy: { createdAt: "desc" },
    });
    expect(demotion?.changes).toEqual({ role: { from: "PCP", to: "SPECIALIST" } });
  });

  it("valida teléfono, NPI y nombre; un NPI repetido se rechaza", async () => {
    expect(
      addClientDoctorSchema.safeParse({ name: "X Y", role: "PCP", phone: "123" }).success,
    ).toBe(false);
    expect(
      addClientDoctorSchema.safeParse({ name: "X Y", role: "PCP", npi: "12345" }).success,
    ).toBe(false);
    expect(addClientDoctorSchema.safeParse({ role: "PCP" }).success).toBe(false);
    await addClientDoctor(
      agent,
      clientB,
      newDoctor({ name: "Dr. Con NPI", role: "SPECIALIST", npi: "1234567890", phone: "" }),
    );
    await expectError(
      addClientDoctor(
        agent,
        clientB,
        newDoctor({ name: "Dr. Otro NPI", role: "SPECIALIST", npi: "1234567890", phone: "" }),
      ),
      "CONFLICT",
      "npi",
    );
  });
});

describe("editar y quitar", () => {
  const link = (name: string, clientId = clientA) =>
    prisma.clientDoctor.findFirstOrThrow({
      where: { clientId, deletedAt: null, doctor: { name } },
      include: { doctor: true },
    });

  it("editar datos del directorio afecta a todos sus clientes; papel y notas son por cliente", async () => {
    const l = await link("Dra. Prueba Méndez");
    await updateClientDoctor(
      agent,
      l.id,
      updateClientDoctorSchema.parse({
        name: "Dra. Prueba Méndez",
        specialty: "Medicina interna",
        phone: "3055550188",
        role: "SPECIALIST",
        notes: "Solo para A",
      }),
    );
    const inB = await link("Dra. Prueba Méndez", clientB);
    expect(inB.doctor.specialty).toBe("Medicina interna");
    expect(inB.notes).toBeNull();
    expect((await link("Dra. Prueba Méndez")).notes).toBe("Solo para A");
  });

  it("cambiar un especialista a PCP convierte al PCP actual en especialista", async () => {
    const l = await link("Dr. Cardio Prueba");
    await updateClientDoctor(
      agent,
      l.id,
      updateClientDoctorSchema.parse({
        name: "Dr. Cardio Prueba",
        specialty: "Cardiología",
        role: "PCP",
      }),
    );
    const doctors = (await getClientDoctors(agent, clientA))!;
    expect(doctors.pcp?.doctor.name).toBe("Dr. Cardio Prueba");
    expect(doctors.specialists.map((s) => s.doctor.name)).toContain("Dr. Nuevo PCP");
  });

  it("guardar sin cambios no crea historial", async () => {
    const l = await link("Dr. Cardio Prueba");
    const before = await prisma.activityLog.count({ where: { clientId: clientA } });
    await updateClientDoctor(
      agent,
      l.id,
      updateClientDoctorSchema.parse({
        name: l.doctor.name,
        specialty: l.doctor.specialty ?? "",
        phone: l.doctor.phone ?? "",
        role: l.role,
        notes: l.notes ?? "",
      }),
    );
    expect(await prisma.activityLog.count({ where: { clientId: clientA } })).toBe(before);
  });

  it("quitar es borrado lógico: el médico sigue en el directorio y en el historial", async () => {
    const l = await link("Dr. Nuevo PCP");
    await removeClientDoctor(agent, l.id);
    const row = await prisma.clientDoctor.findUniqueOrThrow({ where: { id: l.id } });
    expect(row.deletedAt).not.toBeNull();
    expect(await prisma.doctor.count({ where: { id: l.doctorId } })).toBe(1);
    expect(
      (await getClientDoctors(agent, clientA))!.specialists.map((s) => s.doctor.name),
    ).not.toContain("Dr. Nuevo PCP");
    await expectError(removeClientDoctor(agent, l.id), "NOT_FOUND");
    // Se puede volver a agregar después de quitarlo.
    await addClientDoctor(
      agent,
      clientA,
      addClientDoctorSchema.parse({ doctorId: l.doctorId, role: "SPECIALIST" }),
    );
  });

  it("otro agente no puede editar ni quitar médicos de un cliente ajeno", async () => {
    const l = await link("Dr. Cardio Prueba");
    await expectError(
      updateClientDoctor(
        otherAgent,
        l.id,
        updateClientDoctorSchema.parse({ name: "Hack", role: "PCP" }),
      ),
      "NOT_FOUND",
    );
    await expectError(removeClientDoctor(otherAgent, l.id), "NOT_FOUND");
  });
});
