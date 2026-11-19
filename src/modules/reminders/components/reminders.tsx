"use client";

import { Check, Clock, Phone, Plus, Search, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Field } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { SelectField } from "@/components/ui/select-field";
import { formatPhone } from "@/lib/format";
import { utcToZonedLocal } from "@/lib/timezone";
import { Link } from "@/i18n/navigation";
import {
  assignableUsersAction,
  closeReminderAction,
  createReminderAction,
  searchClientsForReminderAction,
  updateReminderAction,
} from "../actions";
import { REMINDER_PRIORITIES, reminderSchema } from "../schema";

export type ReminderItem = {
  id: string;
  description: string;
  dueAt: Date;
  dueAtLocal: string;
  priority: "NORMAL" | "HIGH" | "URGENT";
  status: "PENDING" | "DONE" | "CANCELLED";
  overdue: boolean;
  completedAt: Date | null;
  cancelledAt: Date | null;
  assignedTo: { id: string; name: string };
  client: { id: string; firstName: string; lastName: string; primaryPhone: string | null };
};

const PRIORITY_STYLE: Record<string, string> = {
  URGENT: "bg-status-urgent-bg text-status-urgent-fg",
  HIGH: "bg-status-pending-bg text-status-pending-fg",
  NORMAL: "bg-[#eef0f4] text-[#3a4356]",
};
const TZ = "America/New_York";
const fullName = (c: { firstName: string; lastName: string }) => `${c.firstName} ${c.lastName}`;

