"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { recordAudit } from "@/lib/audit/audit-log";
import { auth } from "@/lib/auth/auth";
import { getOptionalUserId } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { routing } from "@/i18n/routing";

const localeSchema = z.enum(routing.locales);

/**
 * Guarda el idioma preferido del usuario para que lo siga en cualquier dispositivo.
 * Sin sesión (p. ej. en el login) no hace nada: ahí basta con la cookie de idioma.
 */
export async function updatePreferredLocale(input: unknown): Promise<{ ok: boolean }> {
  const parsed = localeSchema.safeParse(input);
  if (!parsed.success) return { ok: false };

  const userId = await getOptionalUserId();
  if (!userId) return { ok: true };

  await prisma.user.update({ where: { id: userId }, data: { preferredLocale: parsed.data } });
  await recordAudit({
    action: "PREFERENCE_UPDATED",
    outcome: "SUCCESS",
    actorId: userId,
    metadata: { preference: "locale", value: parsed.data },
  });
  return { ok: true };
}

/** Cierra las sesiones del usuario en otros dispositivos (mantiene la actual). */
export async function signOutOtherSessions(): Promise<{ ok: boolean }> {
  const userId = await getOptionalUserId();
  if (!userId) return { ok: false };
  await auth.api.revokeOtherSessions({ headers: await headers() });
  return { ok: true };
}
