import { beforeAll, describe, expect, it } from "vitest";
import type { CurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { clientFormSchema, type ClientFormInput } from "@/modules/clients/schema";
import {
  createClient,
  deleteClient,
  getClientDetail,
  getClientForEdit,
  listClients,
  revealBeneficiaryNumber,
  ServiceError,
  updateClient,
} from "@/modules/clients/service";
import { clientInput, createTestUser } from "./helpers";

// Números ficticios (un MBI real nunca empieza con 0).
const MBI = "0EG4-TE5-MK73";
const MBI_NORMALIZED = "0EG4TE5MK73";
const MEDICAID = "0012345678";

const parse = (input: ClientFormInput) => clientFormSchema.parse(input);
const expectServiceError = async (promise: Promise<unknown>, code: ServiceError["code"]) => {
  await expect(promise).rejects.toBeInstanceOf(ServiceError);
  await expect(promise).rejects.toMatchObject({ code });
};

let admin: CurrentUser;
let agentA: CurrentUser;
let agentB: CurrentUser;
let assistant: CurrentUser;
let diabetesId: string;
let hypertensionId: string;

beforeAll(async () => {
  admin = await createTestUser("ADMIN", "Admin Prueba");
  agentA = await createTestUser("AGENT", "Agente A");
  agentB = await createTestUser("AGENT", "Agente B");
  assistant = await createTestUser("ASSISTANT", "Asistente");
  diabetesId = (
    await prisma.chronicCondition.findUniqueOrThrow({ where: { nameEn: "Type 2 diabetes" } })
  ).id;
  hypertensionId = (
    await prisma.chronicCondition.findUniqueOrThrow({ where: { nameEn: "Hypertension" } })
  ).id;
});

async function createFullClient(owner: CurrentUser, overrides: Partial<ClientFormInput> = {}) {
  const base = clientInput();
  return createClient(
    owner,
    parse({
      ...base,
      firstName: "Rosa",
      lastName: "Prueba",
      dateOfBirth: "1954-03-14",
      primaryPhone: "(305) 555-0142",
      status: "PENDING",
      programs: {
        ...base.programs,
        MEDICARE: {
          enabled: true,
          beneficiaryNumber: MBI,
          partAEffectiveDate: "2019-03-01",
          partBEffectiveDate: "2019-03-01",
        },
        MEDICAID: { enabled: true, beneficiaryNumber: MEDICAID },
      },
      conditionIds: [diabetesId],
      // "Hipertensión" existe en el catálogo → se guarda como del catálogo; la otra como texto libre.
      customConditions: ["Hipertensión", "Condición rara de prueba"],
      ...overrides,
    }),
  );
}

describe("crear cliente", () => {
  it("guarda datos, programas cifrados, condiciones e historial", async () => {
    const id = await createFullClient(agentA);
    const client = await prisma.client.findUniqueOrThrow({
      where: { id },
      include: { programs: { include: { program: true } }, conditions: true },
    });

    expect(client.assignedAgentId).toBe(agentA.id);
    expect(client.createdById).toBe(agentA.id);
    expect(client.primaryPhone).toBe("3055550142");
    expect(client.dateOfBirth?.toISOString().slice(0, 10)).toBe("1954-03-14");

    const medicare = client.programs.find((p) => p.program.code === "MEDICARE")!;
    expect(medicare.beneficiaryNumberLast4).toBe("MK73");
    expect(medicare.beneficiaryNumberEnc).not.toContain(MBI_NORMALIZED);
    expect(medicare.partAEffectiveDate?.toISOString().slice(0, 10)).toBe("2019-03-01");

    expect(
      client.conditions
        .map((c) => c.conditionId)
        .filter(Boolean)
        .sort(),
    ).toEqual([diabetesId, hypertensionId].sort());
    expect(client.conditions.find((c) => c.customName)?.customName).toBe(
      "Condición rara de prueba",
    );

    const logs = await prisma.activityLog.findMany({ where: { clientId: id } });
    expect(
      logs
        .filter((l) => l.action === "CREATE")
        .map((l) => l.entityType)
        .sort(),
    ).toEqual(["client", "condition", "condition", "condition", "enrollment", "enrollment"].sort());
  });

  it("ningún registro de la base contiene el número en texto plano", async () => {
    await createFullClient(agentA);
    const hits = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
      `select count(*) n from activity_logs where changes::text ilike $1`,
      `%${MBI_NORMALIZED}%`,
    );
    expect(Number(hits[0].n)).toBe(0);
    const audit = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
      `select count(*) n from audit_logs where metadata::text ilike $1`,
      `%${MBI_NORMALIZED}%`,
    );
    expect(Number(audit[0].n)).toBe(0);
  });

  it("el asistente no puede crear clientes (y queda en auditoría)", async () => {
    const before = await prisma.auditLog.count({
      where: { action: "ACCESS_DENIED", actorId: assistant.id },
    });
    await expectServiceError(createClient(assistant, parse(clientInput())), "FORBIDDEN");
    expect(
      await prisma.auditLog.count({ where: { action: "ACCESS_DENIED", actorId: assistant.id } }),
    ).toBe(before + 1);
  });

  it("un agente sin permiso de asignar no puede asignar el cliente a otro", async () => {
    const id = await createClient(agentA, parse(clientInput({ assignedAgentId: agentB.id })));
    expect((await prisma.client.findUniqueOrThrow({ where: { id } })).assignedAgentId).toBe(
      agentA.id,
    );
  });

  it("el administrador puede asignar a otro agente; un id inexistente es rechazado", async () => {
    const id = await createClient(admin, parse(clientInput({ assignedAgentId: agentB.id })));
    expect((await prisma.client.findUniqueOrThrow({ where: { id } })).assignedAgentId).toBe(
      agentB.id,
    );
    await expectServiceError(
      createClient(admin, parse(clientInput({ assignedAgentId: "no-existe" }))),
      "INVALID",
    );
  });

  it("rechaza condiciones que no existen en el catálogo", async () => {
    await expectServiceError(
      createClient(agentA, parse(clientInput({ conditionIds: ["inventada"] }))),
      "INVALID",
    );
  });
});

