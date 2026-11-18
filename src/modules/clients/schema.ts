import { z } from "zod";
import { normalizeIdentifier } from "@/lib/crypto/sensitive-field";
import { parseDateOnly, phoneDigits } from "@/lib/format";

/**
 * Esquema del formulario de cliente. Se usa IGUAL en el navegador (validación inmediata)
 * y en el servidor (validación obligatoria antes de guardar).
 *
 * Los mensajes de error son CLAVES de traducción (namespace "Clients.validation"),
 * no textos: así el mismo esquema sirve en español e inglés.
 */

export const CLIENT_STATUSES = ["NEW", "PENDING", "ACTIVE", "URGENT"] as const;
export const PREFERRED_LANGUAGES = ["ES", "EN", "OTHER"] as const;
export const RELATIONSHIPS = [
  "SON",
  "DAUGHTER",
  "HUSBAND",
  "WIFE",
  "RELATIVE",
  "CAREGIVER",
  "FRIEND",
  "OTHER",
] as const;
export const PROGRAM_CODES = ["MEDICARE", "MEDICAID", "ACA"] as const;
export type ProgramCode = (typeof PROGRAM_CODES)[number];

const MAX_TEXT = 120;

/** Texto opcional: "" o espacios → undefined. */
const optionalText = (max = MAX_TEXT) =>
  z
    .string()
    .trim()
    .max(max, { message: "tooLong" })
    .optional()
    .transform((v) => (v ? v : undefined));

const requiredName = z
  .string()
  .trim()
  .min(1, { message: "required" })
  .max(80, { message: "tooLong" });

const optionalPhone = z
  .string()
  .optional()
  .transform((v) => (v ? phoneDigits(v) : undefined))
  .refine((v) => v === undefined || v === "" || /^\d{10}$/.test(v), { message: "invalidPhone" })
  .transform((v) => (v ? v : undefined));

const optionalDate = z
  .string()
  .optional()
  .refine((v) => !v || parseDateOnly(v) !== null, { message: "invalidDate" })
  .transform((v) => (v ? v : undefined));

const optionalState = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? v.toUpperCase() : undefined))
  .refine((v) => v === undefined || /^[A-Z]{2}$/.test(v), { message: "invalidState" });

const optionalZip = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? v : undefined))
  .refine((v) => v === undefined || /^\d{5}(-?\d{4})?$/.test(v), { message: "invalidZip" });

/**
 * Número sensible. Vacío = no cambiar (en edición nunca se envía el valor guardado).
 * Se valida el formato aquí; el cifrado ocurre en el servidor.
 */
const sensitiveNumber = (pattern: RegExp) =>
  z
    .string()
    .optional()
    .transform((v) => (v ? normalizeIdentifier(v) : undefined))
    .refine((v) => v === undefined || v === "" || pattern.test(v), {
      message: "invalidIdentifier",
    })
    .transform((v) => (v ? v : undefined));

export const clientFormSchema = z
  .object({
    firstName: requiredName,
    lastName: requiredName,
    dateOfBirth: optionalDate,
    preferredLanguage: z.enum(PREFERRED_LANGUAGES),
    status: z.enum(CLIENT_STATUSES),

    primaryPhone: optionalPhone,
    email: z
      .string()
      .trim()
      .toLowerCase()
      .optional()
      .transform((v) => (v ? v : undefined))
      .refine((v) => v === undefined || z.email().safeParse(v).success, {
        message: "invalidEmail",
      }),
    altPhone: optionalPhone,
    altContactName: optionalText(),
    altContactRelationship: z
      .enum(RELATIONSHIPS)
      .optional()
      .or(z.literal("").transform(() => undefined)),
    altContactRelationshipOther: optionalText(60),

    homeStreet: optionalText(),
    homeUnit: optionalText(30),
    homeCity: optionalText(60),
    homeState: optionalState,
    homeZip: optionalZip,

    mailingSameAsHome: z.boolean(),
    mailingStreet: optionalText(),
    mailingUnit: optionalText(30),
    mailingCity: optionalText(60),
    mailingState: optionalState,
    mailingZip: optionalZip,

    programs: z.object({
      MEDICARE: z.object({
        enabled: z.boolean(),
        // MBI: 11 caracteres alfanuméricos.
        beneficiaryNumber: sensitiveNumber(/^[A-Z0-9]{11}$/),
        partAEffectiveDate: optionalDate,
        partBEffectiveDate: optionalDate,
      }),
      MEDICAID: z.object({
        enabled: z.boolean(),
        beneficiaryNumber: sensitiveNumber(/^[A-Z0-9]{1,20}$/),
      }),
      ACA: z.object({ enabled: z.boolean() }),
    }),

    conditionIds: z.array(z.string().min(1).max(40)).max(30),
    customConditions: z.array(z.string().trim().min(1).max(80)).max(10),

    assignedAgentId: z
      .string()
      .optional()
      .transform((v) => (v ? v : undefined)),
  })
  .superRefine((data, ctx) => {
    // (Una fecha inexistente ya la marcó optionalDate; aquí solo se revisa el rango.)
    const dob = parseDateOnly(data.dateOfBirth);
    if (dob) {
      if (dob > new Date() || dob.getUTCFullYear() < 1900) {
        ctx.addIssue({ code: "custom", path: ["dateOfBirth"], message: "invalidDate" });
      }
    }
    if (data.altContactRelationship === "OTHER" && !data.altContactRelationshipOther) {
      ctx.addIssue({ code: "custom", path: ["altContactRelationshipOther"], message: "required" });
    }
    if (!data.mailingSameAsHome) {
      for (const field of ["mailingStreet", "mailingCity", "mailingState", "mailingZip"] as const) {
        if (!data[field]) ctx.addIssue({ code: "custom", path: [field], message: "required" });
      }
    }
  });

export type ClientFormInput = z.input<typeof clientFormSchema>;
export type ClientFormValues = z.output<typeof clientFormSchema>;

/** Valores iniciales de un cliente nuevo. */
export function emptyClientForm(): ClientFormInput {
  return {
    firstName: "",
    lastName: "",
    dateOfBirth: "",
    preferredLanguage: "ES",
    status: "NEW",
    primaryPhone: "",
    email: "",
    altPhone: "",
    altContactName: "",
    altContactRelationship: "",
    altContactRelationshipOther: "",
    homeStreet: "",
    homeUnit: "",
    homeCity: "",
    homeState: "FL",
    homeZip: "",
    mailingSameAsHome: true,
    mailingStreet: "",
    mailingUnit: "",
    mailingCity: "",
    mailingState: "",
    mailingZip: "",
    programs: {
      MEDICARE: {
        enabled: false,
        beneficiaryNumber: "",
        partAEffectiveDate: "",
        partBEffectiveDate: "",
      },
      MEDICAID: { enabled: false, beneficiaryNumber: "" },
      ACA: { enabled: false },
    },
    conditionIds: [],
    customConditions: [],
    assignedAgentId: "",
  };
}
