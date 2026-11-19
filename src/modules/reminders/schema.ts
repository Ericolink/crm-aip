import { z } from "zod";
import { zonedLocalToUtc } from "@/lib/timezone";

/** Recordatorio de seguimiento. Mensajes = claves de "Reminders.validation". */

export const REMINDER_PRIORITIES = ["NORMAL", "HIGH", "URGENT"] as const;

const YEAR_MS = 365 * 24 * 60 * 60 * 1000;

export const reminderSchema = z.object({
  description: z.string().trim().min(1, { message: "required" }).max(500, { message: "tooLong" }),
  /** Fecha y hora "de pared" en Florida: "YYYY-MM-DDTHH:mm". */
  dueAt: z
    .string()
    .refine((v) => zonedLocalToUtc(v) !== null, { message: "invalidDateTime" })
    .refine(
      (v) => {
        const d = zonedLocalToUtc(v);
        return !d || (d.getTime() > Date.now() - YEAR_MS && d.getTime() < Date.now() + 2 * YEAR_MS);
      },
      { message: "outOfRange" },
    ),
  priority: z.enum(REMINDER_PRIORITIES),
  /** Persona responsable; vacío = quien lo crea (al crear) o sin cambio (al editar). */
  assignedToId: z
    .string()
    .max(64)
    .optional()
    .transform((v) => (v ? v : undefined)),
});

export type ReminderValues = z.output<typeof reminderSchema>;
