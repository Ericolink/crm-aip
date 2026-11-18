import { PERMISSIONS, type PermissionKey } from "@/lib/permissions/catalog";

/**
 * Reglas de acceso a clientes. Funciones puras (sin base de datos) para poder probarlas.
 * Los servicios las aplican en CADA consulta y modificación.
 */

type UserLike = { id: string; permissions: ReadonlySet<PermissionKey> };

/**
 * Filtro de visibilidad para Prisma: sin "ver todos", solo los clientes asignados al usuario.
 * Los eliminados (borrado lógico) nunca se muestran.
 */
export function clientVisibilityWhere(user: UserLike) {
  return {
    deletedAt: null,
    ...(user.permissions.has(PERMISSIONS.CLIENT_READ_ALL) ? {} : { assignedAgentId: user.id }),
  };
}

/** Campos básicos: contacto y dirección. Los puede editar quien tenga "update_basic". */
export const BASIC_CLIENT_FIELDS = [
  "primaryPhone",
  "email",
  "altPhone",
  "altContactName",
  "altContactRelationship",
  "altContactRelationshipOther",
  "preferredLanguage",
  "homeStreet",
  "homeUnit",
  "homeCity",
  "homeState",
  "homeZip",
  "mailingSameAsHome",
  "mailingStreet",
  "mailingUnit",
  "mailingCity",
  "mailingState",
  "mailingZip",
] as const;

/** Campos completos (incluye los básicos): requieren "client.update". */
export const FULL_CLIENT_FIELDS = [
  "firstName",
  "lastName",
  "dateOfBirth",
  "status",
  ...BASIC_CLIENT_FIELDS,
] as const;

export type ClientField = (typeof FULL_CLIENT_FIELDS)[number];

export type ClientEditScope = "full" | "basic" | "none";

export function clientEditScope(user: UserLike): ClientEditScope {
  if (user.permissions.has(PERMISSIONS.CLIENT_UPDATE)) return "full";
  if (user.permissions.has(PERMISSIONS.CLIENT_UPDATE_BASIC)) return "basic";
  return "none";
}

export function editableClientFields(scope: ClientEditScope): readonly ClientField[] {
  if (scope === "full") return FULL_CLIENT_FIELDS;
  if (scope === "basic") return BASIC_CLIENT_FIELDS;
  return [];
}

/** Programas, números de beneficiario y condiciones crónicas: solo con edición completa. */
export function canEditMedicalAndPrograms(scope: ClientEditScope): boolean {
  return scope === "full";
}