describe("visibilidad", () => {
  it("cada agente solo ve sus clientes; el administrador ve todos", async () => {
    const id = await createFullClient(agentA);
    expect(await getClientDetail(agentA, id)).not.toBeNull();
    expect(await getClientDetail(agentB, id)).toBeNull();
    expect(await getClientDetail(admin, id)).not.toBeNull();

    const listB = await listClients(agentB, { page: 1, pageSize: 100 });
    expect(listB.items.some((c) => c.id === id)).toBe(false);
    const listAdmin = await listClients(admin, { page: 1, pageSize: 100 });
    expect(listAdmin.items.some((c) => c.id === id)).toBe(true);
  });

  it("otro agente no puede editar, revelar ni abrir el formulario de un cliente ajeno", async () => {
    const id = await createFullClient(agentA);
    await expectServiceError(updateClient(agentB, id, parse(clientInput())), "NOT_FOUND");
    expect(await getClientForEdit(agentB, id)).toBeNull();
    const enrollment = await prisma.clientProgramEnrollment.findFirstOrThrow({
      where: { clientId: id },
    });
    await expectServiceError(revealBeneficiaryNumber(agentB, enrollment.id), "NOT_FOUND");
  });

  it("el detalle no incluye valores cifrados y registra el acceso", async () => {
    const id = await createFullClient(agentA);
    const detail = await getClientDetail(agentA, id);
    const json = JSON.stringify(detail);
    expect(json).not.toContain("v1.");
    expect(json).not.toContain(MBI_NORMALIZED);
    expect(
      await prisma.auditLog.count({ where: { action: "CLIENT_VIEWED", targetId: id } }),
    ).toBeGreaterThan(0);
  });

  it("el formulario de edición nunca trae el número sensible, solo los últimos 4", async () => {
    const id = await createFullClient(agentA);
    const data = (await getClientForEdit(agentA, id))!;
    expect(data.values.programs.MEDICARE.beneficiaryNumber).toBe("");
    expect(data.savedNumbersLast4.MEDICARE).toBe("MK73");
  });
});

