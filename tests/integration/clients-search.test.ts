import { beforeAll, describe, expect, it } from "vitest";
import type { CurrentUser } from "@/lib/auth/current-user";
import { getFieldProtector, SENSITIVE_FIELDS } from "@/lib/crypto";
import { prisma } from "@/lib/db";
import { ServiceError } from "@/lib/service-error";
import { parseClientListParams } from "@/modules/clients/list-params";
import { clientFormSchema } from "@/modules/clients/schema";
import {
  createClient,
  getClientForEdit,
  listClients,
  updateClient,
  updateClientStatus,
} from "@/modules/clients/service";
import { linkAssistantToAgent } from "@/modules/users/service";
import { asCurrentUser, clientInput, createTestUser } from "./helpers";

let admin: CurrentUser;
let agent: CurrentUser;
let otherAgent: CurrentUser;
let assistant: CurrentUser;
let maria: string;
let thomas: string;
let ana: string;
let diabetesId: string;
let humanaId: string;

/** Busca como lo hace la pantalla: parámetros de URL → servicio. */
async function search(user: CurrentUser, raw: Record<string, string>) {
  const params = parseClientListParams(raw);
  return listClients(user, { ...params, pageSize: 100 });
}
const ids = async (user: CurrentUser, raw: Record<string, string>) =>
  (await search(user, raw)).items.map((c) => c.id);

async function addInsurance(
  clientId: string,
  carrierName: string,
  programCode: string,
  effective: string,
  memberNumber?: string,
) {
  const member = memberNumber
    ? getFieldProtector().protect(SENSITIVE_FIELDS.MEMBER_NUMBER, memberNumber)
    : null;
  return prisma.clientInsurance.create({
    data: {
      clientId,
      carrierId: (await prisma.insuranceCarrier.findUniqueOrThrow({ where: { name: carrierName } }))
        .id,
      programId: (await prisma.coverageProgram.findUniqueOrThrow({ where: { code: programCode } }))
        .id,
      effectiveDate: new Date(`${effective}T00:00:00Z`),
      status: "ACTIVE",
      memberNumberEnc: member?.enc,
      memberNumberIdx: member?.idx,
      memberNumberLast4: member?.last4,
      createdById: agent.id,
    },
  });
}

beforeAll(async () => {
  admin = await createTestUser("ADMIN", "Admin Búsqueda");
  agent = await createTestUser("AGENT", "Agente Búsqueda");
  otherAgent = await createTestUser("AGENT", "Otro Agente Búsqueda");
  const assistantUser = await createTestUser("ASSISTANT", "Asistente Búsqueda");
  await linkAssistantToAgent(admin, assistantUser.id, agent.id);
  assistant = await asCurrentUser(assistantUser.id);

  diabetesId = (
    await prisma.chronicCondition.findUniqueOrThrow({ where: { nameEn: "Type 2 diabetes" } })
  ).id;
  humanaId = (await prisma.insuranceCarrier.findUniqueOrThrow({ where: { name: "Humana" } })).id;
  const base = clientInput();

  maria = await createClient(
    agent,
    clientFormSchema.parse({
      ...base,
      firstName: "María José",
      lastName: "Núñez",
      status: "NEW",
      primaryPhone: "305-555-0101",
      email: "mjn@example.com",
      programs: { ...base.programs, MEDICARE: { enabled: true, beneficiaryNumber: "0AB1CD2EF34" } },
      conditionIds: [diabetesId],
    }),
  );
  thomas = await createClient(
    agent,
    clientFormSchema.parse({
      ...base,
      firstName: "Thomas",
      lastName: "Reed",
      status: "ACTIVE",
      primaryPhone: "786-555-0102",
      programs: { ...base.programs, MEDICAID: { enabled: true, beneficiaryNumber: "0011223344" } },
    }),
  );
  ana = await createClient(
    agent,
    clientFormSchema.parse({
      ...base,
      firstName: "Ana",
      lastName: "Gómez",
      status: "URGENT",
      primaryPhone: "954-555-0103",
      programs: { ...base.programs, ACA: { enabled: true } },
    }),
  );
  await addInsurance(maria, "Humana", "MEDICARE", "2027-01-01", "DEMO7777777");
  await addInsurance(thomas, "UnitedHealthcare", "MEDICAID", "2026-03-01");
});

describe("búsqueda", () => {
  it("encuentra por nombre sin importar acentos, mayúsculas ni orden de las palabras", async () => {
    expect(await ids(agent, { q: "maria nunez" })).toEqual([maria]);
    expect(await ids(agent, { q: "NÚÑEZ MARÍA" })).toEqual([maria]);
    expect(await ids(agent, { q: "gomez" })).toEqual([ana]);
    expect(await ids(agent, { q: "jos" })).toEqual([maria]);
  });

  it("encuentra por teléfono con o sin formato, completo o parcial", async () => {
    expect(await ids(agent, { q: "(305) 555-0101" })).toEqual([maria]);
    expect(await ids(agent, { q: "0102" })).toEqual([thomas]);
  });

  it("encuentra por correo", async () => {
    expect(await ids(agent, { q: "mjn@" })).toEqual([maria]);
  });

  it("encuentra por número de miembro y de Medicare (coincidencia exacta) y lo audita sin el valor", async () => {
    const before = await prisma.auditLog.count({
      where: { action: "IDENTIFIER_SEARCH", actorId: agent.id },
    });
    expect(await ids(agent, { q: "demo-7777777" })).toEqual([maria]);
    expect(await ids(agent, { q: "0ab1-cd2-ef34" })).toEqual([maria]);
    expect(await ids(agent, { q: "DEMO777" })).toEqual([]); // parcial: no
    const logs = await prisma.auditLog.findMany({
      where: { action: "IDENTIFIER_SEARCH", actorId: agent.id },
    });
    expect(logs.length).toBe(before + 3);
    expect(JSON.stringify(logs)).not.toContain("7777777");
  });

  it("el asistente no puede buscar por identificadores (y no se registra búsqueda)", async () => {
    expect(await ids(assistant, { q: "demo-7777777" })).toEqual([]);
    expect(
      await prisma.auditLog.count({
        where: { action: "IDENTIFIER_SEARCH", actorId: assistant.id },
      }),
    ).toBe(0);
    // Pero sí encuentra por nombre a los clientes de su agente vinculado.
    expect(await ids(assistant, { q: "maria" })).toEqual([maria]);
  });

  it("no encuentra clientes de otros agentes", async () => {
    expect(await ids(otherAgent, { q: "maria nunez" })).toEqual([]);
    expect(await ids(otherAgent, { q: "demo-7777777" })).toEqual([]);
  });

  it("detecta el cambio de nombre (columna de búsqueda mantenida por la base)", async () => {
    const form = (await getClientForEdit(agent, ana))!.values;
    await updateClient(agent, ana, clientFormSchema.parse({ ...form, firstName: "Anabel" }));
    expect(await ids(agent, { q: "anabel gomez" })).toEqual([ana]);
  });
});

