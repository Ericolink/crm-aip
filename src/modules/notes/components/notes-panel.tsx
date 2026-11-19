"use client";

import { MessageSquareText, Pencil, Star, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useId, useState, useTransition, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Link } from "@/i18n/navigation";
import { createNoteAction, deleteNoteAction, updateNoteAction } from "../actions";
import { NOTE_MAX_LENGTH, noteSchema } from "../schema";

type Note = {
  id: string;
  body: string;
  isImportant: boolean;
  author: { id: string; name: string };
  createdAt: Date;
  updatedAt: Date;
  edited: boolean;
  canModify: boolean;
};

const textareaCls =
  "border-border-strong focus:border-primary focus:ring-primary-soft w-full resize-y rounded-lg border px-3 py-2.5 text-sm outline-none focus:ring-3";

function useDateTime() {
  const locale = useLocale();
  return (d: Date) =>
    new Intl.DateTimeFormat(locale === "en" ? "en-US" : "es-US", {
      timeZone: "America/New_York",
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(d));
}

/** Formulario de nota (nueva o edición). Valida igual que el servidor. */
function NoteEditor({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
  pending,
}: {
  initial?: { body: string; isImportant: boolean };
  submitLabel: string;
  onSubmit: (values: { body: string; isImportant: boolean }) => void;
  onCancel?: () => void;
  pending: boolean;
}) {
  const t = useTranslations("Notes");
  const id = useId();
  const [body, setBody] = useState(initial?.body ?? "");
  const [important, setImportant] = useState(initial?.isImportant ?? false);
  const [error, setError] = useState<string | null>(null);

  function submit(e: FormEvent) {
    e.preventDefault();
    const parsed = noteSchema.safeParse({ body, isImportant: important });
    if (!parsed.success) {
      setError(t(`validation.${parsed.error.issues[0].message}` as "validation.required"));
      return;
    }
    setError(null);
    onSubmit(parsed.data);
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-2.5">
      <textarea
        id={id}
        aria-label={t("newNote")}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : `${id}-count`}
        rows={3}
        value={body}
        maxLength={NOTE_MAX_LENGTH}
        placeholder={t("placeholder")}
        onChange={(e) => setBody(e.target.value)}
        className={textareaCls}
      />
      {error && (
        <p id={`${id}-error`} className="text-danger text-xs">
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-4"
            checked={important}
            onChange={(e) => setImportant(e.target.checked)}
          />
          {t("markImportant")}
        </label>
        <div className="flex items-center gap-2">
          <span id={`${id}-count`} className="text-muted text-xs">
            {t("charCount", { count: body.length, max: NOTE_MAX_LENGTH })}
          </span>
          {onCancel && (
            <Button variant="secondary" size="sm" onClick={onCancel} disabled={pending}>
              {t("cancel")}
            </Button>
          )}
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? t("saving") : submitLabel}
          </Button>
        </div>
      </div>
    </form>
  );
}

function NoteItem({ note, isLast }: { note: Note; isLast: boolean }) {
  const t = useTranslations("Notes");
  const dateTime = useDateTime();
  const [editing, setEditing] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [pending, startTransition] = useTransition();

  function save(values: { body: string; isImportant: boolean }) {
    startTransition(async () => {
      const result = await updateNoteAction(note.id, values);
      if (result.ok) {
        toast.success(t("toast.updated"));
        setEditing(false);
      } else toast.error(t(`errors.${result.error}`));
    });
  }

  function remove() {
    startTransition(async () => {
      const result = await deleteNoteAction(note.id);
      if (result.ok) toast.success(t("toast.removed"));
      else toast.error(t(`errors.${result.error}`));
      setRemoving(false);
    });
  }

  return (
    <li className="flex gap-3.5">
      <div className="flex flex-col items-center">
        <span
          aria-hidden
          className={`mt-1.5 size-2.5 shrink-0 rounded-full ${note.isImportant ? "bg-warning" : "bg-primary"}`}
        />
        {!isLast && <span aria-hidden className="w-0.5 flex-1 bg-[#e3e6ec]" />}
      </div>
      <article
        className={`mb-4 min-w-0 flex-1 rounded-lg p-3.5 ${note.isImportant ? "border border-[#f3d9a4] bg-[#fffaf0]" : ""}`}
      >
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          <span className="text-ink text-[13px] font-semibold">{note.author.name}</span>
          <time className="text-muted" dateTime={new Date(note.createdAt).toISOString()}>
            {dateTime(note.createdAt)}
          </time>
          {note.isImportant && (
            <span className="bg-status-pending-bg text-status-pending-fg inline-flex h-5 items-center gap-1 rounded-full px-2 font-semibold">
              <Star aria-hidden className="size-3" fill="currentColor" />
              {t("important")}
            </span>
          )}
          {note.edited && (
            <span className="text-muted">· {t("edited", { date: dateTime(note.updatedAt) })}</span>
          )}
          {note.canModify && !editing && (
            <span className="ml-auto flex gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2"
                aria-label={t("edit")}
                onClick={() => setEditing(true)}
              >
                <Pencil aria-hidden className="size-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2"
                aria-label={t("remove")}
                onClick={() => setRemoving(true)}
              >
                <Trash2 aria-hidden className="size-3.5" />
              </Button>
            </span>
          )}
        </div>
        {editing ? (
          <div className="mt-2">
            <NoteEditor
              initial={note}
              submitLabel={t("save")}
              onSubmit={save}
              onCancel={() => setEditing(false)}
              pending={pending}
            />
          </div>
        ) : (
          <p className="mt-1.5 text-sm break-words whitespace-pre-wrap">{note.body}</p>
        )}
      </article>
      <ConfirmDialog
        open={removing}
        title={t("removeDialog.title")}
        body={t("removeDialog.body")}
        confirmLabel={t("removeDialog.confirm")}
        cancelLabel={t("cancel")}
        pendingLabel={t("removeDialog.removing")}
        pending={pending}
        onConfirm={remove}
        onCancel={() => setRemoving(false)}
      />
    </li>
  );
}

export function NotesPanel({
  clientId,
  notes,
  canCreate,
  importantOnly,
  importantCount,
}: {
  clientId: string;
  notes: Note[];
  canCreate: boolean;
  importantOnly: boolean;
  importantCount: number;
}) {
  const t = useTranslations("Notes");
  const [pending, startTransition] = useTransition();
  const [editorKey, setEditorKey] = useState(0);
  const base = `/clients/${clientId}/notes`;
  const pill = (active: boolean) =>
    `inline-flex h-9 items-center rounded-full border px-3.5 text-[13px] font-medium ${
      active
        ? "border-ink bg-ink text-white"
        : "border-border-strong bg-surface text-[#333c4e] hover:bg-canvas"
    }`;

  function create(values: { body: string; isImportant: boolean }) {
    startTransition(async () => {
      const result = await createNoteAction(clientId, values);
      if (result.ok) {
        toast.success(t("toast.created"));
        setEditorKey((k) => k + 1); // limpia el editor
      } else toast.error(t(`errors.${result.error}`));
    });
  }

  return (
    <div className="flex flex-col gap-5">
      {canCreate && (
        <section className="border-border bg-surface rounded-xl border p-5">
          <h2 className="mb-3 text-[15px] font-semibold">{t("newNote")}</h2>
          <NoteEditor key={editorKey} submitLabel={t("save")} onSubmit={create} pending={pending} />
        </section>
      )}

      <section className="border-border bg-surface rounded-xl border p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-[15px] font-semibold">{t("title")}</h2>
          <nav className="flex gap-2" aria-label={t("title")}>
            <Link
              href={base}
              className={pill(!importantOnly)}
              aria-current={!importantOnly ? "page" : undefined}
            >
              {t("all")}
            </Link>
            <Link
              href={`${base}?important=1`}
              className={pill(importantOnly)}
              aria-current={importantOnly ? "page" : undefined}
            >
              {t("onlyImportant", { count: importantCount })}
            </Link>
          </nav>
        </div>
        {notes.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <MessageSquareText aria-hidden className="text-muted size-6" />
            <p className="text-muted text-sm">{importantOnly ? t("emptyImportant") : t("empty")}</p>
          </div>
        ) : (
          <ol>
            {notes.map((n, i) => (
              <NoteItem
                key={`${n.id}-${new Date(n.updatedAt).getTime()}`}
                note={n}
                isLast={i === notes.length - 1}
              />
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
