"use client";

import { Pencil, Plus, Search, Stethoscope, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import { toast } from "sonner";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Field } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { SelectField } from "@/components/ui/select-field";
import type { ActionResult } from "@/lib/action-result";
import { formatPhone } from "@/lib/format";
import {
  addClientDoctorAction,
  removeClientDoctorAction,
  searchDoctorsAction,
  updateClientDoctorAction,
} from "../actions";
import { addClientDoctorSchema, DOCTOR_ROLES, updateClientDoctorSchema } from "../schema";

type Doctor = {
  id: string;
  name: string;
  specialty: string | null;
  clinic: string | null;
  phone: string | null;
  address: string | null;
  npi: string | null;
  sharedWith: number;
};
type Link = { id: string; role: "PCP" | "SPECIALIST"; notes: string | null; doctor: Doctor };
type SearchResult = {
  id: string;
  name: string;
  specialty: string | null;
  clinic: string | null;
  phone: string | null;
};

const grid = "grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]";

function formObject(form: HTMLFormElement): Record<string, string> {
  return Object.fromEntries([...new FormData(form).entries()].map(([k, v]) => [k, String(v)]));
}

/** Envío con validación local (mismo esquema que el servidor) y errores por campo. */
function useSubmit(onDone: () => void) {
  const t = useTranslations("Doctors");
  const [pending, startTransition] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});
  function submit(
    schema: {
      safeParse: (v: unknown) => {
        success: boolean;
        error?: { issues: { path: PropertyKey[]; message: string }[] };
      };
    },
    values: Record<string, string>,
    action: () => Promise<ActionResult>,
    toastKey: "added" | "updated",
  ) {
    const local = schema.safeParse(values);
    if (!local.success) {
      const next: Record<string, string> = {};
      for (const i of local.error!.issues) next[i.path.join(".")] ??= i.message;
      setErrors(next);
      return;
    }
    setErrors({});
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        toast.success(t(`toast.${toastKey}`));
        onDone();
      } else {
        setErrors(result.fieldErrors ?? {});
        toast.error(t(`errors.${result.error}`));
      }
    });
  }
  const err = (f: string) =>
    errors[f] ? t(`validation.${errors[f]}` as "validation.required") : undefined;
  return { pending, submit, err, reset: () => setErrors({}) };
}

function DirectoryFields({
  err,
  doctor,
}: {
  err: (f: string) => string | undefined;
  doctor?: Doctor;
}) {
  const t = useTranslations("Doctors.fields");
  return (
    <>
      <div className="col-span-full">
        <Field
          label={`${t("name")} *`}
          name="name"
          defaultValue={doctor?.name}
          maxLength={120}
          error={err("name")}
        />
      </div>
      <Field
        label={t("specialty")}
        name="specialty"
        defaultValue={doctor?.specialty ?? ""}
        maxLength={80}
        error={err("specialty")}
      />
      <Field
        label={t("clinic")}
        name="clinic"
        defaultValue={doctor?.clinic ?? ""}
        maxLength={120}
        error={err("clinic")}
      />
      <Field
        label={t("phone")}
        name="phone"
        type="tel"
        defaultValue={formatPhone(doctor?.phone)}
        error={err("phone")}
      />
      <Field
        label={t("npi")}
        name="npi"
        inputMode="numeric"
        defaultValue={doctor?.npi ?? ""}
        maxLength={10}
        error={err("npi")}
      />
      <div className="col-span-full">
        <Field
          label={t("address")}
          name="address"
          defaultValue={doctor?.address ?? ""}
          maxLength={200}
          error={err("address")}
        />
      </div>
    </>
  );
}

function LinkFields({
  err,
  link,
  currentPcp,
  onRoleChange,
  role,
}: {
  err: (f: string) => string | undefined;
  link?: Link;
  currentPcp: Link | null;
  role: string;
  onRoleChange: (r: string) => void;
}) {
  const t = useTranslations("Doctors");
  const willDemote = role === "PCP" && currentPcp && currentPcp.id !== link?.id;
  return (
    <>
      <SelectField
        label={t("fields.role")}
        name="role"
        value={role}
        onChange={(e) => onRoleChange(e.target.value)}
        options={DOCTOR_ROLES.map((r) => ({ value: r, label: t(`roles.${r}`) }))}
        error={err("role")}
      />
      <div className="col-span-full">
        <Field
          label={t("fields.notes")}
          name="notes"
          defaultValue={link?.notes ?? ""}
          maxLength={500}
          error={err("notes")}
        />
      </div>
      {willDemote && (
        <div className="col-span-full">
          <Alert tone="info">{t("dialog.pcpWarning", { name: currentPcp.doctor.name })}</Alert>
        </div>
      )}
    </>
  );
}

function Footer({ pending, onCancel }: { pending: boolean; onCancel: () => void }) {
  const t = useTranslations("Doctors.dialog");
  return (
    <div className="mt-5 flex justify-end gap-2">
      <Button variant="secondary" onClick={onCancel} disabled={pending}>
        {t("cancel")}
      </Button>
      <Button type="submit" disabled={pending}>
        {pending ? t("saving") : t("save")}
      </Button>
    </div>
  );
}