function useFormatters(now: Date) {
  const t = useTranslations("Reminders");
  const locale = useLocale() === "en" ? "en-US" : "es-US";
  const dayKey = (d: Date) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date(d));
  const time = new Intl.DateTimeFormat(locale, {
    timeZone: TZ,
    hour: "numeric",
    minute: "2-digit",
  });
  const day = new Intl.DateTimeFormat(locale, {
    timeZone: TZ,
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  const full = new Intl.DateTimeFormat(locale, {
    timeZone: TZ,
    dateStyle: "medium",
    timeStyle: "short",
  });
  const today = dayKey(now);
  const tomorrow = dayKey(new Date(now.getTime() + 86_400_000));
  return {
    when: (d: Date) =>
      dayKey(d) === today
        ? t("today")
        : dayKey(d) === tomorrow
          ? t("tomorrow")
          : day.format(new Date(d)),
    time: (d: Date) => time.format(new Date(d)),
    full: (d: Date) => full.format(new Date(d)),
  };
}

/** Formulario de recordatorio. Si no hay cliente fijo, permite buscarlo. */
function ReminderForm({
  clientId: fixedClientId,
  initial,
  currentUser,
  defaultDueAt,
  onDone,
}: {
  clientId?: string;
  initial?: ReminderItem;
  currentUser: { id: string; name: string };
  defaultDueAt: string;
  onDone: () => void;
}) {
  const t = useTranslations("Reminders");
  const [clientId, setClientId] = useState(fixedClientId ?? initial?.client.id ?? "");
  const [clientName, setClientName] = useState(initial ? fullName(initial.client) : "");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<
    { id: string; firstName: string; lastName: string }[] | null
  >(null);
  const [assignees, setAssignees] = useState<{ id: string; name: string }[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  // Responsables posibles para el cliente elegido (solo quienes pueden ver a ese cliente).
  useEffect(() => {
    if (!clientId) return;
    let active = true;
    void assignableUsersAction(clientId).then((r) => {
      if (active && r.ok) setAssignees(r.data);
    });
    return () => {
      active = false;
    };
  }, [clientId]);

  function onQuery(value: string) {
    setQuery(value);
    window.clearTimeout(timer.current);
    if (value.trim().length < 2) return setResults(null);
    timer.current = window.setTimeout(async () => {
      const r = await searchClientsForReminderAction(value);
      setResults(r.ok ? r.data : []);
    }, 300);
  }

  const err = (f: string) =>
    errors[f] ? t(`validation.${errors[f]}` as "validation.required") : undefined;

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const values = Object.fromEntries(
      [...new FormData(e.currentTarget).entries()].map(([k, v]) => [k, String(v)]),
    );
    if (!clientId) return setErrors({ clientId: "required" });
    const local = reminderSchema.safeParse(values);
    if (!local.success) {
      const next: Record<string, string> = {};
      for (const i of local.error.issues) next[i.path.join(".")] ??= i.message;
      return setErrors(next);
    }
    setErrors({});
    startTransition(async () => {
      const result = initial
        ? await updateReminderAction(initial.id, values)
        : await createReminderAction(clientId, values);
      if (result.ok) {
        toast.success(t(initial ? "toast.updated" : "toast.created"));
        onDone();
      } else {
        setErrors(result.fieldErrors ?? {});
        toast.error(t(`errors.${result.error}`));
      }
    });
  }

  const assigneeOptions = (assignees.length ? assignees : [currentUser]).map((u) => ({
    value: u.id,
    label: u.id === currentUser.id ? t("fields.me", { name: u.name }) : u.name,
  }));

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      {!fixedClientId && !initial && (
        <div>
          <span className="mb-1.5 block text-xs font-semibold text-[#4a5366]">
            {t("fields.client")} *
          </span>
          {clientId ? (
            <div className="border-primary bg-primary-soft flex items-center justify-between rounded-lg border px-3 py-2 text-sm font-semibold">
              {clientName}
              <Button variant="ghost" size="sm" onClick={() => setClientId("")}>
                {t("fields.changeClient")}
              </Button>
            </div>
          ) : (
            <>
              <label className="relative flex items-center">
                <span className="sr-only">{t("fields.clientSearch")}</span>
                <Search aria-hidden className="text-muted absolute left-3 size-4" />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => onQuery(e.target.value)}
                  placeholder={t("fields.clientSearch")}
                  autoComplete="off"
                  aria-invalid={errors.clientId ? true : undefined}
                  className={`focus:border-primary focus:ring-primary-soft h-11 w-full rounded-lg border pr-3 pl-9 outline-none focus:ring-3 ${errors.clientId ? "border-danger" : "border-border-strong"}`}
                />
              </label>
              {errors.clientId && (
                <p className="text-danger mt-1.5 text-xs">{t("validation.required")}</p>
              )}
              <div aria-live="polite" className="mt-1.5 flex flex-col gap-1">
                {results?.length === 0 && (
                  <p className="text-muted text-sm">{t("fields.noClients")}</p>
                )}
                {results?.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      setClientId(c.id);
                      setClientName(fullName(c));
                    }}
                    className="border-border hover:bg-canvas cursor-pointer rounded-lg border px-3 py-2 text-left text-sm font-medium"
                  >
                    {fullName(c)}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}
      <Field
        label={`${t("fields.description")} *`}
        name="description"
        defaultValue={initial?.description}
        placeholder={t("fields.descriptionPlaceholder")}
        maxLength={500}
        error={err("description")}
      />
      <div className="grid [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))] gap-4">
        <Field
          label={`${t("fields.dueAt")} *`}
          name="dueAt"
          type="datetime-local"
          defaultValue={initial?.dueAtLocal ?? defaultDueAt}
          error={err("dueAt")}
        />
        <SelectField
          label={t("fields.priority")}
          name="priority"
          defaultValue={initial?.priority ?? "NORMAL"}
          options={REMINDER_PRIORITIES.map((p) => ({ value: p, label: t(`priorities.${p}`) }))}
        />
        <SelectField
          key={assignees.length}
          label={t("fields.assignedTo")}
          name="assignedToId"
          defaultValue={initial?.assignedTo.id ?? currentUser.id}
          options={assigneeOptions}
          error={err("assignedToId")}
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onDone} disabled={pending}>
          {t("dialog.close")}
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? t("dialog.saving") : t("dialog.save")}
        </Button>
      </div>
    </form>
  );
}

export function NewReminderButton({
  clientId,
  currentUser,
  now,
  size = "md",
}: {
  clientId?: string;
  currentUser: { id: string; name: string };
  now: Date;
  size?: "md" | "sm";
}) {
  const t = useTranslations("Reminders");
  const [open, setOpen] = useState(false);
  // Por defecto: mañana a las 10:00 (hora de Florida).
  const tomorrow =
    utcToZonedLocal(new Date(new Date(now).getTime() + 86_400_000)).slice(0, 10) + "T10:00";
  return (
    <>
      <Button size={size} onClick={() => setOpen(true)}>
        <Plus aria-hidden className="size-4" />
        {t("add")}
      </Button>
      <Modal
        open={open}
        title={t("dialog.addTitle")}
        closeLabel={t("dialog.close")}
        onClose={() => setOpen(false)}
      >
        {open && (
          <ReminderForm
            clientId={clientId}
            currentUser={currentUser}
            defaultDueAt={tomorrow}
            onDone={() => setOpen(false)}
          />
        )}
      </Modal>
    </>
  );
}

