import "server-only";
import { createHash } from "node:crypto";
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
  /**
   * Solo para eventos de CONSULTA que ocurren al renderizar una página (p. ej. ver un cliente).
   * Next puede renderizar una página dos veces por petición; con esto, el mismo evento
   * (mismo usuario, acción, objetivo y datos) dentro de la ventana se guarda una sola vez.
   * La base lo garantiza con un índice único (sin condiciones de carrera).
   * Las ACCIONES del usuario (revelar, iniciar sesión, cambiar datos) nunca se deduplican.
   */
  dedupeWindowSeconds?: number;
  /**
   * Distingue eventos con los mismos metadatos (p. ej. dos búsquedas distintas del mismo largo).
   * Debe ser un valor YA protegido con llave (índice ciego); solo entra al hash, nunca se guarda.
   */
  dedupeDiscriminator?: string;
};

/** Clave estable para deduplicar: no contiene datos legibles (los metadatos van como hash). */
export function auditDedupeKey(
  entry: Pick<
    AuditEntry,
    "action" | "actorId" | "targetId" | "dedupeWindowSeconds" | "dedupeDiscriminator"
  >,
  metadata: unknown,
  now = Date.now(),
): string | null {
  if (!entry.dedupeWindowSeconds) return null;
  const bucket = Math.floor(now / (entry.dedupeWindowSeconds * 1000));
  const meta = createHash("sha256")
    .update(JSON.stringify([metadata ?? null, entry.dedupeDiscriminator ?? null]))
    .digest("base64url");
  return [
    entry.actorId ?? "-",
    entry.action,
    entry.targetId ?? "-",
    meta.slice(0, 16),
    bucket,
  ].join(":");
}

/**
 * Registra un evento de seguridad. Nunca lanza error hacia quien lo llama:
 * un fallo al auditar no debe tumbar el login, pero sí queda en el log del servidor
 * (sin datos del evento, solo el tipo de acción).
 */
export async function recordAudit(entry: AuditEntry): Promise<void> {
  try {
    const metadata = sanitizeAuditMetadata(entry.metadata);
    const data = {
      action: entry.action,
      outcome: entry.outcome,
      actorId: entry.actorId ?? null,
      targetType: entry.targetType,
      targetId: entry.targetId,
      ipAddress: clientIpFrom(entry.headers),
      userAgent: userAgentFrom(entry.headers),
      metadata,
      dedupeKey: auditDedupeKey(entry, metadata),
    };
    // skipDuplicates = INSERT … ON CONFLICT DO NOTHING sobre dedupeKey.
    await prisma.auditLog.createMany({ data: [data], skipDuplicates: true });
  } catch {
    console.error(`[audit] no se pudo registrar el evento ${entry.action}`);
  }
}
