import { beforeAll, describe, expect, it } from "vitest";
import type { CurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/db";
import { clientFormSchema } from "@/modules/clients/schema";
import { createClient, deleteClient, updateClientStatus } from "@/modules/clients/service";
import { getDashboard } from "@/modules/dashboard/service";
import { addClientDoctorSchema } from "@/modules/doctors/schema";
import { addClientDoctor } from "@/modules/doctors/service";
import { linkAssistantToAgent } from "@/modules/users/service";
import { asCurrentUser, clientInput, createTestUser } from "./helpers";

let admin: CurrentUser;
let agent: CurrentUser;
let otherAgent: CurrentUser;
let assistant: CurrentUser;

const base = () => clientInput();
const withProgram = (code: "MEDICARE" | "MEDICAID" | "ACA", overrides = {}) =>
  clientFormSchema.parse({
    ...base(),
    ...overrides,
    programs: { ...base().programs, [code]: { enabled: true } },
  });

async function insurance(
  clientId: string,
  status: "APPLICATION_PENDING" | "ACTIVE",
  effective: string,
  submitted?: string,
) {
  return prisma.clientInsurance.create({
    data: {
      clientId,
      programId: (await prisma.coverageProgram.findUniqueOrThrow({ where: { code: "MEDICARE" } }))
        .id,
      carrierId: (await prisma.insuranceCarrier.findUniqueOrThrow({ where: { name: "Humana" } }))
        .id,
      status,
      effectiveDate: new Date(`${effective}T00:00:00Z`),
      applicationSubmittedAt: submitted ? new Date(`${submitted}T00:00:00Z`) : null,
      createdById: agent.id,
    },
  });
}

beforeAll(async () => {
  admin = await createTestUser("ADMIN", "Admin Panel");
  agent = await createTestUser("AGENT", "Agente Panel");
  otherAgent = await createTestUser("AGENT", "Otro Agente Panel");
  const a = await createTestUser("ASSISTANT", "Asistente Panel");
  await linkAssistantToAgent(admin, a.id, agent.id);
  assistant = await asCurrentUser(a.id);

  // Agente: 4 clientes (uno urgente, uno eliminado) — otro agente: 1 cliente.
  const c1 = await createClient(
    agent,
    withProgram("MEDICARE", { lastName: "Panel Uno", status: "PENDING" }),
  );
  const c2 = await createClient(
    agent,
    withProgram("MEDICAID", { lastName: "Panel Dos", status: "ACTIVE" }),
  );
  const c3 = await createClient(agent, withProgram("MEDICARE", { lastName: "Panel Tres" }));
  const c4 = await createClient(agent, withProgram("ACA", { lastName: "Panel Borrado" }));
  await updateClientStatus(agent, c3, "URGENT");
  await deleteClient(admin, c4);
  await createClient(otherAgent, withProgram("MEDICARE", { lastName: "Panel Ajeno" }));

  await insurance(c1, "APPLICATION_PENDING", "2099-01-01", "2026-01-01");
  await insurance(c3, "ACTIVE", "2099-02-01");
  await addClientDoctor(agent, c1, addClientDoctorSchema.parse({ name: "Dr. Panel", role: "PCP" }));

  await prisma.reminder.createMany({
    data: [
      {
        clientId: c1,
        assignedToId: agent.id,
        createdById: agent.id,
        description: "Vencido",
        dueAt: new Date(Date.now() - 86_400_000),
        priority: "URGENT",
      },
      {
        clientId: c2,
        assignedToId: agent.id,
        createdById: agent.id,
        description: "Mañana",
        dueAt: new Date(Date.now() + 86_400_000),
      },
      {
        clientId: c4,
        assignedToId: agent.id,
        createdById: agent.id,
        description: "De cliente borrado",
        dueAt: new Date(),
      },
      {
        clientId: c2,
        assignedToId: agent.id,
        createdById: agent.id,
        description: "Ya hecho",
        dueAt: new Date(),
        status: "DONE",
      },
    ],
  });
});

describe("panel del agente", () => {
  it("cuenta solo sus clientes no eliminados, por estatus", async () => {
    const d = await getDashboard(agent);
    expect(d.total).toBe(3);
    expect(d.statusCounts).toEqual({ NEW: 0, PENDING: 1, ACTIVE: 1, URGENT: 1 });
    expect(d.newThisWeek).toBe(3);
    expect(d.recentClients.map((c) => c.lastName)).not.toContain("Panel Borrado");
    expect(d.recentClients.map((c) => c.lastName)).not.toContain("Panel Ajeno");
  });

  it("clientes por programa", async () => {
    const programs = (await getDashboard(agent)).coverage!.programs;
    expect(Object.fromEntries(programs.map((p) => [p.code, p.count]))).toEqual({
      MEDICARE: 2,
      MEDICAID: 1,
      ACA: 0,
    });
  });

  it("solicitudes pendientes y próximas fechas efectivas", async () => {
    const c = (await getDashboard(agent)).coverage!;
    expect(c.pendingApplicationsCount).toBe(1);
    expect(c.pendingApplications[0].client.lastName).toBe("Panel Uno");
    expect(c.pendingApplications[0].daysWaiting).toBeGreaterThan(0);
    expect(c.upcomingEffective.map((i) => i.client.lastName)).toEqual(["Panel Uno", "Panel Tres"]);
  });

  it("seguimientos pendientes: vencidos primero, sin completados ni de clientes eliminados", async () => {
    const d = await getDashboard(agent);
    expect(d.followUps.map((r) => r.description)).toEqual(["Vencido", "Mañana"]);
    expect(d.followUps[0].overdue).toBe(true);
    expect(d.overdueCount).toBe(1);
  });

  it("actividad reciente de sus clientes", async () => {
    const d = await getDashboard(agent);
    expect(d.activity.length).toBeGreaterThan(0);
    expect(d.activity.every((a) => a.client && a.client.lastName.startsWith("Panel"))).toBe(true);
  });
});

describe("visibilidad y permisos", () => {
  it("el otro agente solo ve lo suyo", async () => {
    const d = await getDashboard(otherAgent);
    expect(d.total).toBe(1);
    expect(d.followUps).toEqual([]);
  });

  it("el asistente ve los números de su agente vinculado, sin datos de cobertura ni médicos", async () => {
    const d = await getDashboard(assistant);
    expect(d.total).toBe(3);
    expect(d.coverage).toBeNull();
    expect(
      d.activity.some((a) =>
        ["doctor", "insurance", "enrollment", "condition", "medication"].includes(a.entityType),
      ),
    ).toBe(false);
    expect(d.followUps.map((r) => r.description)).toEqual(["Vencido", "Mañana"]);
  });

  it("el administrador ve todo", async () => {
    const d = await getDashboard(admin);
    expect(d.total).toBeGreaterThanOrEqual(4);
    expect(d.coverage).not.toBeNull();
  });
});
