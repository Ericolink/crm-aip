import "server-only";
import { recordAudit } from "@/lib/audit/audit-log";
import type { CurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/db";
import { PERMISSIONS, ROLE_KEYS } from "@/lib/permissions/catalog";
import { ServiceError } from "@/lib/service-error";

/**
 * Administración de usuarios (Etapa 3b: consulta y vínculos asistente ↔ agente).
 * Crear/desactivar usuarios y cambiar roles llega en la etapa de administración.
 */

/** Roles cuyos clientes puede apoyar un asistente. */
const SUPPORTABLE_ROLES = [ROLE_KEYS.AGENT, ROLE_KEYS.ADMIN];

async function requireUserManager(user: CurrentUser) {
  if (user.permissions.has(PERMISSIONS.USER_MANAGE)) return;
  await recordAudit({
    action: "ACCESS_DENIED",
    outcome: "DENIED",
    actorId: user.id,
    metadata: { permission: PERMISSIONS.USER_MANAGE },
  });
  throw new ServiceError("FORBIDDEN");
}

export async function listUsersWithLinks(user: CurrentUser) {
  await requireUserManager(user);
  const users = await prisma.user.findMany({
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      email: true,
      isActive: true,
      lastLoginAt: true,
      role: { select: { key: true, nameEs: true, nameEn: true } },
      assistantLinks: {
        where: { isActive: true },
        orderBy: { agent: { name: "asc" } },
        select: { agent: { select: { id: true, name: true, isActive: true } } },
      },
      agentLinks: {
        where: { isActive: true },
        orderBy: { assistant: { name: "asc" } },
        select: { assistant: { select: { id: true, name: true, isActive: true } } },
      },
      _count: { select: { clientsAssigned: { where: { deletedAt: null } } } },
    },
  });

  return users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    isActive: u.isActive,
    lastLoginAt: u.lastLoginAt,
    role: { key: u.role.key, name: { es: u.role.nameEs, en: u.role.nameEn } },
    linkedAgents: u.assistantLinks.map((l) => l.agent),
    linkedAssistants: u.agentLinks.map((l) => l.assistant),
    assignedClients: u._count.clientsAssigned,
  }));
}

export type UserAdminRow = Awaited<ReturnType<typeof listUsersWithLinks>>[number];

async function loadPair(assistantId: string, agentId: string) {
  if (assistantId === agentId) throw new ServiceError("INVALID", "agentId");
  const [assistant, agent] = await Promise.all([
    prisma.user.findUnique({
      where: { id: assistantId },
      select: { id: true, isActive: true, role: { select: { key: true } } },
    }),
    prisma.user.findUnique({
      where: { id: agentId },
      select: { id: true, isActive: true, role: { select: { key: true } } },
    }),
  ]);
  if (!assistant || assistant.role.key !== ROLE_KEYS.ASSISTANT)
    throw new ServiceError("INVALID", "assistantId");
  if (!agent || !(SUPPORTABLE_ROLES as string[]).includes(agent.role.key)) {
    throw new ServiceError("INVALID", "agentId");
  }
  return { assistant, agent };
}

/** Vincula (o reactiva el vínculo de) un asistente con un agente. */
export async function linkAssistantToAgent(
  user: CurrentUser,
  assistantId: string,
  agentId: string,
) {
  await requireUserManager(user);
  const { assistant, agent } = await loadPair(assistantId, agentId);
  if (!assistant.isActive || !agent.isActive) throw new ServiceError("INVALID", "agentId");

  const link = await prisma.assistantAgentLink.upsert({
    where: { assistantId_agentId: { assistantId, agentId } },
    create: { assistantId, agentId, createdById: user.id },
    update: { isActive: true, deactivatedAt: null },
  });
  await recordAudit({
    action: "ASSISTANT_LINK_CREATED",
    outcome: "SUCCESS",
    actorId: user.id,
    targetType: "assistant_agent_link",
    targetId: link.id,
    metadata: { assistantId, agentId },
  });
}

/** Desactiva el vínculo: el asistente pierde el acceso en su siguiente petición. */
export async function unlinkAssistantFromAgent(
  user: CurrentUser,
  assistantId: string,
  agentId: string,
) {
  await requireUserManager(user);
  const link = await prisma.assistantAgentLink.findUnique({
    where: { assistantId_agentId: { assistantId, agentId } },
  });
  if (!link || !link.isActive) throw new ServiceError("NOT_FOUND");

  await prisma.assistantAgentLink.update({
    where: { id: link.id },
    data: { isActive: false, deactivatedAt: new Date() },
  });
  await recordAudit({
    action: "ASSISTANT_LINK_REMOVED",
    outcome: "SUCCESS",
    actorId: user.id,
    targetType: "assistant_agent_link",
    targetId: link.id,
    metadata: { assistantId, agentId },
  });
}
