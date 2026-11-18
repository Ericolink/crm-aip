import { beforeAll, describe, expect, it } from "vitest";
import type { CurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/db";
import { clientFormSchema } from "@/modules/clients/schema";
import {
  createClient,
  getClientDetail,
  listClients,
  revealBeneficiaryNumber,
} from "@/modules/clients/service";
import { clientInput, createTestUser } from "./helpers";

let agent: CurrentUser;
let clientA: string;
let clientB: string;

const count = (where: object) => prisma.auditLog.count({ where });

beforeAll(async () => {
  agent = await createTestUser("AGENT", "Agente Auditoría");
  const base = clientInput();
  clientA = await createClient(
    agent,
    clientFormSchema.parse({
      ...base,
      programs: { ...base.programs, MEDICARE: { enabled: true, beneficiaryNumber: "0ZZ9YY8XX77" } },
    }),
  );
  clientB = await createClient(agent, clientFormSchema.parse(base));
});

/**
 * Next puede renderizar una página dos veces por petición. Los eventos de consulta deben
 * quedar UNA vez; las acciones del usuario, siempre.
 */
describe("auditoría sin duplicados por doble render", () => {
  it("ver el mismo cliente dos veces seguidas (incluso en paralelo) se registra una vez", async () => {
    await Promise.all([getClientDetail(agent, clientA), getClientDetail(agent, clientA)]);
    await getClientDetail(agent, clientA);
    expect(await count({ action: "CLIENT_VIEWED", actorId: agent.id, targetId: clientA })).toBe(1);
  });

  it("ver clientes distintos se registra por separado", async () => {
    await getClientDetail(agent, clientB);
    expect(await count({ action: "CLIENT_VIEWED", actorId: agent.id, targetId: clientB })).toBe(1);
  });

  it("búsquedas distintas del mismo largo NO se fusionan; la misma búsqueda repetida sí", async () => {
    const page = { page: 1, pageSize: 10 };
    await listClients(agent, { ...page, q: "DEMO1111111" });
    await listClients(agent, { ...page, q: "DEMO2222222" });
    await listClients(agent, { ...page, q: "DEMO2222222" });
    expect(await count({ action: "IDENTIFIER_SEARCH", actorId: agent.id })).toBe(2);
    const rows = await prisma.auditLog.findMany({
      where: { action: "IDENTIFIER_SEARCH", actorId: agent.id },
    });
    expect(JSON.stringify(rows)).not.toMatch(/1111111|2222222/);
  });

  it("revelar un número (acción del usuario) se registra cada vez", async () => {
    const enrollment = await prisma.clientProgramEnrollment.findFirstOrThrow({
      where: { clientId: clientA },
    });
    await revealBeneficiaryNumber(agent, enrollment.id);
    await revealBeneficiaryNumber(agent, enrollment.id);
    expect(await count({ action: "SENSITIVE_REVEALED", actorId: agent.id })).toBe(2);
  });
});
