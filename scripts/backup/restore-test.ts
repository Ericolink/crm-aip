/**
 * npm run db:restore-test [archivo]
 *
 * Prueba de restauración: descifra el respaldo (el más reciente si no se indica), lo
 * restaura en una base TEMPORAL (crm_restore_test) del mismo contenedor y compara el número
 * de filas de las tablas principales con la base de origen. Después borra la base temporal.
 * Nunca toca la base de desarrollo. Un respaldo que no se ha restaurado no es un respaldo.
 *
 * Nota: si la base de origen cambió después del respaldo, los conteos pueden diferir; para
 * una comprobación exacta, ejecútalo justo después de npm run db:backup.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { decryptBackup, parseBackupKey } from "./crypto";
import { CHECK_TABLES, dockerExec, latestBackup, loadEnv, psql } from "./shared";

const TEMP_DB = "crm_restore_test";
const { user, db } = loadEnv();
const key = parseBackupKey(process.env.BACKUP_ENCRYPTION_KEY);
const file = process.argv[2] ? path.resolve(process.argv[2]) : latestBackup();
console.log(`Respaldo: ${path.relative(process.cwd(), file)}`);

const dump = decryptBackup(readFileSync(file), key);
console.log("1. Descifrado e integridad (GCM): OK");

const drop = () => psql(user, "postgres", `DROP DATABASE IF EXISTS ${TEMP_DB} WITH (FORCE)`);
let failed = false;
try {
  drop();
  psql(user, "postgres", `CREATE DATABASE ${TEMP_DB}`);
  dockerExec(["pg_restore", "-U", user, "-d", TEMP_DB, "--no-owner", "--no-privileges"], dump);
  dump.fill(0);
  console.log("2. Restauración en base temporal: OK");

  const count = (database: string, table: string) =>
    Number(psql(user, database, `SELECT count(*) FROM "${table}"`));
  console.log("3. Comparación de filas (origen → restaurado):");
  for (const table of CHECK_TABLES) {
    const source = count(db, table);
    const restored = count(TEMP_DB, table);
    const ok = source === restored;
    if (!ok) failed = true;
    console.log(`   ${ok ? "OK  " : "DIF "} ${table.padEnd(20)} ${source} → ${restored}`);
  }
  const migrations = psql(user, TEMP_DB, `SELECT count(*) FROM _prisma_migrations`);
  console.log(`   migraciones restauradas: ${migrations}`);
} finally {
  drop();
  console.log("4. Base temporal eliminada.");
}

if (failed) {
  console.log(
    "\nHay diferencias. Si la base cambió después del respaldo es normal; si no, revisa.",
  );
  process.exitCode = 1;
} else {
  console.log("\nPrueba de restauración: CORRECTA");
}
