import { beforeAll, describe, expect, it } from "vitest";
import type { CurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/db";
import { ServiceError } from "@/lib/service-error";
import { clientFormSchema } from "@/modules/clients/schema";
import { createClient } from "@/modules/clients/service";
import { addClientDoctorSchema } from "@/modules/doctors/schema";
import { addClientDoctor, removeClientDoctor } from "@/modules/doctors/service";
import { clientMedicationSchema } from "@/modules/medications/schema";
import {
  addClientMedication,
  getClientMedications,
  removeClientMedication,
  suggestMedications,
  updateClientMedication,
} from "@/modules/medications/service";
import { linkAssistantToAgent } from "@/modules/users/service";
import { asCurrentUser, clientInput, createTestUser } from "./helpers";

const expectError = async (p: Promise<unknown>, code: ServiceError["code"], field?: string) => {
  await expect(p).rejects.toBeInstanceOf(ServiceError);
  await expect(p).rejects.toMatchObject(field ? { code, field } : { code });
};
const med = (overrides: Record<string, unknown> = {}) =>
  clientMedicationSchema.parse({
    name: "Medicina Prueba X",
    dose: "500 mg",
    frequency: "2 veces al día",
    form: "TABLET",
    ...overrides,
  });

let agent: CurrentUser;
let otherAgent: CurrentUser;
let assistant: CurrentUser;
let clientA: string;
let clientB: string;
let doctorOfA: string;
let doctorOfB: string;

beforeAll(async () => {
  const admin = await createTestUser("ADMIN", "Admin Medicamentos");
  agent = await createTestUser("AGENT", "Agente Medicamentos");
  otherAgent = await createTestUser("AGENT", "Otro Agente Medicamentos");
  const a = await createTestUser("ASSISTANT", "Asistente Medicamentos");
  await linkAssistantToAgent(admin, a.id, agent.id);
  assistant = await asCurrentUser(a.id);
  clientA = await createClient(
    agent,
    clientFormSchema.parse(clientInput({ lastName: "Medicamentos A" })),
  );
  clientB = await createClient(
    agent,
    clientFormSchema.parse(clientInput({ lastName: "Medicamentos B" })),
  );
  doctorOfA = await addClientDoctor(
    agent,
    clientA,
    addClientDoctorSchema.parse({ name: "Dr. Receta A", role: "PCP" }),
  );
  doctorOfB = await addClientDoctor(
    agent,
    clientB,
    addClientDoctorSchema.parse({ name: "Dr. Receta B", role: "PCP" }),
  );
});

describe("permisos", () => {
  it("el asistente no ve ni registra medicamentos; otro agente no encuentra al cliente", async () => {
    await expectError(getClientMedications(assistant, clientA), "FORBIDDEN");
    await expectError(addClientMedication(assistant, clientA, med()), "FORBIDDEN");
    await expectError(suggestMedications(assistant, "medi"), "FORBIDDEN");
    expect(await getClientMedications(otherAgent, clientA)).toBeNull();
    await expectError(addClientMedication(otherAgent, clientA, med()), "NOT_FOUND");
  });
});

describe("registrar medicamentos", () => {
  it("registra varios medicamentos con dosis, frecuencia, presentación, médico y notas", async () => {
    await addClientMedication(
      agent,
      clientA,
      med({ prescriberClientDoctorId: doctorOfA, notes: "Con alimentos" }),
    );
    await addClientMedication(
      agent,
      clientA,
      med({ name: "Otra Medicina Prueba", form: "OTHER", formOther: "Polvo", dose: "" }),
    );
    const data = (await getClientMedications(agent, clientA))!;
    expect(data.medications.map((m) => m.name)).toEqual([
      "Medicina Prueba X",
      "Otra Medicina Prueba",
    ]);
    expect(data.medications[0]).toMatchObject({
      dose: "500 mg",
      frequency: "2 veces al día",
      form: "TABLET",
      notes: "Con alimentos",
      prescriber: { name: "Dr. Receta A", removed: false },
    });
    expect(data.medications[1]).toMatchObject({ form: "OTHER", formOther: "Polvo", dose: null });
    expect(data.prescribers.map((p) => p.name)).toEqual(["Dr. Receta A"]);
    const log = await prisma.activityLog.findFirstOrThrow({
      where: { clientId: clientA, entityType: "medication", action: "CREATE" },
    });
    expect(log.changes).toMatchObject({
      medication: { to: "Medicina Prueba X" },
      prescriber: { to: "Dr. Receta A" },
    });
  });

  it("reutiliza el catálogo sin importar mayúsculas (sin duplicados)", async () => {
    await addClientMedication(agent, clientB, med({ name: "MEDICINA PRUEBA x" }));
    expect(
      await prisma.medication.count({
        where: { name: { equals: "medicina prueba x", mode: "insensitive" } },
      }),
    ).toBe(1);
    expect((await getClientMedications(agent, clientB))!.medications[0].name).toBe(
      "Medicina Prueba X",
    );
    expect(await suggestMedications(agent, "prueba")).toEqual(
      expect.arrayContaining(["Medicina Prueba X", "Otra Medicina Prueba"]),
    );
    expect(await suggestMedications(agent, "p")).toEqual([]);
  });

  it("la base impide duplicados por mayúsculas aunque se intente directamente", async () => {
    await expect(
      prisma.medication.create({ data: { name: "medicina prueba X" } }),
    ).rejects.toBeTruthy();
  });

  it("el médico que prescribe debe ser del mismo cliente", async () => {
    await expectError(
      addClientMedication(
        agent,
        clientA,
        med({ name: "Med Cruzada", prescriberClientDoctorId: doctorOfB }),
      ),
      "INVALID",
      "prescriberClientDoctorId",
    );
  });

  it("valida nombre y 'Otro' sin descripción", () => {
    expect(clientMedicationSchema.safeParse({ name: "" }).success).toBe(false);
    expect(clientMedicationSchema.safeParse({ name: "<script>" }).success).toBe(false);
    expect(clientMedicationSchema.safeParse({ name: "Algo", form: "OTHER" }).success).toBe(false);
  });
});

describe("editar y quitar", () => {
  const find = (name: string) =>
    prisma.clientMedication.findFirstOrThrow({
      where: { clientId: clientA, deletedAt: null, medication: { name } },
    });

  it("edita dosis y frecuencia con antes y después en el historial", async () => {
    const m = await find("Medicina Prueba X");
    await updateClientMedication(
      agent,
      m.id,
      med({ dose: "1000 mg", prescriberClientDoctorId: doctorOfA, notes: "Con alimentos" }),
    );
    const log = await prisma.activityLog.findFirstOrThrow({
      where: { entityId: m.id, action: "UPDATE" },
    });
    expect(log.changes).toEqual({ dose: { from: "500 mg", to: "1000 mg" } });
  });

  it("guardar sin cambios no crea historial", async () => {
    const m = await find("Medicina Prueba X");
    const before = await prisma.activityLog.count({ where: { entityId: m.id } });
    await updateClientMedication(
      agent,
      m.id,
      med({ dose: "1000 mg", prescriberClientDoctorId: doctorOfA, notes: "Con alimentos" }),
    );
    expect(await prisma.activityLog.count({ where: { entityId: m.id } })).toBe(before);
  });

  it("si el médico se quita del cliente, el medicamento conserva quién lo prescribió", async () => {
    await removeClientDoctor(agent, doctorOfA);
    const data = (await getClientMedications(agent, clientA))!;
    expect(data.medications.find((x) => x.name === "Medicina Prueba X")!.prescriber).toMatchObject({
      name: "Dr. Receta A",
      removed: true,
    });
    expect(data.prescribers).toEqual([]);
    // Editar otra cosa sin cambiar el médico no da error.
    const m = await find("Medicina Prueba X");
    await updateClientMedication(
      agent,
      m.id,
      med({ dose: "250 mg", prescriberClientDoctorId: doctorOfA, notes: "Con alimentos" }),
    );
    // Pero no se puede asignar un médico ya quitado a un medicamento nuevo.
    await expectError(
      addClientMedication(
        agent,
        clientA,
        med({ name: "Med Nueva", prescriberClientDoctorId: doctorOfA }),
      ),
      "INVALID",
    );
  });

  it("quitar es borrado lógico y queda en el historial", async () => {
    const m = await find("Otra Medicina Prueba");
    await removeClientMedication(agent, m.id);
    expect(
      (await prisma.clientMedication.findUniqueOrThrow({ where: { id: m.id } })).deletedAt,
    ).not.toBeNull();
    expect(
      (await getClientMedications(agent, clientA))!.medications.map((x) => x.name),
    ).not.toContain("Otra Medicina Prueba");
    expect(await prisma.activityLog.count({ where: { entityId: m.id, action: "DELETE" } })).toBe(1);
    await expectError(removeClientMedication(agent, m.id), "NOT_FOUND");
  });

  it("otro agente no puede editar ni quitar", async () => {
    const m = await find("Medicina Prueba X");
    await expectError(updateClientMedication(otherAgent, m.id, med()), "NOT_FOUND");
    await expectError(removeClientMedication(otherAgent, m.id), "NOT_FOUND");
  });
});
