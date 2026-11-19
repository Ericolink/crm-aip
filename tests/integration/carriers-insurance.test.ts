import { beforeAll, describe, expect, it } from "vitest";
import type { CurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/db";
import { ServiceError } from "@/lib/service-error";
import {
  carriersByProgram,
  createCarrier,
  listCarriersWithPrograms,
  setCarrierProgram,
  updateCarrier,
} from "@/modules/carriers/service";
import { clientFormSchema } from "@/modules/clients/schema";
import { createClient, listClients } from "@/modules/clients/service";
import {
  addCoverageSchema,
  changeCarrierSchema,
  endCoverageSchema,
  updateCoverageSchema,
} from "@/modules/insurance/schema";
import {
  addCoverage,
  changeCarrier,
  endCoverage,
  getClientCoverage,
  revealInsuranceNumber,
  updateCoverage,
} from "@/modules/insurance/service";
import { linkAssistantToAgent } from "@/modules/users/service";
import { asCurrentUser, clientInput, createTestUser } from "./helpers";

const expectError = async (p: Promise<unknown>, code: ServiceError["code"], field?: string) => {
  await expect(p).rejects.toBeInstanceOf(ServiceError);
  await expect(p).rejects.toMatchObject(field ? { code, field } : { code });
};

let admin: CurrentUser;
let agent: CurrentUser;
let otherAgent: CurrentUser;
let assistant: CurrentUser;
let carrierX: string;
let carrierY: string;
let acaOnly: string;
let clientId: string;

const add = (overrides: Record<string, unknown> = {}) =>
  addCoverageSchema.parse({
    programCode: "MEDICARE",
    carrierId: carrierX,
    status: "ACTIVE",
    effectiveDate: "2026-01-01",
    memberNumber: "MEMX1234567",
    confirmationNumber: "CONFX99",
    planName: "Plan X (prueba)",
    ...overrides,
  });

beforeAll(async () => {
  admin = await createTestUser("ADMIN", "Admin Coberturas");
  agent = await createTestUser("AGENT", "Agente Coberturas");
  otherAgent = await createTestUser("AGENT", "Otro Agente Coberturas");
  const a = await createTestUser("ASSISTANT", "Asistente Coberturas");
  await linkAssistantToAgent(admin, a.id, agent.id);
  assistant = await asCurrentUser(a.id);

  const base = clientInput();
  clientId = await createClient(
    agent,
    clientFormSchema.parse({
      ...base,
      firstName: "Cobertura",
      lastName: "Prueba",
      programs: { ...base.programs, MEDICARE: { enabled: true }, MEDICAID: { enabled: true } },
    }),
  );
});

describe("configuración de aseguradoras", () => {
  it("solo el administrador configura aseguradoras", async () => {
    await expectError(createCarrier(agent, "Aseguradora X"), "FORBIDDEN");
    await expectError(listCarriersWithPrograms(assistant), "FORBIDDEN");
    await expectError(setCarrierProgram(agent, "x", "MEDICARE", true), "FORBIDDEN");
  });

  it("crea aseguradoras; valida el nombre y evita duplicados", async () => {
    carrierX = await createCarrier(admin, "Aseguradora X (prueba)");
    carrierY = await createCarrier(admin, "Aseguradora Y (prueba)");
    acaOnly = await createCarrier(admin, "Solo ACA (prueba)");
    await expectError(createCarrier(admin, "Aseguradora X (prueba)"), "CONFLICT", "name");
    await expectError(createCarrier(admin, "<script>"), "INVALID", "name");
    await expectError(createCarrier(admin, " "), "INVALID", "name");
    expect(
      await prisma.auditLog.count({ where: { action: "CARRIER_CREATED", actorId: admin.id } }),
    ).toBe(3);
  });

  it("relaciona aseguradoras con programas, incluidas aseguradoras solo de ACA", async () => {
    await setCarrierProgram(admin, carrierX, "MEDICARE", true);
    await setCarrierProgram(admin, carrierY, "MEDICARE", true);
    await setCarrierProgram(admin, acaOnly, "ACA", true);
    const map = await carriersByProgram();
    expect(map.MEDICARE.map((c) => c.id)).toEqual(expect.arrayContaining([carrierX, carrierY]));
    expect(map.MEDICARE.map((c) => c.id)).not.toContain(acaOnly);
    expect(map.ACA.map((c) => c.id)).toContain(acaOnly);
    const list = await listCarriersWithPrograms(admin);
    expect(list.carriers.find((c) => c.id === acaOnly)?.programCodes).toEqual(["ACA"]);
  });

  it("desactivar la relación o la aseguradora deja de ofrecerla", async () => {
    await setCarrierProgram(admin, carrierY, "MEDICARE", false);
    expect((await carriersByProgram()).MEDICARE.map((c) => c.id)).not.toContain(carrierY);
    await setCarrierProgram(admin, carrierY, "MEDICARE", true);
    await updateCarrier(admin, carrierY, { isActive: false });
    expect((await carriersByProgram()).MEDICARE.map((c) => c.id)).not.toContain(carrierY);
    await updateCarrier(admin, carrierY, {
      isActive: true,
      name: "Aseguradora Y renombrada (prueba)",
    });
    expect((await carriersByProgram()).MEDICARE.find((c) => c.id === carrierY)?.name).toBe(
      "Aseguradora Y renombrada (prueba)",
    );
  });
});

describe("registrar cobertura", () => {
  it("rechaza aseguradoras que no ofrecen el programa", async () => {
    await expectError(
      addCoverage(agent, clientId, add({ carrierId: acaOnly })),
      "INVALID",
      "carrierId",
    );
    await expectError(
      addCoverage(agent, clientId, add({ programCode: "MEDICAID" })),
      "INVALID",
      "carrierId",
    );
  });

  it("rechaza programas que el cliente no tiene", async () => {
    await expectError(
      addCoverage(agent, clientId, add({ programCode: "ACA", carrierId: acaOnly })),
      "INVALID",
      "programCode",
    );
  });

  it("registra la cobertura con números cifrados e historial", async () => {
    const id = await addCoverage(agent, clientId, add());
    const row = await prisma.clientInsurance.findUniqueOrThrow({ where: { id } });
    expect(row).toMatchObject({
      isCurrent: true,
      status: "ACTIVE",
      memberNumberLast4: "4567",
      confirmationNumberLast4: "NFX99".slice(-4),
    });
    expect(row.memberNumberEnc).not.toContain("MEMX1234567");
    expect(row.writingAgentId).toBe(agent.id);
    const log = await prisma.activityLog.findFirstOrThrow({
      where: { entityId: id, action: "CREATE" },
    });
    expect(log.changes).toMatchObject({
      program: { to: "MEDICARE" },
      memberNumber: { changed: true },
    });
    expect(JSON.stringify(log.changes)).not.toContain("1234567");
    // La fecha efectiva del cliente se actualiza (trigger).
    const client = await prisma.client.findUniqueOrThrow({ where: { id: clientId } });
    expect(client.currentEffectiveDate?.toISOString().slice(0, 10)).toBe("2026-01-01");
  });

  it("no permite dos coberturas actuales del mismo programa", async () => {
    await expectError(addCoverage(agent, clientId, add()), "CONFLICT");
  });

  it("otro agente y el asistente no pueden registrar ni ver coberturas de este cliente", async () => {
    await expectError(addCoverage(otherAgent, clientId, add()), "NOT_FOUND");
    await expectError(addCoverage(assistant, clientId, add()), "FORBIDDEN");
    await expectError(getClientCoverage(assistant, clientId), "FORBIDDEN");
    expect(await getClientCoverage(otherAgent, clientId)).toBeNull();
  });
});

describe("editar, cambiar de aseguradora y terminar", () => {
  const current = () =>
    prisma.clientInsurance.findFirstOrThrow({
      where: { clientId, isCurrent: true, program: { code: "MEDICARE" } },
    });

  it("editar: número vacío lo conserva; sin cambios no crea historial", async () => {
    const before = await current();
    const logs = await prisma.activityLog.count({ where: { entityId: before.id } });
    await updateCoverage(
      agent,
      before.id,
      updateCoverageSchema.parse({
        planName: "Plan X (prueba)",
        status: "ACTIVE",
        effectiveDate: "2026-01-01",
      }),
    );
    expect(await prisma.activityLog.count({ where: { entityId: before.id } })).toBe(logs);
    await updateCoverage(
      agent,
      before.id,
      updateCoverageSchema.parse({
        planName: "Plan X2",
        status: "ACTIVE",
        effectiveDate: "2026-01-01",
      }),
    );
    const after = await current();
    expect(after.planName).toBe("Plan X2");
    expect(after.memberNumberEnc).toBe(before.memberNumberEnc);
  });

  it("cambiar de aseguradora conserva la anterior en el historial con fecha de fin y motivo", async () => {
    const previous = await current();
    const newId = await changeCarrier(
      agent,
      previous.id,
      changeCarrierSchema.parse({
        carrierId: carrierY,
        status: "APPLICATION_PENDING",
        effectiveDate: "2027-01-01",
        changeReason: "La red de la nueva aseguradora incluye a su PCP.",
        memberNumber: "MEMY7654321",
      }),
    );
    const old = await prisma.clientInsurance.findUniqueOrThrow({ where: { id: previous.id } });
    expect(old).toMatchObject({ isCurrent: false, status: "ENDED" });
    expect(old.endDate?.toISOString().slice(0, 10)).toBe("2026-12-31");
    const fresh = await prisma.clientInsurance.findUniqueOrThrow({ where: { id: newId } });
    expect(fresh).toMatchObject({
      isCurrent: true,
      replacesInsuranceId: previous.id,
      carrierId: carrierY,
    });

    const coverage = (await getClientCoverage(agent, clientId))!;
    const medicare = coverage.coverages.filter((c) => c.programCode === "MEDICARE");
    expect(medicare.map((c) => c.isCurrent)).toEqual([true, false]);
    expect(medicare[1].replacedByCarrier).toBe("Aseguradora Y renombrada (prueba)");
    const log = await prisma.activityLog.findFirstOrThrow({
      where: { entityId: newId, action: "CREATE" },
    });
    expect(log.changes).toMatchObject({
      carrier: { from: "Aseguradora X (prueba)", to: "Aseguradora Y renombrada (prueba)" },
    });
    expect(
      (await prisma.client.findUniqueOrThrow({ where: { id: clientId } })).currentEffectiveDate
        ?.toISOString()
        .slice(0, 10),
    ).toBe("2027-01-01");
  });

  it("el historial no se puede editar", async () => {
    const old = await prisma.clientInsurance.findFirstOrThrow({
      where: { clientId, isCurrent: false },
    });
    await expectError(
      updateCoverage(agent, old.id, updateCoverageSchema.parse({ status: "ACTIVE" })),
      "INVALID",
    );
    await expectError(
      changeCarrier(
        agent,
        old.id,
        changeCarrierSchema.parse({ carrierId: carrierX, status: "ACTIVE" }),
      ),
      "INVALID",
    );
  });

  it("una fecha de fin anterior a la efectiva se rechaza (regla de la base)", async () => {
    const c = await current();
    await expectError(
      endCoverage(agent, c.id, endCoverageSchema.parse({ status: "ENDED", endDate: "2020-01-01" })),
      "INVALID",
      "endDate",
    );
  });

  it("terminar la cobertura la saca de 'actual' y la conserva en el historial", async () => {
    const c = await current();
    await endCoverage(
      agent,
      c.id,
      endCoverageSchema.parse({ status: "CANCELLED", reason: "El cliente desistió." }),
    );
    const row = await prisma.clientInsurance.findUniqueOrThrow({ where: { id: c.id } });
    expect(row).toMatchObject({
      isCurrent: false,
      status: "CANCELLED",
      changeReason: "El cliente desistió.",
    });
    expect(
      (await prisma.client.findUniqueOrThrow({ where: { id: clientId } })).currentEffectiveDate,
    ).toBeNull();
    const coverage = (await getClientCoverage(agent, clientId))!;
    expect(coverage.coverages.filter((x) => x.isCurrent)).toHaveLength(0);
    expect(coverage.coverages).toHaveLength(2);
  });

  it("después de terminarla se puede registrar una nueva", async () => {
    await addCoverage(agent, clientId, add({ effectiveDate: "2027-02-01", memberNumber: "" }));
    const list = await listClients(agent, { page: 1, pageSize: 100, carrierId: carrierX });
    expect(list.items.map((c) => c.id)).toContain(clientId);
  });
});

describe("revelar números de póliza", () => {
  it("el agente revela el número de miembro y queda en auditoría; el asistente no puede", async () => {
    const withNumber = await prisma.clientInsurance.findFirstOrThrow({
      where: { clientId, memberNumberEnc: { not: null } },
    });
    const { value } = await revealInsuranceNumber(agent, withNumber.id, "member");
    expect(value).toMatch(/^MEM[XY]\d{7}$/);
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { action: "SENSITIVE_REVEALED", targetId: withNumber.id },
    });
    expect(JSON.stringify(audit.metadata)).not.toContain(value);
    await expectError(revealInsuranceNumber(assistant, withNumber.id, "member"), "FORBIDDEN");
    await expectError(revealInsuranceNumber(otherAgent, withNumber.id, "member"), "NOT_FOUND");
  });
});
