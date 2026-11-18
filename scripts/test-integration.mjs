/**
 * Ejecuta las pruebas de integración contra una base de datos de PRUEBAS desechable.
 *
 * 1. Toma la conexión de .env y cambia el nombre de la base a "crm_test".
 * 2. Solo continúa si el servidor es local (localhost / 127.0.0.1).
 * 3. Borra y crea crm_test, aplica migraciones y el seed (roles, permisos, catálogos).
 * 4. Corre Vitest con tests/integration.
 *
 * Nunca toca la base de desarrollo ni datos reales.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const pg = require("pg");

if (existsSync(".env")) process.loadEnvFile(".env");

const devUrl = new URL(process.env.DATABASE_URL ?? "");
if (!["localhost", "127.0.0.1"].includes(devUrl.hostname)) {
  console.error("Las pruebas de integración solo se ejecutan contra una base local.");
  process.exit(1);
}

const TEST_DB = "crm_test";
const testUrl = new URL(devUrl);
testUrl.pathname = `/${TEST_DB}`;
const adminUrl = new URL(devUrl);
adminUrl.pathname = "/postgres";

const admin = new pg.Client({ connectionString: adminUrl.toString() });
await admin.connect();
await admin.query(`DROP DATABASE IF EXISTS ${TEST_DB} WITH (FORCE)`);
await admin.query(`CREATE DATABASE ${TEST_DB}`);
await admin.end();

const env = {
  ...process.env,
  DATABASE_URL: testUrl.toString(),
  NODE_ENV: "test",
  SEED_ADMIN_NAME: "Admin Pruebas",
  SEED_ADMIN_EMAIL: "admin-pruebas@ejemplo.local",
  SEED_ADMIN_PASSWORD: "contrasena-de-pruebas-123",
};

// Se ejecutan los CLI con Node directamente (sin shell): los argumentos no se interpretan.
const PRISMA = "node_modules/prisma/build/index.js";
const VITEST = "node_modules/vitest/vitest.mjs";
const run = (script, args) => {
  const result = spawnSync(process.execPath, [script, ...args], { env, stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
};

run(PRISMA, ["migrate", "deploy"]);
run(PRISMA, ["db", "seed"]);
run(VITEST, ["run", "--config", "vitest.integration.mts", ...process.argv.slice(2)]);
