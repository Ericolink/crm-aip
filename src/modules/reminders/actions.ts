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
import { reminderSchema } from "./schema";
import {
  assignableUsers,
  closeReminder,
  createReminder,
  searchClientsForReminder,
  updateReminder,
} from "./service";

export async function createReminderAction(
  clientId: unknown,
  input: unknown,
): Promise<ActionResult> {
  const user = await requireUser();
  if (!isSafeId(clientId))
    return { ok: false, error: "invalid", fieldErrors: { clientId: "required" } };
  const parsed = reminderSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);
  try {
    await createReminder(user, clientId, parsed.data);
    refresh();
    return ok(undefined);
  } catch (error) {
    return fromServiceError(error);
  }
}

export async function updateReminderAction(
  reminderId: unknown,
  input: unknown,
): Promise<ActionResult> {
  const user = await requireUser();
  if (!isSafeId(reminderId)) return { ok: false, error: "notFound" };
  const parsed = reminderSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);
  try {
    await updateReminder(user, reminderId, parsed.data);
    refresh();
    return ok(undefined);
  } catch (error) {
    return fromServiceError(error);
  }
}

export async function closeReminderAction(
  reminderId: unknown,
  status: unknown,
): Promise<ActionResult> {
  const user = await requireUser();
  if (!isSafeId(reminderId) || (status !== "DONE" && status !== "CANCELLED")) {
    return { ok: false, error: "invalid" };
  }
  try {
    await closeReminder(user, reminderId, status);
    refresh();
    return ok(undefined);
  } catch (error) {
    return fromServiceError(error);
  }
}

export async function searchClientsForReminderAction(
  query: unknown,
): Promise<ActionResult<{ id: string; firstName: string; lastName: string }[]>> {
  const user = await requireUser();
  if (typeof query !== "string" || query.length > 100) return { ok: false, error: "invalid" };
  try {
    return ok(await searchClientsForReminder(user, query));
  } catch (error) {
    return fromServiceError(error);
  }
}

export async function assignableUsersAction(
  clientId: unknown,
): Promise<ActionResult<{ id: string; name: string }[]>> {
  const user = await requireUser();
  if (!isSafeId(clientId)) return { ok: false, error: "notFound" };
  try {
    return ok(await assignableUsers(user, clientId));
  } catch (error) {
    return fromServiceError(error);
  }
}
