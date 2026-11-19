import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Formato de los respaldos cifrados (ADR 0018). Sin dependencias externas.
 *
 *   "CRMBK1" (6 bytes) | IV (12 bytes) | etiqueta GCM (16 bytes) | datos cifrados
 *
 * AES-256-GCM: confidencialidad + integridad. Si el archivo se altera o la llave no es la
 * correcta, descifrar FALLA (no devuelve datos corruptos).
 */
const MAGIC = Buffer.from("CRMBK1");
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

export function parseBackupKey(value: string | undefined): Buffer {
  const key = Buffer.from(value ?? "", "base64");
  if (key.length !== 32) {
    throw new Error(
      "BACKUP_ENCRYPTION_KEY debe ser una llave de 32 bytes en base64 (ver .env.example).",
    );
  }
  return key;
}

export function encryptBackup(plain: Buffer, key: Buffer): Buffer {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(MAGIC);
  const data = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([MAGIC, iv, cipher.getAuthTag(), data]);
}

export function decryptBackup(file: Buffer, key: Buffer): Buffer {
  if (file.length < MAGIC.length + IV_LENGTH + TAG_LENGTH || !file.subarray(0, 6).equals(MAGIC)) {
    throw new Error("El archivo no es un respaldo cifrado de este sistema.");
  }
  const iv = file.subarray(6, 6 + IV_LENGTH);
  const tag = file.subarray(6 + IV_LENGTH, 6 + IV_LENGTH + TAG_LENGTH);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAAD(MAGIC);
  decipher.setAuthTag(tag);
  try {
    return Buffer.concat([
      decipher.update(file.subarray(6 + IV_LENGTH + TAG_LENGTH)),
      decipher.final(),
    ]);
  } catch {
    throw new Error("No se pudo descifrar: la llave no es la correcta o el archivo fue alterado.");
  }
}
