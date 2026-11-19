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
import {
  addCoverageSchema,
  changeCarrierSchema,
  endCoverageSchema,
  updateCoverageSchema,
} from "./schema";
import {
  addCoverage,
  changeCarrier,
  endCoverage,
  revealInsuranceNumber,
  updateCoverage,
} from "./service";

/** Cada acción vuelve a validar en el servidor; nunca confía en el navegador. */

export async function addCoverageAction(clientId: unknown, input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  if (!isSafeId(clientId)) return { ok: false, error: "notFound" };
  const parsed = addCoverageSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);
  try {
    await addCoverage(user, clientId, parsed.data);
    refresh();
    return ok(undefined);
  } catch (error) {
    return fromServiceError(error);
  }
}

export async function updateCoverageAction(
  insuranceId: unknown,
  input: unknown,
): Promise<ActionResult> {
  const user = await requireUser();
  if (!isSafeId(insuranceId)) return { ok: false, error: "notFound" };
  const parsed = updateCoverageSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);
  try {
    await updateCoverage(user, insuranceId, parsed.data);
    refresh();
    return ok(undefined);
  } catch (error) {
    return fromServiceError(error);
  }
}

export async function changeCarrierAction(
  insuranceId: unknown,
  input: unknown,
): Promise<ActionResult> {
  const user = await requireUser();
  if (!isSafeId(insuranceId)) return { ok: false, error: "notFound" };
  const parsed = changeCarrierSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);
  try {
    await changeCarrier(user, insuranceId, parsed.data);
    refresh();
    return ok(undefined);
  } catch (error) {
    return fromServiceError(error);
  }
}

export async function endCoverageAction(
  insuranceId: unknown,
  input: unknown,
): Promise<ActionResult> {
  const user = await requireUser();
  if (!isSafeId(insuranceId)) return { ok: false, error: "notFound" };
  const parsed = endCoverageSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);
  try {
    await endCoverage(user, insuranceId, parsed.data);
    refresh();
    return ok(undefined);
  } catch (error) {
    return fromServiceError(error);
  }
}

export async function revealInsuranceNumberAction(
  insuranceId: unknown,
  field: unknown,
): Promise<ActionResult<{ value: string }>> {
  const user = await requireUser();
  if (!isSafeId(insuranceId) || (field !== "member" && field !== "confirmation")) {
    return { ok: false, error: "invalid" };
  }
  try {
    return ok(await revealInsuranceNumber(user, insuranceId, field));
  } catch (error) {
    return fromServiceError(error);
  }
}
