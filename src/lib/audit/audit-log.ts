import "server-only";
import { prisma } from "@/lib/db";
import {
  clientIpFrom,
  sanitizeAuditMetadata,
  userAgentFrom,
  type AuditAction,
  type AuditOutcome,
} from "./sanitize";

export type AuditEntry = {
  action: AuditAction;
  outcome: AuditOutcome;
  actorId?: string | null;
  targetType?: string;
  targetId?: string;
  headers?: Headers | null;
  metadata?: Record<string, unknown>;
};

/**
 * Registra un evento de seguridad. Nunca lanza error hacia quien lo llama:
 * un fallo al auditar no debe tumbar el login, pero sí queda en el log del servidor
 * (sin datos del evento, solo el tipo de acción).
 */
export async function recordAudit(entry: AuditEntry): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        action: entry.action,
        outcome: entry.outcome,
        actorId: entry.actorId ?? null,
        targetType: entry.targetType,
        targetId: entry.targetId,
        ipAddress: clientIpFrom(entry.headers),
        userAgent: userAgentFrom(entry.headers),
        metadata: sanitizeAuditMetadata(entry.metadata),
      },
    });
  } catch {
    console.error(`[audit] no se pudo registrar el evento ${entry.action}`);
  }
}
