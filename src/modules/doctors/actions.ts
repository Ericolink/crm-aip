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
import { addClientDoctorSchema, updateClientDoctorSchema } from "./schema";
import {
  addClientDoctor,
  removeClientDoctor,
  searchDoctorDirectory,
  updateClientDoctor,
} from "./service";

export async function addClientDoctorAction(
  clientId: unknown,
  input: unknown,
): Promise<ActionResult> {
  const user = await requireUser();
  if (!isSafeId(clientId)) return { ok: false, error: "notFound" };
  const parsed = addClientDoctorSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);
  try {
    await addClientDoctor(user, clientId, parsed.data);
    refresh();
    return ok(undefined);
  } catch (error) {
    return fromServiceError(error);
  }
}

export async function updateClientDoctorAction(
  clientDoctorId: unknown,
  input: unknown,
): Promise<ActionResult> {
  const user = await requireUser();
  if (!isSafeId(clientDoctorId)) return { ok: false, error: "notFound" };
  const parsed = updateClientDoctorSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);
  try {
    await updateClientDoctor(user, clientDoctorId, parsed.data);
    refresh();
    return ok(undefined);
  } catch (error) {
    return fromServiceError(error);
  }
}

export async function removeClientDoctorAction(clientDoctorId: unknown): Promise<ActionResult> {
  const user = await requireUser();
  if (!isSafeId(clientDoctorId)) return { ok: false, error: "notFound" };
  try {
    await removeClientDoctor(user, clientDoctorId);
    refresh();
    return ok(undefined);
  } catch (error) {
    return fromServiceError(error);
  }
}

export async function searchDoctorsAction(
  query: unknown,
): Promise<ActionResult<Awaited<ReturnType<typeof searchDoctorDirectory>>>> {
  const user = await requireUser();
  if (typeof query !== "string" || query.length > 100) return { ok: false, error: "invalid" };
  try {
    return ok(await searchDoctorDirectory(user, query));
  } catch (error) {
    return fromServiceError(error);
  }
}