describe("editar cliente", () => {
  it("registra antes y después de cada cambio", async () => {
    const id = await createFullClient(agentA);
    const form = (await getClientForEdit(agentA, id))!.values;
    await updateClient(
      agentA,
      id,
      parse({ ...form, status: "ACTIVE", primaryPhone: "786-555-0199" }),
    );

    const client = await prisma.client.findUniqueOrThrow({ where: { id } });
    expect(client.status).toBe("ACTIVE");
    expect(client.primaryPhone).toBe("7865550199");
    const log = await prisma.activityLog.findFirstOrThrow({
      where: { clientId: id, entityType: "client", action: "UPDATE" },
    });
    expect(log.changes).toEqual({
      status: { from: "PENDING", to: "ACTIVE" },
      primaryPhone: { from: "3055550142", to: "7865550199" },
    });
  });

  it("guardar sin cambios no crea registros en el historial", async () => {
    const id = await createFullClient(agentA);
    const before = await prisma.activityLog.count({ where: { clientId: id } });
    const form = (await getClientForEdit(agentA, id))!.values;
    await updateClient(agentA, id, parse(form));
    expect(await prisma.activityLog.count({ where: { clientId: id } })).toBe(before);
  });

  it("número sensible: vacío lo conserva, el mismo número no cuenta como cambio, uno nuevo se registra sin valor", async () => {
    const id = await createFullClient(agentA);
    const form = (await getClientForEdit(agentA, id))!.values;
    const enrollment = () =>
      prisma.clientProgramEnrollment.findFirstOrThrow({
        where: { clientId: id, deletedAt: null, program: { code: "MEDICARE" } },
      });
    const original = await enrollment();

    await updateClient(agentA, id, parse(form)); // vacío
    expect((await enrollment()).beneficiaryNumberEnc).toBe(original.beneficiaryNumberEnc);

    const withSame = {
      ...form,
      programs: {
        ...form.programs,
        MEDICARE: { ...form.programs.MEDICARE, beneficiaryNumber: "0eg4te5mk73" },
      },
    };
    await updateClient(agentA, id, parse(withSame));
    expect((await enrollment()).beneficiaryNumberEnc).toBe(original.beneficiaryNumberEnc);

    const withNew = {
      ...form,
      programs: {
        ...form.programs,
        MEDICARE: { ...form.programs.MEDICARE, beneficiaryNumber: "0AB1CD2EF34" },
      },
    };
    await updateClient(agentA, id, parse(withNew));
    expect((await enrollment()).beneficiaryNumberLast4).toBe("EF34");
    const log = await prisma.activityLog.findFirstOrThrow({
      where: { clientId: id, entityType: "enrollment", action: "UPDATE" },
    });
    expect(log.changes).toEqual({ beneficiaryNumber: { changed: true } });
  });

  it("quitar y volver a agregar un programa conserva el historial", async () => {
    const id = await createFullClient(agentA);
    const form = (await getClientForEdit(agentA, id))!.values;
    await updateClient(
      agentA,
      id,
      parse({
        ...form,
        programs: { ...form.programs, MEDICAID: { enabled: false, beneficiaryNumber: "" } },
      }),
    );
    expect(
      await prisma.clientProgramEnrollment.count({ where: { clientId: id, deletedAt: null } }),
    ).toBe(1);
    expect(await prisma.clientProgramEnrollment.count({ where: { clientId: id } })).toBe(2);

    await updateClient(
      agentA,
      id,
      parse({
        ...form,
        programs: {
          ...form.programs,
          MEDICAID: { enabled: true, beneficiaryNumber: "0099999999" },
        },
      }),
    );
    expect(
      await prisma.clientProgramEnrollment.count({ where: { clientId: id, deletedAt: null } }),
    ).toBe(2);
    expect(await prisma.clientProgramEnrollment.count({ where: { clientId: id } })).toBe(3);
  });

  it("quitar una condición la marca como eliminada (no la borra)", async () => {
    const id = await createFullClient(agentA);
    const form = (await getClientForEdit(agentA, id))!.values;
    await updateClient(
      agentA,
      id,
      parse({ ...form, conditionIds: form.conditionIds.filter((c) => c !== diabetesId) }),
    );
    const rows = await prisma.clientCondition.findMany({
      where: { clientId: id, conditionId: diabetesId },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].deletedAt).not.toBeNull();
  });

  it("el asistente solo cambia contacto y dirección; lo demás se ignora", async () => {
    const id = await createFullClient(admin, { assignedAgentId: assistant.id });
    const form = (await getClientForEdit(admin, id))!.values;
    const attempt = parse({
      ...form,
      firstName: "Cambiado",
      status: "URGENT",
      dateOfBirth: "1990-01-01",
      primaryPhone: "954-555-0111",
      programs: { ...form.programs, MEDICARE: { ...form.programs.MEDICARE, enabled: false } },
      conditionIds: [],
    });
    await updateClient(assistant, id, attempt);

    const client = await prisma.client.findUniqueOrThrow({ where: { id } });
    expect(client.firstName).toBe("Rosa");
    expect(client.status).toBe("PENDING");
    expect(client.dateOfBirth?.toISOString().slice(0, 10)).toBe("1954-03-14");
    expect(client.primaryPhone).toBe("9545550111");
    expect(
      await prisma.clientProgramEnrollment.count({ where: { clientId: id, deletedAt: null } }),
    ).toBe(2);
    expect(await prisma.clientCondition.count({ where: { clientId: id, deletedAt: null } })).toBe(
      3,
    );
  });
});

