"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { fromServiceError, isSafeId, ok, type ActionResult } from "@/lib/action-result";
import { requireUser } from "@/lib/auth/session";
import { PROGRAM_CODES } from "@/modules/clients/schema";
import { createCarrier, setCarrierProgram, updateCarrier } from "./service";

export async function createCarrierAction(name: unknown): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser();
  try {
    const id = await createCarrier(user, name);
    refresh();
    return ok({ id });
  } catch (error) {
    return fromServiceError(error);
  }
}

export async function updateCarrierAction(
  carrierId: unknown,
  input: { name?: unknown; isActive?: unknown },
): Promise<ActionResult> {
  const user = await requireUser();
  if (!isSafeId(carrierId)) return { ok: false, error: "notFound" };
  const isActive = input.isActive === undefined ? undefined : z.boolean().safeParse(input.isActive);
  if (isActive && !isActive.success) return { ok: false, error: "invalid" };
  try {
    await updateCarrier(user, carrierId, { name: input.name, isActive: isActive?.data });
    refresh();
    return ok(undefined);
  } catch (error) {
    return fromServiceError(error);
  }
}

export async function setCarrierProgramAction(
  carrierId: unknown,
  programCode: unknown,
  enabled: unknown,
): Promise<ActionResult> {
  const user = await requireUser();
  const code = z.enum(PROGRAM_CODES).safeParse(programCode);
  if (!isSafeId(carrierId) || !code.success || typeof enabled !== "boolean") {
    return { ok: false, error: "invalid" };
  }
  try {
    await setCarrierProgram(user, carrierId, code.data, enabled);
    refresh();
    return ok(undefined);
  } catch (error) {
    return fromServiceError(error);
  }
}
