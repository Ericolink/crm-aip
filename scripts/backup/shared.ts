import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

/** Utilidades comunes de los scripts de respaldo (solo base LOCAL en Docker). */

// Errores con un mensaje claro y sin pila (los mensajes nunca incluyen datos ni llaves).
process.on("uncaughtException", (error) => {
  console.error(`Error: ${error instanceof Error ? error.message : "desconocido"}`);
  process.exit(1);
});

export const BACKUP_DIR = path.resolve("backups");
export const CONTAINER = "crm-seguros-db";

export function loadEnv() {
  if (existsSync(".env")) process.loadEnvFile(".env");
  const user = process.env.POSTGRES_USER;
  const db = process.env.POSTGRES_DB;
  if (!user || !db) throw new Error("Faltan POSTGRES_USER o POSTGRES_DB en .env.");
  return { user, db };
}

/** Ejecuta un comando dentro del contenedor de PostgreSQL. Nunca imprime datos. */
export function dockerExec(args: string[], input?: Buffer): Buffer {
  const result = spawnSync("docker", ["exec", "-i", CONTAINER, ...args], {
    input,
    maxBuffer: 1024 * 1024 * 1024,
  });
  if (result.error) throw new Error(`No se pudo ejecutar docker: ${result.error.message}`);
  if (result.status !== 0) {
    // Solo la primera línea del error: los mensajes de pg_dump/pg_restore no contienen filas.
    const first = result.stderr.toString("utf8").split("\n")[0]?.slice(0, 200);
    throw new Error(`Falló "${args[0]}" (código ${result.status}): ${first}`);
  }
  return result.stdout;
}

export function psql(user: string, db: string, sql: string): string {
  return dockerExec(["psql", "-U", user, "-d", db, "-At", "-v", "ON_ERROR_STOP=1", "-c", sql])
    .toString("utf8")
    .trim();
}

export function latestBackup(): string {
  const files = existsSync(BACKUP_DIR)
    ? readdirSync(BACKUP_DIR)
        .filter((f) => f.endsWith(".dump.enc"))
        .sort()
    : [];
  const last = files.at(-1);
  if (!last) throw new Error("No hay respaldos en ./backups. Ejecuta primero npm run db:backup.");
  return path.join(BACKUP_DIR, last);
}

/** Tablas cuyo número de filas se compara al restaurar. */
export const CHECK_TABLES = [
  "users",
  "clients",
  "client_insurances",
  "client_conditions",
  "client_doctors",
  "client_medications",
  "notes",
  "reminders",
  "activity_logs",
  "audit_logs",
];
