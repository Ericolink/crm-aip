import { z } from "zod";

/**
 * Catálogos editables desde Configuración: condiciones crónicas y tipos de consentimiento.
 * Sin dependencias de servidor: los usan los formularios y los servicios.
 */

const catalogName = z
  .string()
  .trim()
  .min(2, { message: "required" })
  .max(80, { message: "tooLong" })
  .regex(/^[\p{L}\p{M}\p{N} .,&'()\-/+]+$/u, { message: "invalidName" });

export const conditionSchema = z.object({ nameEs: catalogName, nameEn: catalogName });
export type ConditionInput = z.infer<typeof conditionSchema>;

/** Vigencia máxima configurable: 10 años. Vacío = no vence. */
export const MAX_VALIDITY_DAYS = 3650;

export const consentTypeSchema = z.object({
  nameEs: catalogName,
  nameEn: catalogName,
  requiresDocument: z.boolean(),
  defaultValidityDays: z
    .number({ message: "invalidNumber" })
    .int({ message: "invalidNumber" })
    .min(1, { message: "invalidNumber" })
    .max(MAX_VALIDITY_DAYS, { message: "tooLarge" })
    .nullable(),
});
export type ConsentTypeInput = z.infer<typeof consentTypeSchema>;

/** Código estable a partir del nombre en inglés: "Phone contact" → "PHONE_CONTACT". */
export function consentCodeFromName(nameEn: string): string {
  const code = nameEn
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  return code || "CONSENT";
}
