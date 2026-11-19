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
import { conditionSchema, consentTypeSchema } from "./schema";
import {
  createCondition,
  createConsentType,
  moveCondition,
  updateCondition,
  updateConsentType,
} from "./service";

const activeSchema = z.object({ isActive: z.boolean() });

async function run<T>(work: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    const data = await work();
    refresh();
    return ok(data);
  } catch (error) {
    return fromServiceError(error);
  }
}

export async function createConditionAction(input: unknown): Promise<ActionResult<string>> {
  const user = await requireUser();
  const parsed = conditionSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);
  return run(() => createCondition(user, parsed.data));
}

/** Edita los nombres ({ nameEs, nameEn }) o activa/desactiva ({ isActive }). */
export async function updateConditionAction(
  id: unknown,
  input: unknown,
): Promise<ActionResult<void>> {
  const user = await requireUser();
  if (!isSafeId(id)) return { ok: false, error: "notFound" };
  const toggle = activeSchema.safeParse(input);
  if (toggle.success) return run(() => updateCondition(user, id, toggle.data));
  const parsed = conditionSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);
  return run(() => updateCondition(user, id, parsed.data));
}

export async function moveConditionAction(
  id: unknown,
  direction: unknown,
): Promise<ActionResult<void>> {
  const user = await requireUser();
  if (!isSafeId(id) || (direction !== "up" && direction !== "down")) {
    return { ok: false, error: "invalid" };
  }
  return run(() => moveCondition(user, id, direction));
}

export async function createConsentTypeAction(input: unknown): Promise<ActionResult<string>> {
  const user = await requireUser();
  const parsed = consentTypeSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);
  return run(() => createConsentType(user, parsed.data));
}

/** Edita el tipo completo o solo lo activa/desactiva ({ isActive }). */
export async function updateConsentTypeAction(
  id: unknown,
  input: unknown,
): Promise<ActionResult<void>> {
  const user = await requireUser();
  if (!isSafeId(id)) return { ok: false, error: "notFound" };
  const toggle = activeSchema.safeParse(input);
  if (toggle.success) return run(() => updateConsentType(user, id, toggle.data));
  const parsed = consentTypeSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);
  return run(() => updateConsentType(user, id, parsed.data));
}
