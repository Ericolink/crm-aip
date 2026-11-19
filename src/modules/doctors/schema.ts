import { z } from "zod";
import { optionalPhone, optionalText } from "@/modules/clients/schema";

/**
 * Formularios de médicos. Mismo esquema en navegador y servidor.
 * Mensajes = claves de traducción (namespace "Doctors.validation").
 */

export const DOCTOR_ROLES = ["PCP", "SPECIALIST"] as const;

/** Datos del DIRECTORIO (compartidos entre todos los clientes de ese médico). */
const doctorDirectoryFields = {
  name: z.string().trim().min(2, { message: "required" }).max(120, { message: "tooLong" }),
  specialty: optionalText(80),
  clinic: optionalText(120),
  phone: optionalPhone,
  address: optionalText(200),
  npi: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v.replace(/\D/g, "") : undefined))
    .refine((v) => v === undefined || /^\d{10}$/.test(v), { message: "invalidNpi" }),
};

/** Datos propios de ESTE cliente. */
const clientLinkFields = {
  role: z.enum(DOCTOR_ROLES),
  notes: optionalText(500),
};

/**
 * Agregar un médico al cliente: uno existente del directorio (doctorId) o uno nuevo
 * (con sus datos). Si viene doctorId, los campos del directorio se ignoran.
 */
export const addClientDoctorSchema = z
  .object({
    doctorId: z
      .string()
      .max(40)
      .optional()
      .transform((v) => (v ? v : undefined)),
    ...doctorDirectoryFields,
    // El nombre solo es obligatorio al crear un médico nuevo (se valida abajo).
    name: z.string().trim().max(120, { message: "tooLong" }).optional(),
    ...clientLinkFields,
  })
  .superRefine((v, ctx) => {
    if (!v.doctorId && (!v.name || v.name.length < 2)) {
      ctx.addIssue({ code: "custom", path: ["name"], message: "required" });
    }
  });

/** Editar: datos del directorio + datos de este cliente. */
export const updateClientDoctorSchema = z.object({ ...doctorDirectoryFields, ...clientLinkFields });

export type AddClientDoctorValues = z.output<typeof addClientDoctorSchema>;
export type UpdateClientDoctorValues = z.output<typeof updateClientDoctorSchema>;
