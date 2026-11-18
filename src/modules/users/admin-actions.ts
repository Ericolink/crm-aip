"use server";

import { refresh } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { ServiceError } from "@/lib/service-error";
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
