/**
 * Catálogo de permisos y roles iniciales.
 *
 * - Las CLAVES de permiso viven en el código porque el código las verifica.
 * - La ASIGNACIÓN de permisos a roles vive en la base de datos (tablas roles,
 *   permissions, role_permissions). Este archivo solo define los valores iniciales
 *   que crea el seed; después se podrán cambiar desde Configuración sin tocar código.
 *
 * Este módulo no tiene dependencias de servidor para poder usarse en el seed y en pruebas.
 */

export const PERMISSIONS = {
  // Clientes
  CLIENT_READ: "client.read", // ver clientes asignados al usuario
  CLIENT_READ_ALL: "client.read_all", // ver TODOS los clientes (no solo los asignados)
  CLIENT_CREATE: "client.create",
  CLIENT_UPDATE: "client.update", // editar toda la información del cliente
  CLIENT_UPDATE_BASIC: "client.update_basic", // editar solo datos de contacto/básicos
  CLIENT_DELETE: "client.delete",
  CLIENT_ASSIGN: "client.assign", // asignar clientes a agentes
  SENSITIVE_REVEAL: "client.sensitive.reveal", // revelar Medicare/Medicaid/miembro completos
  // Información médica y de cobertura
  MEDICAL_READ: "medical.read", // médicos y medicamentos
  MEDICAL_WRITE: "medical.write",
  INSURANCE_READ: "insurance.read",
  INSURANCE_WRITE: "insurance.write",
  // Seguimiento
  NOTE_CREATE: "note.create",
  NOTE_UPDATE_OWN: "note.update_own",
  NOTE_UPDATE_ANY: "note.update_any",
  REMINDER_MANAGE: "reminder.manage",
  // Datos
  DATA_IMPORT: "data.import",
  DATA_EXPORT: "data.export",
  DATA_EXPORT_SENSITIVE: "data.export_sensitive", // incluir identificadores completos al exportar (solo administrador)
  // Administración
  SETTINGS_MANAGE: "settings.manage", // aseguradoras, programas, catálogos
  USER_MANAGE: "user.manage",
  AUDIT_READ: "audit.read",
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ALL_PERMISSIONS: readonly PermissionKey[] = Object.values(PERMISSIONS);

export const ROLE_KEYS = { ADMIN: "ADMIN", AGENT: "AGENT", ASSISTANT: "ASSISTANT" } as const;
export type RoleKey = (typeof ROLE_KEYS)[keyof typeof ROLE_KEYS];

type RoleDefinition = {
  key: RoleKey;
  nameEs: string;
  nameEn: string;
  permissions: readonly PermissionKey[];
};

const P = PERMISSIONS;

export const DEFAULT_ROLES: readonly RoleDefinition[] = [
  {
    key: ROLE_KEYS.ADMIN,
    nameEs: "Administrador",
    nameEn: "Administrator",
    permissions: ALL_PERMISSIONS,
  },
  {
    key: ROLE_KEYS.AGENT,
    nameEs: "Agente",
    nameEn: "Agent",
    // Sus propios clientes: consultar, registrar, editar, notas, seguimientos,
    // médicos, medicamentos y aseguranzas. Sin exportar ni administrar.
    permissions: [
      P.CLIENT_READ,
      P.CLIENT_CREATE,
      P.CLIENT_UPDATE,
      P.CLIENT_UPDATE_BASIC,
      P.SENSITIVE_REVEAL,
      P.MEDICAL_READ,
      P.MEDICAL_WRITE,
      P.INSURANCE_READ,
      P.INSURANCE_WRITE,
      P.NOTE_CREATE,
      P.NOTE_UPDATE_OWN,
      P.REMINDER_MANAGE,
    ],
  },
  {
    key: ROLE_KEYS.ASSISTANT,
    nameEs: "Asistente",
    nameEn: "Assistant",
    // Información permitida, notas, recordatorios y datos básicos.
    // Sin información médica, sin identificadores completos, sin eliminar.
    permissions: [
      P.CLIENT_READ,
      P.CLIENT_UPDATE_BASIC,
      P.NOTE_CREATE,
      P.NOTE_UPDATE_OWN,
      P.REMINDER_MANAGE,
    ],
  },
];

export function isPermissionKey(value: string): value is PermissionKey {
  return (ALL_PERMISSIONS as readonly string[]).includes(value);
}
