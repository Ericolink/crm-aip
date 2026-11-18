/**
 * Formato de datos para mostrar. Sin dependencias de servidor.
 *
 * Fechas "solo día" (nacimiento, fechas de cobertura) se guardan como DATE en UTC a medianoche.
 * Se formatean SIEMPRE con timeZone "UTC"; si no, en Florida (UTC-5) el 1 de enero
 * se mostraría como 31 de diciembre.
 */

/** "3055550142" → "(305) 555-0142". Si no son 10 dígitos, se devuelve tal cual. */
export function formatPhone(digits: string | null | undefined): string {
  if (!digits) return "";
  const d = digits.replace(/\D/g, "");
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : digits;
}

/** Solo dígitos. "(305) 555-0142" → "3055550142". */
export function phoneDigits(value: string): string {
  return value.replace(/\D/g, "");
}

export function formatDateOnly(
  date: Date | null | undefined,
  locale: string,
  style: "short" | "long" = "short",
): string {
  if (!date) return "";
  return new Intl.DateTimeFormat(locale === "en" ? "en-US" : "es-US", {
    timeZone: "UTC",
    ...(style === "short"
      ? { year: "numeric", month: "2-digit", day: "2-digit" }
      : { year: "numeric", month: "long", day: "numeric" }),
  }).format(date);
}

/** Date (UTC medianoche) → "YYYY-MM-DD" para <input type="date">. */
export function toDateInputValue(date: Date | null | undefined): string {
  return date ? date.toISOString().slice(0, 10) : "";
}

/** "YYYY-MM-DD" → Date UTC medianoche. Devuelve null si el texto no es una fecha real. */
export function parseDateOnly(value: string | null | undefined): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d
    ? date
    : null;
}

/** Edad cumplida a la fecha `today` (por defecto hoy). */
export function ageFrom(dob: Date | null | undefined, today = new Date()): number | null {
  if (!dob) return null;
  let age = today.getUTCFullYear() - dob.getUTCFullYear();
  const beforeBirthday =
    today.getUTCMonth() < dob.getUTCMonth() ||
    (today.getUTCMonth() === dob.getUTCMonth() && today.getUTCDate() < dob.getUTCDate());
  if (beforeBirthday) age--;
  return age;
}

export function initials(firstName: string, lastName: string): string {
  return `${firstName.trim()[0] ?? ""}${lastName.trim()[0] ?? ""}`.toUpperCase();
}
