import { z } from "zod";

/** Nombre comercial de la aseguradora (no se traduce). */
export const carrierNameSchema = z
  .string()
  .trim()
  .min(2, { message: "required" })
  .max(80, { message: "tooLong" })
  // Letras (con acentos), números, espacios y puntuación común en nombres comerciales.
  .regex(/^[\p{L}\p{N} .,&'()\-/]+$/u, { message: "invalidName" });
