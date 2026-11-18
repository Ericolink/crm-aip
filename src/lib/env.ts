import "server-only";
import { z } from "zod";

/**
 * Validación de variables de entorno del servidor.
 * Si falta una variable o tiene formato inválido, la app falla al arrancar con un
 * mensaje que nombra la variable, pero NUNCA imprime su valor.
 */
/** Llave de 32 bytes codificada en base64 (AES-256 / HMAC-SHA256). */
function base64Key32() {
  return z.string().refine((v) => Buffer.from(v, "base64").length === 32, {
    message: "Debe ser una llave de 32 bytes en base64",
  });
}

const serverEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z
    .string()
    .url()
    .refine((v) => v.startsWith("postgresql://") || v.startsWith("postgres://"), {
      message: "Debe ser una URL de PostgreSQL",
    }),
  BETTER_AUTH_SECRET: z.string().min(32, { message: "Debe tener al menos 32 caracteres" }),
  BETTER_AUTH_URL: z.string().url(),
  FIELD_ENCRYPTION_KEY: base64Key32(),
  BLIND_INDEX_KEY: base64Key32(),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export function parseServerEnv(source: Record<string, string | undefined>): ServerEnv {
  const result = serverEnvSchema.safeParse(source);
  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(
      `Variables de entorno inválidas:\n${problems}\nRevisa tu archivo .env (ver .env.example).`,
    );
  }
  return result.data;
}

let cached: ServerEnv | undefined;

/** Acceso perezoso: se valida la primera vez que algún módulo del servidor lo necesita. */
export function serverEnv(): ServerEnv {
  cached ??= parseServerEnv(process.env);
  return cached;
}
