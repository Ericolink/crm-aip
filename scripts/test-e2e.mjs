/**
 * Ejecuta las pruebas E2E (Playwright, Chromium) contra una base de datos DESECHABLE.
 *
 * 1. Toma la conexión de .env, cambia la base a "crm_e2e" y solo continúa si es local.
 * 2. Borra y crea crm_e2e, aplica migraciones, seed (con un administrador de prueba con
 *    contraseña aleatoria) y datos demo ficticios.
 * 3. Compila (next build) salvo que se pase --no-build.
 * 4. Corre Playwright (levanta `next start` apuntando a crm_e2e) y al final borra la base.
 *
 * Nunca toca la base de desarrollo ni datos reales. Argumentos extra se pasan a Playwright.
 */
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const pg = require("pg");

if (existsSync(".env")) process.loadEnvFile(".env");

const devUrl = new URL(process.env.DATABASE_URL ?? "");
if (!["localhost", "127.0.0.1"].includes(devUrl.hostname)) {
  console.error("Las pruebas E2E solo se ejecutan contra una base local.");
  process.exit(1);
}
const E2E_DB = "crm_e2e";
const e2eUrl = new URL(devUrl);
e2eUrl.pathname = `/${E2E_DB}`;
const adminUrl = new URL(devUrl);
adminUrl.pathname = "/postgres";

async function recreate(create) {
  const client = new pg.Client({ connectionString: adminUrl.toString() });
  await client.connect();
  await client.query(`DROP DATABASE IF EXISTS ${E2E_DB} WITH (FORCE)`);
  if (create) await client.query(`CREATE DATABASE ${E2E_DB}`);
  await client.end();
}

const env = {
  ...process.env,
  DATABASE_URL: e2eUrl.toString(),
  E2E_ADMIN_EMAIL: "e2e-admin@ejemplo.local",
  E2E_ADMIN_PASSWORD: randomBytes(15).toString("base64url"),
};
env.SEED_ADMIN_EMAIL = env.E2E_ADMIN_EMAIL;
env.SEED_ADMIN_NAME = "Admin E2E";
env.SEED_ADMIN_PASSWORD = env.E2E_ADMIN_PASSWORD;

/** Comandos fijos de este script (sin datos externos), como una sola línea para la shell. */
const run = (command, options = {}) => {
  const r = spawnSync(command, { stdio: "inherit", shell: true, env, ...options });
  if (r.status !== 0) throw new Error(`Falló: ${command}`);
  return r.status;
};

const args = process.argv.slice(2);
const skipBuild = args.includes("--no-build");
const extra = args.filter((a) => a !== "--no-build");

let status = 1;
try {
  await recreate(true);
  run("npx prisma migrate deploy", { stdio: "ignore" });
  run("npx prisma db seed", { stdio: "ignore" });
  run("npx tsx prisma/seed-demo.ts", { stdio: "ignore" });
  console.log(`Base ${E2E_DB} lista (datos ficticios).`);
  if (!skipBuild) run("npx next build");
  // Argumentos extra de Playwright (p. ej. -g "importar"), entre comillas para la shell.
  const quoted = extra.map((a) => `"${a.replace(/"/g, "")}"`).join(" ");
  status =
    spawnSync(`npx playwright test ${quoted}`, { stdio: "inherit", shell: true, env }).status ?? 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
} finally {
  await recreate(false);
  console.log(`Base ${E2E_DB} eliminada.`);
}
process.exit(status);
