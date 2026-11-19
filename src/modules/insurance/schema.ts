import { z } from "zod";
import {
  optionalDate,
  optionalText,
  PROGRAM_CODES,
  sensitiveNumber,
} from "@/modules/clients/schema";

/**
 * Formularios de cobertura. Mismo esquema en navegador y servidor.
 * Mensajes = claves de traducción (namespace "Insurance.validation").
 * Números de miembro/confirmación: vacío = no cambiar (en edición nunca se envía el guardado).
 */

const insuranceNumber = sensitiveNumber(/^[A-Z0-9]{1,30}$/);

/** Al registrar o editar, la cobertura solo puede estar pendiente o activa. */
export const OPEN_INSURANCE_STATUSES = ["APPLICATION_PENDING", "ACTIVE"] as const;
/** Al terminarla: finalizada, cancelada o denegada. */
export const CLOSED_INSURANCE_STATUSES = ["ENDED", "CANCELLED", "DENIED"] as const;

const coverageFields = {
  planName: optionalText(120),
  memberNumber: insuranceNumber,
  confirmationNumber: insuranceNumber,
  applicationSubmittedAt: optionalDate,
  effectiveDate: optionalDate,
  status: z.enum(OPEN_INSURANCE_STATUSES),
};

const carrierId = z.string().min(1, { message: "required" }).max(40);

export const addCoverageSchema = z.object({
  programCode: z.enum(PROGRAM_CODES, { message: "required" }),
  carrierId,
  ...coverageFields,
});

/** Editar la cobertura actual (la aseguradora no se cambia aquí: eso es "cambiar de aseguradora"). */
export const updateCoverageSchema = z.object(coverageFields);

export const changeCarrierSchema = z.object({
  carrierId,
  ...coverageFields,
  changeReason: optionalText(300),
  /** Fin de la cobertura anterior. Si se omite: el día antes de la nueva fecha efectiva (o hoy). */
  previousEndDate: optionalDate,
});

export const endCoverageSchema = z
  .object({
    status: z.enum(CLOSED_INSURANCE_STATUSES),
    endDate: optionalDate,
    reason: optionalText(300),
  })
  .superRefine((v, ctx) => {
    if (v.status === "ENDED" && !v.endDate) {
      ctx.addIssue({ code: "custom", path: ["endDate"], message: "required" });
    }
  });

export type AddCoverageInput = z.input<typeof addCoverageSchema>;
export type AddCoverageValues = z.output<typeof addCoverageSchema>;
export type UpdateCoverageValues = z.output<typeof updateCoverageSchema>;
export type ChangeCarrierInput = z.input<typeof changeCarrierSchema>;
export type ChangeCarrierValues = z.output<typeof changeCarrierSchema>;
export type EndCoverageValues = z.output<typeof endCoverageSchema>;
