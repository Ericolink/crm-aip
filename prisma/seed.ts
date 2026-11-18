/**
 * Seed idempotente (se puede ejecutar varias veces sin duplicar datos).
 *
 * 1. Crea los permisos del catálogo que falten.
 * 2. Crea los roles iniciales que falten, con sus permisos por defecto.
 *    Si un rol ya existe NO se tocan sus permisos (pudieron cambiarse desde Configuración),
 *    excepto ADMIN, que siempre recibe todos los permisos.
 * 3. Crea los catálogos que falten (programas, aseguradoras, condiciones, consentimientos).
 *    Las relaciones aseguradora ↔ programa NO se crean: se configuran desde la interfaz.
 * 4. Si no existe ningún usuario, crea el administrador inicial con los datos de .env.
 *
 * Solo datos ficticios. Nunca usar con información real de clientes.
 */
import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { hashPassword } from "better-auth/crypto";
import { z } from "zod";
import { PrismaClient } from "../src/generated/prisma/client";
import { PASSWORD_POLICY } from "../src/lib/auth/policy";
import { ALL_PERMISSIONS, DEFAULT_ROLES, ROLE_KEYS } from "../src/lib/permissions/catalog";
import {
  CHRONIC_CONDITIONS,
  CONSENT_TYPES,
  COVERAGE_PROGRAMS,
  INSURANCE_CARRIERS,
} from "./data/catalogs";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("Falta DATABASE_URL en .env");

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });

async function seedPermissionsAndRoles() {
  for (const key of ALL_PERMISSIONS) {
    await prisma.permission.upsert({ where: { key }, update: {}, create: { key } });
  }
  const permissionIds = new Map(
    (await prisma.permission.findMany({ select: { id: true, key: true } })).map((p) => [
      p.key,
      p.id,
    ]),
  );

  for (const def of DEFAULT_ROLES) {
    const existing = await prisma.role.findUnique({ where: { key: def.key } });
    const role =
      existing ??
      (await prisma.role.create({
        data: { key: def.key, nameEs: def.nameEs, nameEn: def.nameEn, isSystem: true },
      }));

    const shouldAssign = !existing || def.key === ROLE_KEYS.ADMIN;
    if (shouldAssign) {
      await prisma.rolePermission.createMany({
        data: def.permissions.map((key) => ({
          roleId: role.id,
          permissionId: permissionIds.get(key)!,
        })),
        skipDuplicates: true,
      });
    }
    console.log(`  rol ${def.key}: ${existing ? "ya existía" : "creado"}`);
  }
}

const adminSchema = z.object({
  SEED_ADMIN_NAME: z.string().trim().min(2),
  SEED_ADMIN_EMAIL: z.string().trim().toLowerCase().email(),
  SEED_ADMIN_PASSWORD: z.string().min(PASSWORD_POLICY.minLength).max(PASSWORD_POLICY.maxLength),
});

async function seedInitialAdmin() {
  const userCount = await prisma.user.count();
  if (userCount > 0) {
    console.log("  administrador inicial: ya existen usuarios, no se crea ninguno");
    return;
  }

  const parsed = adminSchema.safeParse(process.env);
  if (!parsed.success) {
    const vars = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(
      `Revisa en .env: ${vars} (la contraseña necesita ${PASSWORD_POLICY.minLength}+ caracteres)`,
    );
  }
  const { SEED_ADMIN_NAME, SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD } = parsed.data;

  const adminRole = await prisma.role.findUniqueOrThrow({ where: { key: ROLE_KEYS.ADMIN } });
  const userId = randomUUID();

  await prisma.$transaction([
    prisma.user.create({
      data: {
        id: userId,
        name: SEED_ADMIN_NAME,
        email: SEED_ADMIN_EMAIL,
        emailVerified: true,
        roleId: adminRole.id,
      },
    }),
    // Misma estructura que usa Better Auth para cuentas de correo + contraseña.
    prisma.account.create({
      data: {
        id: randomUUID(),
        userId,
        accountId: userId,
        providerId: "credential",
        password: await hashPassword(SEED_ADMIN_PASSWORD),
      },
    }),
  ]);
  console.log(
    `  administrador inicial creado (${SEED_ADMIN_EMAIL}). Deberá configurar 2FA al entrar.`,
  );
}

async function seedCatalogs() {
  for (const p of COVERAGE_PROGRAMS) {
    await prisma.coverageProgram.upsert({ where: { code: p.code }, update: {}, create: p });
  }
  for (const name of INSURANCE_CARRIERS) {
    await prisma.insuranceCarrier.upsert({ where: { name }, update: {}, create: { name } });
  }
  for (const c of CHRONIC_CONDITIONS) {
    await prisma.chronicCondition.upsert({ where: { nameEn: c.nameEn }, update: {}, create: c });
  }
  for (const c of CONSENT_TYPES) {
    await prisma.consentType.upsert({ where: { code: c.code }, update: {}, create: c });
  }
  console.log(
    `  catálogos: ${COVERAGE_PROGRAMS.length} programas, ${INSURANCE_CARRIERS.length} aseguradoras (sin relaciones), ${CHRONIC_CONDITIONS.length} condiciones, ${CONSENT_TYPES.length} tipos de consentimiento`,
  );
}

async function main() {
  console.log("Seed:");
  await seedPermissionsAndRoles();
  await seedCatalogs();
  await seedInitialAdmin();
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Error en el seed");
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
