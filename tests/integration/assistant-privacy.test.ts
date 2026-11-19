import { beforeAll, describe, expect, it } from "vitest";
import type { CurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/db";
import { clientFormSchema } from "@/modules/clients/schema";
import {
  createClient,
  getClientDetail,
  getClientForEdit,
  getClientListOptions,
  listClients,
} from "@/modules/clients/service";
import { linkAssistantToAgent } from "@/modules/users/service";
import { asCurrentUser, clientInput, createTestUser } from "./helpers";

/**
 * El asistente NO ve información médica ni de cobertura (rol aprobado en la Etapa 1).
 * Estas pruebas verifican que esos datos ni siquiera salgan del servidor.
 */
let agent: CurrentUser;
let assistant: CurrentUser;
let clientId: string;
let diabetesId: string;

beforeAll(async () => {
  const admin = await createTestUser("ADMIN", "Admin Privacidad");
  agent = await createTestUser("AGENT", "Agente Privacidad");
  const a = await createTestUser("ASSISTANT", "Asistente Privacidad");
  await linkAssistantToAgent(admin, a.id, agent.id);
  assistant = await asCurrentUser(a.id);
  diabetesId = (
    await prisma.chronicCondition.findUniqueOrThrow({ where: { nameEn: "Type 2 diabetes" } })
  ).id;

  const base = clientInput();
  clientId = await createClient(
    agent,
    clientFormSchema.parse({
      ...base,
      firstName: "Privada",
      lastName: "Prueba",
      programs: { ...base.programs, MEDICARE: { enabled: true, beneficiaryNumber: "0PR1VA2DA34" } },
      conditionIds: [diabetesId],
    }),
  );
  await prisma.clientInsurance.create({
    data: {
      clientId,
      programId: (await prisma.coverageProgram.findUniqueOrThrow({ where: { code: "MEDICARE" } }))
        .id,
      carrierId: (await prisma.insuranceCarrier.findUniqueOrThrow({ where: { name: "Humana" } }))
        .id,
      effectiveDate: new Date("2027-01-01T00:00:00Z"),
      status: "ACTIVE",
      createdById: agent.id,
    },
  });
});

describe("detalle del cliente", () => {
  it("el agente ve programas, cobertura y condiciones", async () => {
    const d = (await getClientDetail(agent, clientId))!;
    expect(d.access).toEqual({ insurance: true, medical: true });
    expect(d.programs).toHaveLength(1);
    expect(d.currentInsurances).toHaveLength(1);
    expect(d.conditions).toHaveLength(1);
  });

  it("el asistente no recibe programas, números, cobertura ni condiciones", async () => {
    const d = (await getClientDetail(assistant, clientId))!;
    expect(d.access).toEqual({ insurance: false, medical: false });
    expect(d.programs).toEqual([]);
    expect(d.currentInsurances).toEqual([]);
    expect(d.conditions).toEqual([]);
    expect(d.pcp).toBeNull();
    const json = JSON.stringify(d);
    expect(json).not.toMatch(/A34|Humana|Diabetes|diabetes|MEDICARE/);
    // Sí recibe lo que su rol permite: nombre y contacto.
    expect(d.firstName).toBe("Privada");
  });
});

describe("formulario de edición del asistente", () => {
  it("no incluye programas, condiciones ni últimos 4", async () => {
    const form = (await getClientForEdit(assistant, clientId))!;
    expect(form.scope).toBe("basic");
    expect(form.values.programs.MEDICARE.enabled).toBe(false);
    expect(form.values.conditionIds).toEqual([]);
    expect(form.savedNumbersLast4).toEqual({ MEDICARE: null, MEDICAID: null });
  });
});

describe("lista de clientes del asistente", () => {
  it("no incluye programas, aseguradora ni fecha efectiva", async () => {
    const { items } = await listClients(assistant, { page: 1, pageSize: 100 });
    const row = items.find((c) => c.id === clientId)!;
    expect(row.programs).toEqual([]);
    expect(row.currentCarrier).toBeNull();
    expect(row.effectiveDate).toBeNull();
  });

  it("filtrar por condición, programa o aseguradora se ignora (no permite deducir datos de salud)", async () => {
    const all = (await listClients(assistant, { page: 1, pageSize: 100 })).total;
    const byCondition = (
      await listClients(assistant, { page: 1, pageSize: 100, conditionId: diabetesId })
    ).total;
    const byProgram = (
      await listClients(assistant, { page: 1, pageSize: 100, program: "MEDICAID" })
    ).total;
    expect(byCondition).toBe(all);
    expect(byProgram).toBe(all);
    // Para el agente, el mismo filtro sí aplica.
    const agentAll = (await listClients(agent, { page: 1, pageSize: 100 })).total;
    expect(
      (await listClients(agent, { page: 1, pageSize: 100, program: "MEDICAID" })).total,
    ).toBeLessThan(agentAll);
  });

  it("no recibe las listas de aseguradoras ni de condiciones para filtrar", async () => {
    const options = await getClientListOptions(assistant);
    expect(options).toMatchObject({
      programs: [],
      carriers: [],
      conditions: [],
      seesInsurance: false,
      seesMedical: false,
    });
    const agentOptions = await getClientListOptions(agent);
    expect(agentOptions.carriers.length).toBeGreaterThan(0);
  });
});
