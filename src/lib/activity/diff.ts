/**
 * Calcula qué cambió entre dos versiones de un registro, para el historial de actividad.
 * Sin dependencias de servidor (se usa en el seed y en pruebas).
 *
 * - Solo se comparan los campos listados en `fields` (lista cerrada).
 * - Los campos de `sensitive` nunca guardan valores: solo { changed: true }.
 * - Fechas DATE se guardan como "YYYY-MM-DD"; fechas con hora como ISO.
 */

export type FieldChange = { from: ChangeValue; to: ChangeValue } | { changed: true };
export type ChangeValue = string | number | boolean | null;
export type ChangeSet = Record<string, FieldChange>;

type DiffOptions<K extends string> = {
  fields: readonly K[];
  sensitive?: readonly K[];
  /** Campos de tipo DATE (sin hora). */
  dateOnly?: readonly K[];
};

function toValue(value: unknown, dateOnly: boolean): ChangeValue {
  if (value === undefined || value === null || value === "") return null;
  if (value instanceof Date) {
    return dateOnly ? value.toISOString().slice(0, 10) : value.toISOString();
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  return JSON.stringify(value);
}

/**
 * Devuelve los cambios, o null si no cambió nada.
 * `before = null` representa una creación (todos los campos con valor aparecen como nuevos).
 */
export function diffChanges<K extends string>(
  before: Partial<Record<K, unknown>> | null,
  after: Partial<Record<K, unknown>>,
  options: DiffOptions<K>,
): ChangeSet | null {
  const sensitive = new Set<string>(options.sensitive ?? []);
  const dateOnly = new Set<string>(options.dateOnly ?? []);
  const changes: ChangeSet = {};

  for (const field of options.fields) {
    if (before !== null && !(field in after)) continue; // en una actualización, campo no enviado
    const from = toValue(before?.[field], dateOnly.has(field));
    const to = toValue(after[field], dateOnly.has(field));
    if (from === to) continue;
    changes[field] = sensitive.has(field) ? { changed: true } : { from, to };
  }

  return Object.keys(changes).length ? changes : null;
}