function ReminderRow({
  reminder: r,
  showClient,
  currentUser,
  now,
}: {
  reminder: ReminderItem;
  showClient: boolean;
  currentUser: { id: string; name: string };
  now: Date;
}) {
  const t = useTranslations("Reminders");
  const f = useFormatters(now);
  const [editing, setEditing] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [pending, startTransition] = useTransition();
  const isPending = r.status === "PENDING";

  function close(status: "DONE" | "CANCELLED") {
    startTransition(async () => {
      const result = await closeReminderAction(r.id, status);
      if (result.ok) toast.success(t(status === "DONE" ? "toast.done" : "toast.cancelled"));
      else toast.error(t(`errors.${result.error}`));
      setCancelling(false);
    });
  }

  return (
    <li
      className={`flex flex-wrap items-center gap-3 border-b border-[#f1f3f6] px-5 py-3 last:border-b-0 ${r.overdue ? "bg-[#fff8f7]" : ""}`}
    >
      <div className="w-24 shrink-0 text-[13px]">
        {isPending ? (
          <>
            <div className={`font-semibold ${r.overdue ? "text-danger" : ""}`}>
              {r.overdue ? t("overdue") : f.when(r.dueAt)}
            </div>
            <div className="text-muted text-xs">
              {r.overdue ? f.full(r.dueAt) : f.time(r.dueAt)}
            </div>
          </>
        ) : (
          <div className="text-muted text-xs">{f.full(r.dueAt)}</div>
        )}
      </div>
      <div className="min-w-0 flex-[1_1_220px]">
        {showClient && (
          <Link href={`/clients/${r.client.id}`} className="font-semibold hover:underline">
            {fullName(r.client)}
          </Link>
        )}
        <div className={showClient ? "text-[13px]" : "font-medium"}>{r.description}</div>
        <div className="text-muted text-xs">
          {t("assignedTo", { name: r.assignedTo.name })}
          {r.completedAt && ` · ${t("completedAt", { date: f.full(r.completedAt) })}`}
          {r.cancelledAt && ` · ${t("cancelledAt", { date: f.full(r.cancelledAt) })}`}
        </div>
      </div>
      <span
        className={`inline-flex h-6 items-center rounded-full px-2.5 text-xs font-semibold ${PRIORITY_STYLE[r.priority]}`}
      >
        {t(`priorities.${r.priority}`)}
      </span>
      {isPending && (
        <div className="flex items-center gap-1.5">
          {r.client.primaryPhone && (
            <a
              href={`tel:+1${r.client.primaryPhone}`}
              aria-label={t("call", { name: fullName(r.client) })}
              title={formatPhone(r.client.primaryPhone)}
              className="border-border-strong text-muted hover:bg-canvas inline-flex size-9 items-center justify-center rounded-lg border"
            >
              <Phone aria-hidden className="size-4" />
            </a>
          )}
          <Button
            variant="secondary"
            size="sm"
            className="size-9 px-0"
            aria-label={t("edit")}
            title={t("edit")}
            onClick={() => setEditing(true)}
          >
            <Clock aria-hidden className="size-4" />
          </Button>
          <Button
            variant="secondary"
            size="sm"
            className="size-9 px-0"
            aria-label={t("cancel")}
            title={t("cancel")}
            onClick={() => setCancelling(true)}
          >
            <X aria-hidden className="size-4" />
          </Button>
          <Button size="sm" disabled={pending} onClick={() => close("DONE")}>
            <Check aria-hidden className="size-4" />
            {t("complete")}
          </Button>
        </div>
      )}
      <Modal
        open={editing}
        title={t("dialog.editTitle")}
        closeLabel={t("dialog.close")}
        onClose={() => setEditing(false)}
      >
        {editing && (
          <ReminderForm
            initial={r}
            clientId={r.client.id}
            currentUser={currentUser}
            defaultDueAt={r.dueAtLocal}
            onDone={() => setEditing(false)}
          />
        )}
      </Modal>
      <ConfirmDialog
        open={cancelling}
        title={t("cancelDialog.title")}
        body={t("cancelDialog.body")}
        confirmLabel={t("cancelDialog.confirm")}
        cancelLabel={t("cancelDialog.keep")}
        pendingLabel={t("cancelDialog.cancelling")}
        pending={pending}
        onConfirm={() => close("CANCELLED")}
        onCancel={() => setCancelling(false)}
      />
    </li>
  );
}

export function ReminderList({
  reminders,
  showClient,
  currentUser,
  now,
  emptyText,
}: {
  reminders: ReminderItem[];
  showClient: boolean;
  currentUser: { id: string; name: string };
  now: Date;
  emptyText: string;
}) {
  if (reminders.length === 0)
    return <p className="text-muted px-5 py-6 text-center text-sm">{emptyText}</p>;
  return (
    <ul>
      {reminders.map((r) => (
        <ReminderRow
          key={`${r.id}-${r.status}-${new Date(r.dueAt).getTime()}`}
          reminder={r}
          showClient={showClient}
          currentUser={currentUser}
          now={now}
        />
      ))}
    </ul>
  );
}
