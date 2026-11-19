"use server";

import { refresh } from "next/cache";
import {
  fromServiceError,
  fromZodError,
  isSafeId,
  ok,
  type ActionResult,
} from "@/lib/action-result";
import { requireUser } from "@/lib/auth/session";
import { clientMedicationSchema } from "./schema";
import {
  addClientMedication,
  removeClientMedication,
  suggestMedications,
  updateClientMedication,
} from "./service";

export async function addClientMedicationAction(
  clientId: unknown,
  input: unknown,
): Promise<ActionResult> {
  const user = await requireUser();
  if (!isSafeId(clientId)) return { ok: false, error: "notFound" };
  const parsed = clientMedicationSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);
  try {
    await addClientMedication(user, clientId, parsed.data);
    refresh();
    return ok(undefined);
  } catch (error) {
    return fromServiceError(error);
  }
}

export async function updateClientMedicationAction(
  id: unknown,
  input: unknown,
): Promise<ActionResult> {
  const user = await requireUser();
  if (!isSafeId(id)) return { ok: false, error: "notFound" };
  const parsed = clientMedicationSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);
  try {
    await updateClientMedication(user, id, parsed.data);
    refresh();
    return ok(undefined);
  } catch (error) {
    return fromServiceError(error);
  }
}

export async function removeClientMedicationAction(id: unknown): Promise<ActionResult> {
  const user = await requireUser();
  if (!isSafeId(id)) return { ok: false, error: "notFound" };
  try {
    await removeClientMedication(user, id);
    refresh();
    return ok(undefined);
  } catch (error) {
    return fromServiceError(error);
  }
}

export async function suggestMedicationsAction(query: unknown): Promise<ActionResult<string[]>> {
  const user = await requireUser();
  if (typeof query !== "string" || query.length > 100) return { ok: false, error: "invalid" };
  try {
    return ok(await suggestMedications(user, query));
  } catch (error) {
    return fromServiceError(error);
  }
}
