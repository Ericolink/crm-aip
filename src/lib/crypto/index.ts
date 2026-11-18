import "server-only";
import { serverEnv } from "@/lib/env";
import { createFieldProtector, decodeKey, type FieldProtector } from "./sensitive-field";

export * from "./sensitive-field";

let protector: FieldProtector | undefined;

/** Protector de campos sensibles con las llaves del entorno (se crea una sola vez). */
export function getFieldProtector(): FieldProtector {
  if (!protector) {
    const env = serverEnv();
    protector = createFieldProtector({
      encryptionKey: decodeKey(env.FIELD_ENCRYPTION_KEY),
      blindIndexKey: decodeKey(env.BLIND_INDEX_KEY),
    });
  }
  return protector;
}