describe("filtros combinados", () => {
  it("por estatus (uno o varios)", async () => {
    expect(await ids(agent, { status: "URGENT" })).toEqual([ana]);
    expect((await ids(agent, { status: "NEW,URGENT" })).sort()).toEqual([maria, ana].sort());
  });

  it("por programa, aseguradora y condición crónica", async () => {
    expect(await ids(agent, { program: "MEDICAID" })).toEqual([thomas]);
    expect(await ids(agent, { carrier: humanaId })).toEqual([maria]);
    expect(await ids(agent, { condition: diabetesId })).toEqual([maria]);
  });

  it("varios filtros a la vez", async () => {
    expect(await ids(agent, { program: "MEDICARE", status: "NEW", q: "maria" })).toEqual([maria]);
    expect(await ids(agent, { program: "MEDICARE", status: "ACTIVE" })).toEqual([]);
  });

  it("por rango de fecha efectiva y de creación", async () => {
    expect(await ids(agent, { effectiveFrom: "2027-01-01", effectiveTo: "2027-12-31" })).toEqual([
      maria,
    ]);
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(
      new Date(),
    );
    expect((await ids(agent, { createdFrom: today })).length).toBe(3);
    expect(await ids(agent, { createdTo: "2020-01-01" })).toEqual([]);
  });

  it("filtrar por un agente que el usuario no puede ver no devuelve nada", async () => {
    expect(await ids(agent, { agent: otherAgent.id })).toEqual([]);
    expect((await ids(admin, { agent: agent.id })).sort()).toEqual([maria, thomas, ana].sort());
    expect((await ids(assistant, { agent: agent.id })).length).toBe(3);
  });

  it("cuenta por estatus respetando los demás filtros", async () => {
    const { statusCounts } = await search(agent, { program: "MEDICARE", status: "URGENT" });
    expect(statusCounts).toEqual({ NEW: 1 });
  });
});

describe("orden", () => {
  it("por fecha efectiva (sin fecha al final) y por apellido", async () => {
    expect(await ids(agent, { sort: "effective_asc" })).toEqual([thomas, maria, ana]);
    expect(await ids(agent, { sort: "effective_desc" })).toEqual([maria, thomas, ana]);
    expect(await ids(agent, { sort: "name_asc" })).toEqual([ana, maria, thomas]);
  });

  it("la fecha efectiva se recalcula al cambiar las coberturas", async () => {
    const ins = await prisma.clientInsurance.findFirstOrThrow({ where: { clientId: thomas } });
    await prisma.clientInsurance.update({ where: { id: ins.id }, data: { isCurrent: false } });
    expect(
      (await prisma.client.findUniqueOrThrow({ where: { id: thomas } })).currentEffectiveDate,
    ).toBeNull();
    await prisma.clientInsurance.update({ where: { id: ins.id }, data: { isCurrent: true } });
    expect(
      (await prisma.client.findUniqueOrThrow({ where: { id: thomas } })).currentEffectiveDate
        ?.toISOString()
        .slice(0, 10),
    ).toBe("2026-03-01");
  });
});

describe("cambio de estatus desde la tabla", () => {
  it("el agente cambia el estatus y queda en el historial; repetirlo no crea registros", async () => {
    await updateClientStatus(agent, maria, "PENDING");
    expect((await prisma.client.findUniqueOrThrow({ where: { id: maria } })).status).toBe(
      "PENDING",
    );
    const log = await prisma.activityLog.findFirstOrThrow({
      where: { clientId: maria, entityType: "client", action: "UPDATE" },
      orderBy: { createdAt: "desc" },
    });
    expect(log.changes).toEqual({ status: { from: "NEW", to: "PENDING" } });
    const count = await prisma.activityLog.count({ where: { clientId: maria } });
    await updateClientStatus(agent, maria, "PENDING");
    expect(await prisma.activityLog.count({ where: { clientId: maria } })).toBe(count);
  });

  it("el asistente no puede cambiar el estatus; otro agente no encuentra al cliente", async () => {
    await expect(updateClientStatus(assistant, maria, "URGENT")).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(updateClientStatus(otherAgent, maria, "URGENT")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(updateClientStatus(agent, maria, "VIP" as "NEW")).rejects.toBeInstanceOf(
      ServiceError,
    );
    expect((await prisma.client.findUniqueOrThrow({ where: { id: maria } })).status).toBe(
      "PENDING",
    );
  });
});
