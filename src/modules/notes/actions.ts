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
import { noteSchema } from "./schema";
import { createNote, deleteNote, updateNote } from "./service";

export async function createNoteAction(clientId: unknown, input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  if (!isSafeId(clientId)) return { ok: false, error: "notFound" };
  const parsed = noteSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);
  try {
    await createNote(user, clientId, parsed.data);
    refresh();
    return ok(undefined);
  } catch (error) {
    return fromServiceError(error);
  }
}

export async function updateNoteAction(noteId: unknown, input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  if (!isSafeId(noteId)) return { ok: false, error: "notFound" };
  const parsed = noteSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);
  try {
    await updateNote(user, noteId, parsed.data);
    refresh();
    return ok(undefined);
  } catch (error) {
    return fromServiceError(error);
  }
}

export async function deleteNoteAction(noteId: unknown): Promise<ActionResult> {
  const user = await requireUser();
  if (!isSafeId(noteId)) return { ok: false, error: "notFound" };
  try {
    await deleteNote(user, noteId);
    refresh();
    return ok(undefined);
  } catch (error) {
    return fromServiceError(error);
  }
}