function AddDoctorButton({ clientId, currentPcp }: { clientId: string; currentPcp: Link | null }) {
  const t = useTranslations("Doctors");
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"search" | "new">("search");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [chosen, setChosen] = useState<SearchResult | null>(null);
  const [role, setRole] = useState<string>(currentPcp ? "SPECIALIST" : "PCP");
  const timer = useRef<number | undefined>(undefined);
  const { pending, submit, err, reset } = useSubmit(() => setOpen(false));

  useEffect(() => () => window.clearTimeout(timer.current), []);

  function openDialog() {
    reset();
    setMode("search");
    setQuery("");
    setResults(null);
    setChosen(null);
    setRole(currentPcp ? "SPECIALIST" : "PCP");
    setOpen(true);
  }

  function onQuery(value: string) {
    setQuery(value);
    window.clearTimeout(timer.current);
    if (value.trim().length < 2) {
      setResults(null);
      return;
    }
    timer.current = window.setTimeout(async () => {
      setSearching(true);
      const result = await searchDoctorsAction(value);
      setSearching(false);
      setResults(result.ok ? result.data : []);
    }, 300);
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const values = {
      ...formObject(e.currentTarget),
      doctorId: mode === "search" ? (chosen?.id ?? "") : "",
    };
    if (mode === "search" && !chosen) return;
    submit(addClientDoctorSchema, values, () => addClientDoctorAction(clientId, values), "added");
  }

  return (
    <>
      <Button size="sm" onClick={openDialog}>
        <Plus aria-hidden className="size-4" />
        {t("add")}
      </Button>
      <Modal
        open={open}
        title={t("dialog.addTitle")}
        closeLabel={t("dialog.cancel")}
        onClose={() => setOpen(false)}
        busy={pending}
      >
        <form onSubmit={onSubmit} noValidate>
          {mode === "search" ? (
            <div className="flex flex-col gap-3">
              {chosen ? (
                <div className="border-primary bg-primary-soft flex items-center justify-between gap-3 rounded-lg border p-3 text-sm">
                  <span>
                    <span className="font-semibold">
                      {t("dialog.chosen", { name: chosen.name })}
                    </span>
                    {chosen.specialty ? (
                      <span className="text-muted"> · {chosen.specialty}</span>
                    ) : null}
                  </span>
                  <Button variant="ghost" size="sm" onClick={() => setChosen(null)}>
                    {t("dialog.change")}
                  </Button>
                </div>
              ) : (
                <>
                  <label className="relative flex items-center">
                    <span className="sr-only">{t("dialog.searchLabel")}</span>
                    <Search aria-hidden className="text-muted absolute left-3 size-4" />
                    <input
                      type="search"
                      value={query}
                      onChange={(e) => onQuery(e.target.value)}
                      placeholder={t("dialog.searchPlaceholder")}
                      autoFocus
                      autoComplete="off"
                      className="border-border-strong focus:border-primary focus:ring-primary-soft h-11 w-full rounded-lg border pr-3 pl-9 outline-none focus:ring-3"
                    />
                  </label>
                  <div aria-live="polite" className="flex flex-col gap-1.5">
                    {searching && <p className="text-muted text-sm">{t("dialog.searching")}</p>}
                    {!searching && results?.length === 0 && (
                      <p className="text-muted text-sm">{t("dialog.noResults")}</p>
                    )}
                    {!searching &&
                      results?.map((d) => (
                        <button
                          key={d.id}
                          type="button"
                          onClick={() => setChosen(d)}
                          className="border-border hover:bg-canvas flex cursor-pointer items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left text-sm"
                        >
                          <span>
                            <span className="font-semibold">{d.name}</span>
                            <span className="text-muted">
                              {[d.specialty, d.clinic, formatPhone(d.phone)]
                                .filter(Boolean)
                                .map((x) => ` · ${x}`)}
                            </span>
                          </span>
                          <span className="text-primary text-xs font-semibold">
                            {t("dialog.choose")}
                          </span>
                        </button>
                      ))}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="self-start"
                    onClick={() => setMode("new")}
                  >
                    <Plus aria-hidden className="size-4" />
                    {t("dialog.createNew")}
                  </Button>
                </>
              )}
              {chosen && (
                <div className={grid}>
                  <LinkFields
                    err={err}
                    currentPcp={currentPcp}
                    role={role}
                    onRoleChange={setRole}
                  />
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">{t("dialog.newDoctorTitle")}</h3>
                <Button variant="ghost" size="sm" onClick={() => setMode("search")}>
                  <Search aria-hidden className="size-4" />
                  {t("dialog.backToSearch")}
                </Button>
              </div>
              <div className={grid}>
                <DirectoryFields err={err} />
                <LinkFields err={err} currentPcp={currentPcp} role={role} onRoleChange={setRole} />
              </div>
            </div>
          )}
          {(mode === "new" || chosen) && (
            <Footer pending={pending} onCancel={() => setOpen(false)} />
          )}
        </form>
      </Modal>
    </>
  );
}

function DoctorCard({
  link,
  canWrite,
  currentPcp,
}: {
  link: Link;
  canWrite: boolean;
  currentPcp: Link | null;
}) {
  const t = useTranslations("Doctors");
  const [editing, setEditing] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [role, setRole] = useState<string>(link.role);
  const [removePending, startRemove] = useTransition();
  const { pending, submit, err, reset } = useSubmit(() => setEditing(false));
  const d = link.doctor;

  function onEdit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const values = formObject(e.currentTarget);
    submit(
      updateClientDoctorSchema,
      values,
      () => updateClientDoctorAction(link.id, values),
      "updated",
    );
  }

  function onRemove() {
    startRemove(async () => {
      const result = await removeClientDoctorAction(link.id);
      if (result.ok) toast.success(t("toast.removed"));
      else toast.error(t(`errors.${result.error}`));
      setRemoving(false);
    });
  }

  return (
    <article
      className={`flex flex-wrap items-start gap-4 rounded-lg border p-4 ${
        link.role === "PCP" ? "border-[#b9c8ee] bg-[#fafbff]" : "border-border"
      }`}
    >
      {link.role === "PCP" && (
        <span className="bg-primary inline-flex h-6 items-center rounded-full px-2.5 text-xs font-semibold text-white">
          {t("pcpBadge")}
        </span>
      )}
      <div className="min-w-0 flex-[1_1_260px] text-sm">
        <div className="text-base font-semibold">{d.name}</div>
        <div className="text-muted">
          {[d.specialty, d.clinic].filter(Boolean).join(" · ") || "—"}
        </div>
        <div className="mt-1.5">
          {[formatPhone(d.phone), d.address].filter(Boolean).join(" · ")}
        </div>
        {d.npi && <div className="text-muted text-xs">NPI {d.npi}</div>}
        {link.notes && <p className="mt-1.5">{link.notes}</p>}
        {d.sharedWith > 1 && (
          <p className="text-muted mt-1 text-xs">{t("sharedWith", { count: d.sharedWith })}</p>
        )}
      </div>
      {canWrite && (
        <div className="flex gap-1.5">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              reset();
              setRole(link.role);
              setEditing(true);
            }}
          >
            <Pencil aria-hidden className="size-3.5" />
            {t("edit")}
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setRemoving(true)}>
            <Trash2 aria-hidden className="size-3.5" />
            {t("remove")}
          </Button>
        </div>
      )}

      <Modal
        open={editing}
        title={t("dialog.editTitle")}
        description={d.name}
        closeLabel={t("dialog.cancel")}
        onClose={() => setEditing(false)}
        busy={pending}
      >
        <form onSubmit={onEdit} noValidate>
          {d.sharedWith > 1 && (
            <div className="mb-4">
              <Alert tone="info">{t("dialog.sharedWarning", { count: d.sharedWith })}</Alert>
            </div>
          )}
          <div className={grid}>
            <DirectoryFields err={err} doctor={d} />
            <LinkFields
              err={err}
              link={link}
              currentPcp={currentPcp}
              role={role}
              onRoleChange={setRole}
            />
          </div>
          <Footer pending={pending} onCancel={() => setEditing(false)} />
        </form>
      </Modal>
      <ConfirmDialog
        open={removing}
        title={t("removeDialog.title", { name: d.name })}
        body={t("removeDialog.body")}
        confirmLabel={t("removeDialog.confirm")}
        cancelLabel={t("dialog.cancel")}
        pendingLabel={t("removeDialog.removing")}
        pending={removePending}
        onConfirm={onRemove}
        onCancel={() => setRemoving(false)}
      />
    </article>
  );
}

export function DoctorsPanel({
  clientId,
  pcp,
  specialists,
  canWrite,
}: {
  clientId: string;
  pcp: Link | null;
  specialists: Link[];
  canWrite: boolean;
}) {
  const t = useTranslations("Doctors");
  return (
    <div className="flex flex-col gap-5">
      <Card
        title={t("pcpTitle")}
        action={canWrite ? <AddDoctorButton clientId={clientId} currentPcp={pcp} /> : null}
      >
        {pcp ? (
          <DoctorCard
            key={`${pcp.id}-${pcp.role}`}
            link={pcp}
            canWrite={canWrite}
            currentPcp={pcp}
          />
        ) : (
          <p className="text-muted flex items-center gap-2 text-sm">
            <Stethoscope aria-hidden className="size-4" />
            {t("noPcp")}
          </p>
        )}
      </Card>
      <Card title={t("specialistsTitle")}>
        {specialists.length === 0 ? (
          <p className="text-muted text-sm">{t("noSpecialists")}</p>
        ) : (
          <div className="flex flex-col gap-3">
            {specialists.map((s) => (
              <DoctorCard key={`${s.id}-${s.role}`} link={s} canWrite={canWrite} currentPcp={pcp} />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
