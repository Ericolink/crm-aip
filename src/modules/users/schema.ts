import { z } from "zod";
import { PASSWORD_POLICY } from "@/lib/auth/policy";
import { ROLE_KEYS } from "@/lib/permissions/catalog";

/**
 * Validación del alta y la edición de usuarios (Configuración → Usuarios).
 * Sin dependencias de servidor: la usan el formulario y el servicio.
 */

export const USER_ROLE_KEYS = [ROLE_KEYS.ADMIN, ROLE_KEYS.AGENT, ROLE_KEYS.ASSISTANT] as const;

export const userNameSchema = z
  .string()
  .trim()
  .min(2, { message: "required" })
  .max(80, { message: "tooLong" })
  .regex(/^[\p{L}\p{M} .'-]+$/u, { message: "invalidName" });

export const userEmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, { message: "tooLong" })
  .pipe(z.email({ message: "invalidEmail" }));

export const passwordSchema = z
  .string()
  .min(PASSWORD_POLICY.minLength, { message: "tooShort" })
  .max(PASSWORD_POLICY.maxLength, { message: "tooLong" });

const base = {
  name: userNameSchema,
  email: userEmailSchema,
  roleKey: z.enum(USER_ROLE_KEYS, { message: "required" }),
  preferredLocale: z.enum(["es", "en"], { message: "required" }),
};

export const createUserSchema = z.object({ ...base, password: passwordSchema });
export type CreateUserInput = z.infer<typeof createUserSchema>;

export const updateUserSchema = z.object(base);
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
