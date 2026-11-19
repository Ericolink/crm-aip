/**
 * npm run db:backup
 *
 * Respaldo cifrado de la base LOCAL: pg_dump (formato personalizado) dentro del contenedor,
 * cifrado AES-256-GCM en memoria y guardado en ./backups (fuera de git). El volcado sin
 * cifrar nunca se escribe en disco.
 *
 * La llave (BACKUP_ENCRYPTION_KEY) debe guardarse APARTE de los respaldos: un respaldo
 * junto a su llave no está protegido.
 */
import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { encryptBackup, parseBackupKey } from "./crypto";
import { BACKUP_DIR, dockerExec, loadEnv } from "./shared";

const { user, db } = loadEnv();
const key = parseBackupKey(process.env.BACKUP_ENCRYPTION_KEY);

const dump = dockerExec(["pg_dump", "-U", user, "-d", db, "-Fc", "--no-owner", "--no-privileges"]);
const encrypted = encryptBackup(dump, key);
dump.fill(0);

mkdirSync(BACKUP_DIR, { recursive: true });
const stamp = new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
const file = path.join(BACKUP_DIR, `crm-${stamp}.dump.enc`);
writeFileSync(file, encrypted, { mode: 0o600 });
try {
  chmodSync(file, 0o600);
} catch {
  // En Windows los permisos POSIX no aplican; la carpeta está fuera de git.
}
console.log(
  `Respaldo cifrado: ${path.relative(process.cwd(), file)} (${(encrypted.length / 1024).toFixed(0)} KB)`,
);
console.log("Comprueba que se puede restaurar con: npm run db:restore-test");
