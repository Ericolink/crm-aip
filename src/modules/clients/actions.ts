"use server";

import { refresh } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { z } from "zod";
import { CLIENT_STATUSES, clientFormSchema } from "./schema";
import {
  createClient,
  deleteClient,
  revealBeneficiaryNumber,
  ServiceError,
  updateClient,
  updateClientStatus,
} from "./service";

export type ActionError = "forbidden" | "notFound" | "conflict" | "invalid" | "generic";

export type ActionResult<T = undefined> =
  { ok: true; data: T } | { ok: false; error: ActionError; fieldErrors?: Record<string, string> };

function toActionError(error: unknown): ActionResult<never> {
  if (error instanceof ServiceError) {
    const map: Record<ServiceError["code"], ActionError> = {
      FORBIDDEN: "forbidden",
      NOT_FOUND: "notFound",
      CONFLICT: "conflict",
      INVALID: "invalid",
    };
    return {
      ok: false,
      error: map[error.code],
      ...(error.field ? { fieldErrors: { [error.field]: "invalidOption" } } : {}),
    };
  }
  // El servicio ya registró el error sin datos sensibles; aquí no se repite.
  return { ok: false, error: "generic" };
}

const idSchema = (value: unknown) => typeof value === "string" && /^[a-z0-9]{10,40}$/i.test(value);

/** Crea (clientId = null) o actualiza un cliente. La validación se repite aquí en el servidor. */
export async function saveClientAction(
  clientId: string | null,
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser();
  if (clientId !== null && !idSchema(clientId)) return { ok: false, error: "notFound" };

  const parsed = clientFormSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[issue.path.join(".")] ??= issue.message;
    return { ok: false, error: "invalid", fieldErrors };
  }

  try {
    const id = clientId ?? (await createClient(user, parsed.data));
    if (clientId) await updateClient(user, clientId, parsed.data);
    refresh();
    return { ok: true, data: { id } };
  } catch (error) {
    return toActionError(error);
  }
}

export async function deleteClientAction(clientId: string): Promise<ActionResult> {
  const user = await requireUser();
  if (!idSchema(clientId)) return { ok: false, error: "notFound" };
  try {
    await deleteClient(user, clientId);
    refresh();
    return { ok: true, data: undefined };
  } catch (error) {
    return toActionError(error);
  }
}

export async function revealBeneficiaryNumberAction(
  enrollmentId: string,
): Promise<ActionResult<{ value: string; programCode: string }>> {
  const user = await requireUser();
  if (!idSchema(enrollmentId)) return { ok: false, error: "notFound" };
  try {
    return { ok: true, data: await revealBeneficiaryNumber(user, enrollmentId) };
  } catch (error) {
    return toActionError(error);
  }
}

const statusSchema = z.enum(CLIENT_STATUSES);

/** Cambio rápido de estatus desde la tabla. */
export async function updateClientStatusAction(
  clientId: string,
  status: string,
): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = statusSchema.safeParse(status);
  if (!idSchema(clientId) || !parsed.success) return { ok: false, error: "invalid" };
  try {
    await updateClientStatus(user, clientId, parsed.data);
    refresh();
    return { ok: true, data: undefined };
  } catch (error) {
    return toActionError(error);
  }
}
