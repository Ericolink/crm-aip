import { z } from "zod";
import { optionalText } from "@/modules/clients/schema";

/** Formulario de medicamento del cliente. Mensajes = claves de "Medications.validation". */

export const MEDICATION_FORMS = [
  "TABLET",
  "CAPSULE",
  "LIQUID",
  "INJECTION",
  "INHALER",
  "TOPICAL",
  "PATCH",
  "DROPS",
  "OTHER",
] as const;

export const clientMedicationSchema = z
  .object({
    /** Nombre del medicamento: se reutiliza del catálogo si ya existe (sin importar mayúsculas). */
    name: z
      .string()
      .trim()
      .min(2, { message: "required" })
      .max(120, { message: "tooLong" })
      .regex(/^[\p{L}\p{N} .,'()/+\-%]+$/u, { message: "invalidName" }),
    dose: optionalText(60),
    frequency: optionalText(80),
    form: z
      .enum(MEDICATION_FORMS)
      .optional()
      .or(z.literal("").transform(() => undefined)),
    formOther: optionalText(60),
    /** Médico del cliente que lo prescribe (opcional). */
    prescriberClientDoctorId: z
      .string()
      .max(40)
      .optional()
      .transform((v) => (v ? v : undefined)),
    notes: optionalText(500),
  })
  .superRefine((v, ctx) => {
    if (v.form === "OTHER" && !v.formOther) {
      ctx.addIssue({ code: "custom", path: ["formOther"], message: "required" });
    }
  });

export type ClientMedicationValues = z.output<typeof clientMedicationSchema>;
