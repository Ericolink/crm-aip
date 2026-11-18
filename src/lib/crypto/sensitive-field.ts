import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";

/**
 * Protección de identificadores sensibles (número de Medicare, Medicaid, miembro, confirmación).
 *
 * Por cada valor se guardan tres columnas, nunca el texto plano:
 *   enc   → AES-256-GCM. El nombre del campo va como "datos asociados" (AAD): un valor cifrado
 *           de una columna no se puede copiar a otra y descifrarse ahí.
 *   idx   → índice ciego HMAC-SHA256 (llave distinta) para buscar por coincidencia EXACTA
 *           sin descifrar. Incluye el nombre del campo, así el mismo número en dos campos
 *           distintos produce índices distintos.
 *   last4 → últimos 4 caracteres, para mostrar "•••• 1234".
 *
 * Formato de `enc`: "v1.<iv>.<tag>.<cifrado>" (base64url). La versión permite rotar la llave.
 *
 * Este módulo no depende del servidor de Next para poder usarse en el seed y en pruebas.
 * En la aplicación se usa a través de `getFieldProtector()` (src/lib/crypto/index.ts).
 */

export const SENSITIVE_FIELDS = {
  BENEFICIARY_NUMBER: "enrollment.beneficiary_number",
  MEMBER_NUMBER: "insurance.member_number",
  CONFIRMATION_NUMBER: "insurance.confirmation_number",
} as const;

export type SensitiveField = (typeof SENSITIVE_FIELDS)[keyof typeof SENSITIVE_FIELDS];

export type ProtectedValue = { enc: string; idx: string; last4: string };

const KEY_VERSION = "v1";
const IV_BYTES = 12;
const MAX_LENGTH = 40;

/** Error sin datos: nunca incluye el valor ni el texto cifrado en el mensaje. */
export class SensitiveFieldError extends Error {
  constructor(public readonly reason: "invalid_value" | "decrypt_failed" | "invalid_key") {
    super(`SensitiveFieldError: ${reason}`);
  }
}

/** Mayúsculas, sin espacios, guiones ni puntos. "1eg4-te5-mk73" → "1EG4TE5MK73". */
export function normalizeIdentifier(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .replace(/[\s\-.]/g, "");
}

export function maskLast4(last4: string | null | undefined): string {
  return last4 ? `•••• ${last4}` : "—";
}

function aad(field: SensitiveField): Buffer {
  return Buffer.from(`crm:${field}:${KEY_VERSION}`, "utf8");
}

export function decodeKey(base64: string): Buffer {
  const key = Buffer.from(base64, "base64");
  if (key.length !== 32) throw new SensitiveFieldError("invalid_key");
  return key;
}

export type FieldProtector = ReturnType<typeof createFieldProtector>;

export function createFieldProtector(keys: { encryptionKey: Buffer; blindIndexKey: Buffer }) {
  const { encryptionKey, blindIndexKey } = keys;
  if (encryptionKey.length !== 32 || blindIndexKey.length !== 32) {
    throw new SensitiveFieldError("invalid_key");
  }
  if (encryptionKey.equals(blindIndexKey)) throw new SensitiveFieldError("invalid_key");

  function validated(value: string): string {
    const normalized = normalizeIdentifier(value);
    if (!normalized || normalized.length > MAX_LENGTH || !/^[A-Z0-9]+$/.test(normalized)) {
      throw new SensitiveFieldError("invalid_value");
    }
    return normalized;
  }

  function encrypt(field: SensitiveField, value: string): string {
    const plaintext = validated(value);
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv("aes-256-gcm", encryptionKey, iv);
    cipher.setAAD(aad(field));
    const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [KEY_VERSION, iv, tag, ciphertext]
      .map((part) => (typeof part === "string" ? part : part.toString("base64url")))
      .join(".");
  }

  function decrypt(field: SensitiveField, payload: string): string {
    try {
      const [version, iv, tag, ciphertext] = payload.split(".");
      if (version !== KEY_VERSION || !iv || !tag || !ciphertext) throw new Error();
      const decipher = createDecipheriv("aes-256-gcm", encryptionKey, Buffer.from(iv, "base64url"));
      decipher.setAAD(aad(field));
      decipher.setAuthTag(Buffer.from(tag, "base64url"));
      return Buffer.concat([
        decipher.update(Buffer.from(ciphertext, "base64url")),
        decipher.final(),
      ]).toString("utf8");
    } catch {
      throw new SensitiveFieldError("decrypt_failed");
    }
  }

  function blindIndex(field: SensitiveField, value: string): string {
    return createHmac("sha256", blindIndexKey)
      .update(`${field}\u0000${validated(value)}`)
      .digest("base64url");
  }

  /** Valor vacío → null (limpiar el campo). Si no, las tres columnas listas para guardar. */
  function protect(field: SensitiveField, value: string | null | undefined): ProtectedValue | null {
    if (value == null || normalizeIdentifier(value) === "") return null;
    const normalized = validated(value);
    return {
      enc: encrypt(field, normalized),
      idx: blindIndex(field, normalized),
      last4: normalized.slice(-4),
    };
  }

  return { encrypt, decrypt, blindIndex, protect };
}
