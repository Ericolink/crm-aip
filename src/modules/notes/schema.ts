import { z } from "zod";

/** Nota de seguimiento. Mensajes = claves de "Notes.validation". */
export const NOTE_MAX_LENGTH = 5000;

/** Casilla de formulario: "on" / "true" / true → true; ausente → false. */
const checkbox = z.preprocess((v) => v === true || v === "on" || v === "true", z.boolean());

export const noteSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, { message: "required" })
    .max(NOTE_MAX_LENGTH, { message: "tooLong" }),
  isImportant: checkbox,
});

export type NoteValues = z.output<typeof noteSchema>;
