import en from "@/messages/en.json";
import es from "@/messages/es.json";
import { phoneDigits } from "@/lib/format";
import {
  CLIENT_STATUSES,
  PREFERRED_LANGUAGES,
  RELATIONSHIPS,
  type ClientFormInput,
} from "@/modules/clients/schema";

/**
 * Formato de archivo de importación/exportación de clientes.
 * Sin dependencias de servidor: se usa en el servicio, en la interfaz y en las pruebas.
 *
 * Los encabezados se aceptan en español o inglés (sin importar mayúsculas, acentos ni
 * espacios). Los valores de estatus, idioma y relación se aceptan como código
 * (ACTIVE) o como etiqueta en cualquiera de los dos idiomas (Activo / Active).
 */

export const IMPORT_COLUMNS = [
  { key: "firstName", es: "Nombre", en: "First name", required: true },
  { key: "lastName", es: "Apellido", en: "Last name", required: true },
  { key: "dateOfBirth", es: "Fecha de nacimiento", en: "Date of birth" },
  { key: "status", es: "Estatus", en: "Status" },
  { key: "preferredLanguage", es: "Idioma preferido", en: "Preferred language" },
  { key: "primaryPhone", es: "Teléfono principal", en: "Primary phone" },
  { key: "email", es: "Correo", en: "Email" },
  { key: "altPhone", es: "Teléfono alternativo", en: "Alternate phone" },
  { key: "altContactName", es: "Contacto alternativo", en: "Alternate contact" },
  { key: "altContactRelationship", es: "Relación", en: "Relationship" },
  { key: "altContactRelationshipOther", es: "Relación (otra)", en: "Relationship (other)" },
  { key: "homeStreet", es: "Calle", en: "Street" },
  { key: "homeUnit", es: "Apto", en: "Unit" },
  { key: "homeCity", es: "Ciudad", en: "City" },
  { key: "homeState", es: "Estado", en: "State" },
  { key: "homeZip", es: "Código postal", en: "ZIP" },
  { key: "mailingStreet", es: "Calle (postal)", en: "Mailing street" },
  { key: "mailingUnit", es: "Apto (postal)", en: "Mailing unit" },
  { key: "mailingCity", es: "Ciudad (postal)", en: "Mailing city" },
  { key: "mailingState", es: "Estado (postal)", en: "Mailing state" },
  { key: "mailingZip", es: "Código postal (postal)", en: "Mailing ZIP" },
  { key: "assignedAgentEmail", es: "Agente asignado (correo)", en: "Assigned agent (email)" },
] as const satisfies readonly {
  key: string;
  es: string;
  en: string;
  required?: boolean;
}[];

export type ImportColumnKey = (typeof IMPORT_COLUMNS)[number]["key"];
export type Locale = "es" | "en";

export const IMPORT_LIMITS = {
  maxBytes: 2 * 1024 * 1024,
  maxRows: 2000,
  maxColumns: 60,
  maxCellLength: 500,
} as const;

/** "Teléfono  Principal" → "telefonoprincipal". */
export function normalizeHeader(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

const HEADER_INDEX = new Map<string, ImportColumnKey>(
  IMPORT_COLUMNS.flatMap((c) => [
    [normalizeHeader(c.key), c.key],
    [normalizeHeader(c.es), c.key],
    [normalizeHeader(c.en), c.key],
  ]),
);

export function columnForHeader(header: string): ImportColumnKey | undefined {
  return HEADER_INDEX.get(normalizeHeader(header));
}

export function columnLabel(key: ImportColumnKey, locale: Locale): string {
  return IMPORT_COLUMNS.find((c) => c.key === key)![locale];
}

/** Código ↔ etiquetas en ambos idiomas (tomadas de los textos de la interfaz). */
function labelIndex<T extends string>(
  codes: readonly T[],
  es: Record<string, string>,
  en: Record<string, string>,
) {
  const map = new Map<string, T>();
  for (const code of codes) {
    for (const v of [code, es[code], en[code]]) if (v) map.set(normalizeHeader(v), code);
  }
  return map;
}
const STATUS_INDEX = labelIndex(CLIENT_STATUSES, es.Clients.status, en.Clients.status);
const LANGUAGE_INDEX = labelIndex(PREFERRED_LANGUAGES, es.Clients.language, en.Clients.language);
// Formas cortas habituales: "Español", "Spanish", "Inglés", "English".
for (const [v, code] of [
  ["espanol", "ES"],
  ["spanish", "ES"],
  ["ingles", "EN"],
  ["english", "EN"],
  ["otro", "OTHER"],
  ["other", "OTHER"],
] as const)
  LANGUAGE_INDEX.set(v, code);
const RELATIONSHIP_INDEX = labelIndex(
  RELATIONSHIPS,
  es.Clients.relationship,
  en.Clients.relationship,
);

export type CellInput = string | number | boolean | Date | null | undefined;

/** Celda → texto. Las fechas de Excel llegan como Date (en UTC). */
export function cellText(value: CellInput): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date)
    return Number.isNaN(value.getTime()) ? "" : value.toISOString().slice(0, 10);
  return String(value).trim();
}

