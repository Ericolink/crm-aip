import "server-only";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { createAuthMiddleware, isAPIError } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { twoFactor } from "better-auth/plugins";
import { recordAudit } from "@/lib/audit/audit-log";
import { prisma } from "@/lib/db";
import { serverEnv } from "@/lib/env";
import { LOGIN_RATE_LIMIT, PASSWORD_POLICY, SESSION_POLICY } from "./policy";

const env = serverEnv();

/** Busca el id de un usuario por correo SOLO para atribuir eventos de auditoría. */
async function userIdByEmail(email: unknown): Promise<string | null> {
  if (typeof email !== "string" || email.length > 320) return null;
  const user = await prisma.user.findUnique({
    where: { email: email.trim().toLowerCase() },
    select: { id: true },
  });
  return user?.id ?? null;
}

export const auth = betterAuth({
  appName: "CRM",
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  trustedOrigins: [env.BETTER_AUTH_URL],
  database: prismaAdapter(prisma, { provider: "postgresql" }),

  // Privacidad: nada de telemetría hacia terceros.
  telemetry: { enabled: false },

  emailAndPassword: {
    enabled: true,
    // No hay registro público: los usuarios los crea un administrador.
    disableSignUp: true,
    minPasswordLength: PASSWORD_POLICY.minLength,
    maxPasswordLength: PASSWORD_POLICY.maxLength,
    revokeSessionsOnPasswordReset: true,
  },

  session: {
    // Vencimiento por inactividad: cada uso renueva la sesión por otros 15 min.
    expiresIn: SESSION_POLICY.idleTimeoutSeconds,
    updateAge: 60,
    // Para operaciones delicadas (p. ej. configurar 2FA) la sesión debe ser reciente.
    freshAge: 10 * 60,
    // Sin caché en cookie: cada petición valida contra la base, así revocar es inmediato.
    cookieCache: { enabled: false },
  },

  user: {
    additionalFields: {
      roleId: { type: "string", required: true, input: false },
      isActive: { type: "boolean", required: false, defaultValue: true, input: false },
      preferredLocale: { type: "string", required: false, defaultValue: "es", input: false },
    },
  },

  rateLimit: {
    // También en desarrollo, para probar el comportamiento real.
    enabled: true,
    storage: "database",
    window: 60,
    max: 100,
    customRules: {
      "/sign-in/email": {
        window: LOGIN_RATE_LIMIT.passwordWindowSeconds,
        max: LOGIN_RATE_LIMIT.passwordAttempts,
      },
      "/two-factor/verify-totp": {
        window: LOGIN_RATE_LIMIT.twoFactorWindowSeconds,
        max: LOGIN_RATE_LIMIT.twoFactorAttempts,
      },
      "/two-factor/verify-backup-code": {
        window: LOGIN_RATE_LIMIT.twoFactorWindowSeconds,
        max: LOGIN_RATE_LIMIT.twoFactorAttempts,
      },
    },
  },

  // 2FA es obligatoria: nadie puede desactivarla por su cuenta.
  disabledPaths: ["/two-factor/disable", "/sign-up/email", "/delete-user", "/change-email"],

  advanced: {
    // En producción (HTTPS) las cookies siempre llevan Secure.
    useSecureCookies: env.NODE_ENV === "production",
    defaultCookieAttributes: { httpOnly: true, sameSite: "lax" },
  },

  databaseHooks: {
    session: {
      create: {
        // Un usuario desactivado no puede iniciar sesión.
        before: async (session, ctx) => {
          const user = await prisma.user.findUnique({
            where: { id: session.userId },
            select: { isActive: true },
          });
          if (!user?.isActive) {
            await recordAudit({
              action: "LOGIN_BLOCKED_INACTIVE",
              outcome: "DENIED",
              actorId: session.userId,
              headers: ctx?.headers,
            });
            return false;
          }
        },
        after: async (session, ctx) => {
          await prisma.user.update({
            where: { id: session.userId },
            data: { lastLoginAt: new Date() },
          });
          await recordAudit({
            action: "LOGIN_SUCCESS",
            outcome: "SUCCESS",
            actorId: session.userId,
            targetType: "session",
            targetId: session.id,
            headers: ctx?.headers,
          });
        },
      },
    },
  },

  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path === "/sign-out") {
        // Se registra antes porque después la sesión ya no existe.
        const session = await auth.api.getSession({ headers: ctx.headers ?? new Headers() });
        if (session) {
          await recordAudit({
            action: "LOGOUT",
            outcome: "SUCCESS",
            actorId: session.user.id,
            headers: ctx.headers,
          });
        }
      }
    }),
    after: createAuthMiddleware(async (ctx) => {
      const returned = ctx.context.returned;
      const failed = isAPIError(returned);

      if (ctx.path === "/sign-in/email") {
        const actorId = await userIdByEmail(ctx.body?.email);
        if (failed) {
          await recordAudit({
            action: "LOGIN_FAILED",
            outcome: "FAILURE",
            actorId,
            headers: ctx.headers,
            metadata: { status: returned.statusCode, knownAccount: actorId !== null },
          });
        } else if (returned && typeof returned === "object" && "twoFactorRedirect" in returned) {
          await recordAudit({
            action: "LOGIN_2FA_REQUIRED",
            outcome: "SUCCESS",
            actorId,
            headers: ctx.headers,
          });
        }
        return;
      }

      if (
        failed &&
        (ctx.path === "/two-factor/verify-totp" || ctx.path === "/two-factor/verify-backup-code")
      ) {
        await recordAudit({
          action: "TWO_FACTOR_FAILED",
          outcome: "FAILURE",
          actorId: ctx.context.session?.user.id ?? null,
          headers: ctx.headers,
          metadata: { method: ctx.path.endsWith("totp") ? "totp" : "backup_code" },
        });
        return;
      }

      if (ctx.path === "/change-password") {
        await recordAudit({
          action: failed ? "PASSWORD_CHANGE_FAILED" : "PASSWORD_CHANGED",
          outcome: failed ? "FAILURE" : "SUCCESS",
          actorId: ctx.context.session?.user.id ?? null,
          headers: ctx.headers,
        });
        return;
      }

      // Configuración inicial: el usuario ya tiene sesión y confirma su primer código.
      // (Durante el login todavía no hay sesión, así que no entra aquí.)
      if (!failed && ctx.path === "/two-factor/verify-totp" && ctx.context.session) {
        await recordAudit({
          action: "TWO_FACTOR_ENABLED",
          outcome: "SUCCESS",
          actorId: ctx.context.session.user.id,
          headers: ctx.headers,
        });
        return;
      }

      if (!failed && ctx.path === "/two-factor/enable") {
        await recordAudit({
          action: "TWO_FACTOR_SETUP_STARTED",
          outcome: "SUCCESS",
          actorId: ctx.context.session?.user.id ?? null,
          headers: ctx.headers,
        });
      }
    }),
  },

  plugins: [
    twoFactor({
      issuer: "CRM Alejandro Alcazar",
      trustDeviceMaxAge: SESSION_POLICY.trustedDeviceDays * 24 * 60 * 60,
      accountLockout: {
        enabled: true,
        maxFailedAttempts: LOGIN_RATE_LIMIT.twoFactorLockoutAttempts,
        durationSeconds: LOGIN_RATE_LIMIT.twoFactorLockoutSeconds,
      },
      backupCodeOptions: { amount: 10, length: 10 },
    }),
    // Debe ir al final: permite que las Server Actions establezcan cookies de sesión.
    nextCookies(),
  ],
});

export type AuthSession = typeof auth.$Infer.Session;
