import { beforeAll, describe, expect, it } from "vitest";
import type { CurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/db";
import { ServiceError } from "@/lib/service-error";
import { clientFormSchema } from "@/modules/clients/schema";
import {
  createClient,
  deleteClient,
  getClientDetail,
  getClientForEdit,
  listClients,
  revealBeneficiaryNumber,
  updateClient,
} from "@/modules/clients/service";
import {
  linkAssistantToAgent,
  listUsersWithLinks,
  unlinkAssistantFromAgent,
} from "@/modules/users/service";
import { asCurrentUser, clientInput, createTestUser } from "./helpers";

const expectServiceError = async (promise: Promise<unknown>, code: ServiceError["code"]) => {
  await expect(promise).rejects.toBeInstanceOf(ServiceError);
  await expect(promise).rejects.toMatchObject({ code });
};

let admin: CurrentUser;
let agentA: CurrentUser;
let agentB: CurrentUser;
let assistant: CurrentUser;
let assistant2: CurrentUser;
let clientOfA: string;
let clientOfB: string;

/** El asistente tal como lo vería la sesión en su SIGUIENTE petición. */
const freshAssistant = () => asCurrentUser(assistant.id);

beforeAll(async () => {
  admin = await createTestUser("ADMIN", "Admin Vínculos");
  agentA = await createTestUser("AGENT", "Agente A (vínculos)");
  agentB = await createTestUser("AGENT", "Agente B (vínculos)");
  assistant = await createTestUser("ASSISTANT", "Asistente (vínculos)");
  assistant2 = await createTestUser("ASSISTANT", "Asistente 2 (vínculos)");
  const base = clientInput();
  const withMedicare = clientFormSchema.parse({
    ...base,
    firstName: "Cliente",
    lastName: "De A",
    status: "PENDING",
    primaryPhone: "3055550100",
    programs: { ...base.programs, MEDICARE: { enabled: true, beneficiaryNumber: "0AA1BB2CC33" } },
  });
  clientOfA = await createClient(agentA, withMedicare);
  clientOfB = await createClient(agentB, clientFormSchema.parse({ ...base, lastName: "De B" }));
});

describe("administración de vínculos", () => {
  it("solo quien administra usuarios puede vincular y desvincular", async () => {
    await expectServiceError(linkAssistantToAgent(agentA, assistant.id, agentA.id), "FORBIDDEN");
    await expectServiceError(linkAssistantToAgent(assistant, assistant.id, agentA.id), "FORBIDDEN");
    await expectServiceError(
      unlinkAssistantFromAgent(agentA, assistant.id, agentA.id),
      "FORBIDDEN",
    );
    await expectServiceError(listUsersWithLinks(agentA), "FORBIDDEN");
  });

  it("valida los roles: el primero debe ser asistente y el segundo agente o administrador", async () => {
    await expectServiceError(linkAssistantToAgent(admin, agentA.id, agentB.id), "INVALID");
    await expectServiceError(linkAssistantToAgent(admin, assistant.id, assistant2.id), "INVALID");
    await expectServiceError(linkAssistantToAgent(admin, assistant.id, assistant.id), "INVALID");
    await expectServiceError(linkAssistantToAgent(admin, assistant.id, "no-existe"), "INVALID");
  });

  it("un asistente puede apoyar a varios agentes y un agente tener varios asistentes", async () => {
    await linkAssistantToAgent(admin, assistant.id, agentA.id);
    await linkAssistantToAgent(admin, assistant.id, agentB.id);
    await linkAssistantToAgent(admin, assistant2.id, agentA.id);

    const rows = await listUsersWithLinks(admin);
    const a = rows.find((r) => r.id === assistant.id)!;
    expect(a.linkedAgents.map((x) => x.id).sort()).toEqual([agentA.id, agentB.id].sort());
    const agent = rows.find((r) => r.id === agentA.id)!;
    expect(agent.linkedAssistants.map((x) => x.id).sort()).toEqual(
      [assistant.id, assistant2.id].sort(),
    );

    await unlinkAssistantFromAgent(admin, assistant.id, agentB.id);
    await unlinkAssistantFromAgent(admin, assistant2.id, agentA.id);
  });

  it("vincular dos veces no duplica; los cambios quedan en auditoría", async () => {
    await linkAssistantToAgent(admin, assistant.id, agentA.id);
    expect(
      await prisma.assistantAgentLink.count({
        where: { assistantId: assistant.id, agentId: agentA.id },
      }),
    ).toBe(1);
    expect(
      await prisma.auditLog.count({
        where: { action: "ASSISTANT_LINK_CREATED", actorId: admin.id },
      }),
    ).toBeGreaterThan(0);
    expect(
      await prisma.auditLog.count({
        where: { action: "ASSISTANT_LINK_REMOVED", actorId: admin.id },
      }),
    ).toBeGreaterThan(0);
  });
});

describe("acceso del asistente según sus vínculos", () => {
  it("vinculado al agente A: ve los clientes de A y no los de B", async () => {
    const user = await freshAssistant();
    expect(user.linkedAgentIds).toEqual([agentA.id]);
    expect(await getClientDetail(user, clientOfA)).not.toBeNull();
    expect(await getClientDetail(user, clientOfB)).toBeNull();
    const ids = (await listClients(user, { page: 1, pageSize: 500 })).items.map((c) => c.id);
    expect(ids).toContain(clientOfA);
    expect(ids).not.toContain(clientOfB);
  });

  it("mantiene sus permisos: solo cambia contacto y dirección", async () => {
    const user = await freshAssistant();
    const form = (await getClientForEdit(user, clientOfA))!;
    expect(form.scope).toBe("basic");
    await updateClient(
      user,
      clientOfA,
      clientFormSchema.parse({
        ...form.values,
        firstName: "Cambiado",
        status: "URGENT",
        primaryPhone: "7865550123",
        homeCity: "Doral",
      }),
    );
    const row = await prisma.client.findUniqueOrThrow({ where: { id: clientOfA } });
    expect(row.firstName).toBe("Cliente");
    expect(row.status).toBe("PENDING");
    expect(row.primaryPhone).toBe("7865550123");
    expect(row.homeCity).toBe("Doral");
  });

  it("no puede revelar números, eliminar ni crear clientes", async () => {
    const user = await freshAssistant();
    const enrollment = await prisma.clientProgramEnrollment.findFirstOrThrow({
      where: { clientId: clientOfA },
    });
    await expectServiceError(revealBeneficiaryNumber(user, enrollment.id), "FORBIDDEN");
    await expectServiceError(deleteClient(user, clientOfA), "FORBIDDEN");
    await expectServiceError(
      createClient(user, clientFormSchema.parse(clientInput())),
      "FORBIDDEN",
    );
  });

  it("al desactivar el vínculo pierde el acceso de inmediato", async () => {
    await unlinkAssistantFromAgent(admin, assistant.id, agentA.id);
    const user = await freshAssistant();
    expect(user.linkedAgentIds).toEqual([]);
    expect(await getClientDetail(user, clientOfA)).toBeNull();
    expect(await getClientForEdit(user, clientOfA)).toBeNull();
    await expectServiceError(
      updateClient(user, clientOfA, clientFormSchema.parse(clientInput())),
      "NOT_FOUND",
    );
    expect(
      (await listClients(user, { page: 1, pageSize: 500 })).items.map((c) => c.id),
    ).not.toContain(clientOfA);
  });

  it("al reactivarlo recupera el acceso", async () => {
    await linkAssistantToAgent(admin, assistant.id, agentA.id);
    expect(await getClientDetail(await freshAssistant(), clientOfA)).not.toBeNull();
  });

  it("si el agente se desactiva, el asistente deja de ver sus clientes", async () => {
    await prisma.user.update({ where: { id: agentA.id }, data: { isActive: false } });
    expect(await getClientDetail(await freshAssistant(), clientOfA)).toBeNull();
    await prisma.user.update({ where: { id: agentA.id }, data: { isActive: true } });
    expect(await getClientDetail(await freshAssistant(), clientOfA)).not.toBeNull();
  });

  it("los vínculos no dan acceso a otros asistentes ni amplían al agente", async () => {
    expect(await getClientDetail(await asCurrentUser(assistant2.id), clientOfA)).toBeNull();
    expect(await getClientDetail(await asCurrentUser(agentB.id), clientOfA)).toBeNull();
  });
});
