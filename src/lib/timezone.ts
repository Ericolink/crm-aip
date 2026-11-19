/**
 * Conversión entre la hora "de pared" de Florida y UTC (con horario de verano).
 * El CRM opera en hora del Este: un recordatorio "a las 10:00" es a las 10:00 en Miami,
 * aunque el navegador esté en otra zona.
 *
 * Sin dependencias de servidor (se usa en formularios y en pruebas).
 */

export const BUSINESS_TIME_ZONE = "America/New_York";

/** Desfase (ms) de la zona respecto a UTC en un instante dado. Negativo en Florida. */
function zoneOffsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
  return asUtc - instant.getTime();
}

/**
 * "YYYY-MM-DDTHH:mm" (hora de pared en `timeZone`) → instante UTC.
 * Devuelve null si el texto no es válido.
 */
export function zonedLocalToUtc(local: string, timeZone = BUSINESS_TIME_ZONE): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local);
  if (!m) return null;
  const [, y, mo, d, h, mi] = m.map(Number);
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null;
  const naive = Date.UTC(y, mo - 1, d, h, mi);
  const check = new Date(naive);
  if (check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) return null;
  // Dos pasadas para resolver correctamente los días de cambio de horario.
  let utc = naive - zoneOffsetMs(new Date(naive), timeZone);
  utc = naive - zoneOffsetMs(new Date(utc), timeZone);
  return new Date(utc);
}

/** Instante UTC → "YYYY-MM-DDTHH:mm" en hora de pared de `timeZone` (para <input type="datetime-local">). */
export function utcToZonedLocal(instant: Date, timeZone = BUSINESS_TIME_ZONE): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(instant);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}