/** Acepta AAAA-MM-DD y MM/DD/AAAA (formato de EE. UU.). Devuelve AAAA-MM-DD o el texto original. */
export function normalizeDate(value: string): string {
  const us = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(value);
  if (us) return `${us[3]}-${us[1].padStart(2, "0")}-${us[2].padStart(2, "0")}`;
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(value);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  return value;
}

/** Quita el "1" inicial de EE. UU.: "+1 (305) 555-0101" → "3055550101". */
export function normalizePhone(value: string): string {
  const d = phoneDigits(value);
  return d.length === 11 && d.startsWith("1") ? d.slice(1) : value;
}

export type RowIssue = { column: ImportColumnKey | null; code: string };

/**
 * Fila (encabezado → valor) → datos del formulario de cliente.
 * Los valores no reconocidos de listas se reportan aquí; el resto lo valida clientFormSchema.
 */
export function rowToClientInput(row: Partial<Record<ImportColumnKey, CellInput>>): {
  input: ClientFormInput;
  assignedAgentEmail?: string;
  issues: RowIssue[];
} {
  const issues: RowIssue[] = [];
  const text = (k: ImportColumnKey) => {
    const v = cellText(row[k]);
    if (v.length > IMPORT_LIMITS.maxCellLength) {
      issues.push({ column: k, code: "tooLong" });
      return "";
    }
    return v;
  };
  const fromList = <T extends string>(k: ImportColumnKey, index: Map<string, T>, fallback?: T) => {
    const v = text(k);
    if (!v) return fallback;
    const code = index.get(normalizeHeader(v));
    if (!code) issues.push({ column: k, code: "invalidOption" });
    return code ?? fallback;
  };
  // Los ZIP numéricos de Excel pierden el cero inicial (02134 → 2134).
  const zip = (k: ImportColumnKey) => {
    const v = text(k);
    return typeof row[k] === "number" && /^\d{3,4}$/.test(v) ? v.padStart(5, "0") : v;
  };
  const mailing = {
    mailingStreet: text("mailingStreet"),
    mailingUnit: text("mailingUnit"),
    mailingCity: text("mailingCity"),
    mailingState: text("mailingState"),
    mailingZip: zip("mailingZip"),
  };
  const dob = text("dateOfBirth");

  const input: ClientFormInput = {
    firstName: text("firstName"),
    lastName: text("lastName"),
    dateOfBirth: dob ? normalizeDate(dob) : "",
    status: fromList("status", STATUS_INDEX, "NEW")!,
    preferredLanguage: fromList("preferredLanguage", LANGUAGE_INDEX, "ES")!,
    primaryPhone: normalizePhone(text("primaryPhone")),
    email: text("email"),
    altPhone: normalizePhone(text("altPhone")),
    altContactName: text("altContactName"),
    altContactRelationship: fromList("altContactRelationship", RELATIONSHIP_INDEX) ?? "",
    altContactRelationshipOther: text("altContactRelationshipOther"),
    homeStreet: text("homeStreet"),
    homeUnit: text("homeUnit"),
    homeCity: text("homeCity"),
    homeState: text("homeState"),
    homeZip: zip("homeZip"),
    // Sin datos postales → la dirección postal es la misma del domicilio.
    mailingSameAsHome: Object.values(mailing).every((v) => !v),
    ...mailing,
    programs: {
      MEDICARE: {
        enabled: false,
        beneficiaryNumber: "",
        partAEffectiveDate: "",
        partBEffectiveDate: "",
      },
      MEDICAID: { enabled: false, beneficiaryNumber: "" },
      ACA: { enabled: false },
    },
    conditionIds: [],
    customConditions: [],
    assignedAgentId: "",
  };
  const agentEmail = text("assignedAgentEmail").toLowerCase();
  return { input, assignedAgentEmail: agentEmail || undefined, issues };
}

/**
 * Evita la "inyección de fórmulas" (CSV injection): un texto que empieza con = + - @
 * o tabulador se abre en Excel como fórmula. Se antepone un apóstrofo.
 */
export function neutralizeFormula(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}