describe("revelar número sensible", () => {
  it("el agente revela el número de su cliente y queda en auditoría", async () => {
    const id = await createFullClient(agentA);
    const enrollment = await prisma.clientProgramEnrollment.findFirstOrThrow({
      where: { clientId: id, program: { code: "MEDICARE" } },
    });
    const result = await revealBeneficiaryNumber(agentA, enrollment.id);
    expect(result).toEqual({ value: MBI_NORMALIZED, programCode: "MEDICARE" });
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { action: "SENSITIVE_REVEALED", targetId: enrollment.id },
    });
    expect(audit.actorId).toBe(agentA.id);
    expect(JSON.stringify(audit.metadata)).not.toContain(MBI_NORMALIZED);
  });

  it("el asistente no puede revelar números", async () => {
    const id = await createFullClient(admin, { assignedAgentId: assistant.id });
    const enrollment = await prisma.clientProgramEnrollment.findFirstOrThrow({
      where: { clientId: id },
    });
    await expectServiceError(revealBeneficiaryNumber(assistant, enrollment.id), "FORBIDDEN");
  });
});

describe("eliminar cliente", () => {
  it("el agente no puede eliminar", async () => {
    const id = await createFullClient(agentA);
    await expectServiceError(deleteClient(agentA, id), "FORBIDDEN");
  });

  it("el administrador elimina (borrado lógico): deja de verse pero se conserva con su historial", async () => {
    const id = await createFullClient(agentA);
    await deleteClient(admin, id);

    expect(await getClientDetail(admin, id)).toBeNull();
    expect(await getClientDetail(agentA, id)).toBeNull();
    const list = await listClients(admin, { page: 1, pageSize: 500 });
    expect(list.items.some((c) => c.id === id)).toBe(false);

    const row = await prisma.client.findUniqueOrThrow({ where: { id } });
    expect(row.deletedAt).not.toBeNull();
    expect(
      await prisma.activityLog.count({
        where: { clientId: id, action: "DELETE", entityType: "client" },
      }),
    ).toBe(1);
    await expectServiceError(deleteClient(admin, id), "NOT_FOUND");
  });
});

describe("paginación", () => {
  it("respeta el tamaño de página y el total", async () => {
    const total = (await listClients(admin, { page: 1, pageSize: 1000 })).total;
    const page1 = await listClients(admin, { page: 1, pageSize: 3 });
    const page2 = await listClients(admin, { page: 2, pageSize: 3 });
    expect(page1.total).toBe(total);
    expect(page1.items).toHaveLength(3);
    expect(page2.items.map((c) => c.id)).not.toContain(page1.items[0].id);
  });
});
