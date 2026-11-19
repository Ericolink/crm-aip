"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import {
  fromServiceError,
  fromZodError,
  isSafeId,
  ok,
  type ActionResult,
} from "@/lib/action-result";
import { requireUser } from "@/lib/auth/session";
import { ServiceError } from "@/lib/service-error";
import {
  createUser,
  resetUserPassword,
  resetUserTwoFactor,
  setUserActive,
  updateUser,
} from "./management";
import { createUserSchema, updateUserSchema } from "./schema";
import { linkAssistantToAgent, unlinkAssistantFromAgent } from "./service";

export type LinkActionResult =
  { ok: true } | { ok: false; error: "forbidden" | "notFound" | "invalid" | "generic" };

const isId = (v: unknown) => typeof v === "string" && /^[A-Za-z0-9-]{8,64}$/.test(v);

function toError(error: unknown): LinkActionResult {
  if (error instanceof ServiceError) {
    if (error.code === "FORBIDDEN") return { ok: false, error: "forbidden" };
    if (error.code === "NOT_FOUND") return { ok: false, error: "notFound" };
    return { ok: false, error: "invalid" };
  }
  return { ok: false, error: "generic" };
}

export async function linkAssistantAction(
  assistantId: string,
  agentId: string,
): Promise<LinkActionResult> {
  const user = await requireUser();
  if (!isId(assistantId) || !isId(agentId)) return { ok: false, error: "invalid" };
  try {
    await linkAssistantToAgent(user, assistantId, agentId);
    refresh();
    return { ok: true };
  } catch (error) {
    return toError(error);
  }
}

export async function unlinkAssistantAction(
  assistantId: string,
  agentId: string,
): Promise<LinkActionResult> {
  const user = await requireUser();
  if (!isId(assistantId) || !isId(agentId)) return { ok: false, error: "invalid" };
  try {
    await unlinkAssistantFromAgent(user, assistantId, agentId);
    refresh();
    return { ok: true };
  } catch (error) {
    return toError(error);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Alta, edición, desactivación y restablecimientos
// ─────────────────────────────────────────────────────────────────────────────

/** Errores con código específico ("campo.código" → { campo: código }). */
function toResult(error: unknown): ActionResult<never> {
  if (error instanceof ServiceError && error.code === "INVALID" && error.field?.includes(".")) {
    const [field, code] = error.field.split(".");
    return { ok: false, error: "invalid", fieldErrors: { [field]: code } };
  }
  return fromServiceError(error);
}

const optionalId = (v: unknown) => (isSafeId(v) ? v : null);

export async function createUserAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser();
  const parsed = createUserSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);
  try {
    const id = await createUser(user, parsed.data);
    refresh();
    return ok({ id });
  } catch (error) {
    return toResult(error);
  }
}

export async function updateUserAction(
  userId: unknown,
  input: unknown,
  reassignToId?: unknown,
): Promise<ActionResult> {
  const user = await requireUser();
  if (!isSafeId(userId)) return { ok: false, error: "notFound" };
  const parsed = updateUserSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);
  try {
    await updateUser(user, userId, parsed.data, optionalId(reassignToId));
    refresh();
    return ok(undefined);
  } catch (error) {
    return toResult(error);
  }
}

export async function setUserActiveAction(
  userId: unknown,
  active: unknown,
  reassignToId?: unknown,
): Promise<ActionResult<{ clients: number; reminders: number }>> {
  const user = await requireUser();
  const isActive = z.boolean().safeParse(active);
  if (!isSafeId(userId) || !isActive.success) return { ok: false, error: "invalid" };
  try {
    const moved = await setUserActive(user, userId, isActive.data, optionalId(reassignToId));
    refresh();
    return ok(moved);
  } catch (error) {
    return toResult(error);
  }
}

export async function resetPasswordAction(
  userId: unknown,
  password: unknown,
): Promise<ActionResult> {
  const user = await requireUser();
  if (!isSafeId(userId)) return { ok: false, error: "notFound" };
  try {
    await resetUserPassword(user, userId, password);
    refresh();
    return ok(undefined);
  } catch (error) {
    return toResult(error);
  }
}

export async function resetTwoFactorAction(userId: unknown): Promise<ActionResult> {
  const user = await requireUser();
  if (!isSafeId(userId)) return { ok: false, error: "notFound" };
  try {
    await resetUserTwoFactor(user, userId);
    refresh();
    return ok(undefined);
  } catch (error) {
    return toResult(error);
  }
}
