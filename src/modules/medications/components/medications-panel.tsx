"use client";

import { Pencil, Pill, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState, useTransition, type FormEvent } from "react";
import { toast } from "sonner";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Field } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { SelectField } from "@/components/ui/select-field";
import {
  addClientMedicationAction,
  removeClientMedicationAction,
  suggestMedicationsAction,
  updateClientMedicationAction,
} from "../actions";
import { clientMedicationSchema, MEDICATION_FORMS } from "../schema";

type Medication = {
  id: string;
  name: string;
  dose: string | null;
  frequency: string | null;
  form: string | null;
  formOther: string | null;
  notes: string | null;
  prescriber: { id: string; name: string; removed: boolean } | null;
};
type Prescriber = { id: string; name: string; role: string };

const grid = "grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]";

function formObject(form: HTMLFormElement): Record<string, string> {
  return Object.fromEntries([...new FormData(form).entries()].map(([k, v]) => [k, String(v)]));
}

/** Formulario de alta/edición. Sugerencias del catálogo con <datalist> (accesible, sin librerías). */
function MedicationForm({
  initial,
  prescribers,
  pending,
  errors,
  onSubmit,
  onCancel,
}: {
  initial?: Medication;
  prescribers: Prescriber[];
  pending: boolean;
  errors: Record<string, string>;
  onSubmit: (values: Record<string, string>) => void;
  onCancel: () => void;
}) {
  const t = useTranslations("Medications");
  const listId = useId();
  const [form, setForm] = useState(initial?.form ?? "");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const err = (f: string) =>
    errors[f] ? t(`validation.${errors[f]}` as "validation.required") : undefined;

  function onName(value: string) {
    window.clearTimeout(timer.current);
    if (value.trim().length < 2) return setSuggestions([]);
    timer.current = window.setTimeout(async () => {
      const result = await suggestMedicationsAction(value);
      setSuggestions(result.ok ? result.data : []);
    }, 250);
  }

  // Médicos activos del cliente + el que lo prescribió si ya fue quitado (para no perder el dato).
  const prescriberOptions = [
    ...prescribers.map((p) => ({ value: p.id, label: p.name })),
    ...(initial?.prescriber?.removed
      ? [
          {
            value: initial.prescriber.id,
            label: t("removedPrescriber", { name: initial.prescriber.name }),
          },
        ]
      : []),
  ];

  return (
    <form
      noValidate
      onSubmit={(e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        onSubmit(formObject(e.currentTarget));
      }}
    >
      <div className={grid}>
        <div className="col-span-full">
          <Field
            label={`${t("fields.name")} *`}
            name="name"
            list={listId}
            defaultValue={initial?.name}
            placeholder={t("fields.namePlaceholder")}
            maxLength={120}
            autoComplete="off"
            onChange={(e) => onName(e.target.value)}
            error={err("name")}
          />
          <datalist id={listId}>
            {suggestions.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </div>
        <Field
          label={t("fields.dose")}
          name="dose"
          defaultValue={initial?.dose ?? ""}
          placeholder={t("fields.dosePlaceholder")}
          maxLength={60}
          error={err("dose")}
        />
        <Field
          label={t("fields.frequency")}
          name="frequency"
          defaultValue={initial?.frequency ?? ""}
          placeholder={t("fields.frequencyPlaceholder")}
          maxLength={80}
          error={err("frequency")}
        />
        <SelectField
          label={t("fields.form")}
          name="form"
          value={form}
          onChange={(e) => setForm(e.target.value)}
          placeholder={t("fields.choose")}
          options={MEDICATION_FORMS.map((f) => ({ value: f, label: t(`forms.${f}`) }))}
          error={err("form")}
        />
        {form === "OTHER" && (
          <Field
            label={`${t("fields.formOther")} *`}
            name="formOther"
            defaultValue={initial?.formOther ?? ""}
            maxLength={60}
            error={err("formOther")}
          />
        )}
        <div className="col-span-full">
          <SelectField
            label={t("fields.prescriber")}
            name="prescriberClientDoctorId"
            defaultValue={initial?.prescriber?.id ?? ""}
            placeholder={t("fields.noPrescriber")}
            options={prescriberOptions}
            error={err("prescriberClientDoctorId")}
          />
          {prescribers.length === 0 && (
            <p className="text-muted mt-1.5 text-xs">{t("noDoctorsHint")}</p>
          )}
        </div>
        <div className="col-span-full">
          <Field
            label={t("fields.notes")}
            name="notes"
            defaultValue={initial?.notes ?? ""}
            maxLength={500}
            error={err("notes")}
          />
        </div>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel} disabled={pending}>
          {t("dialog.cancel")}
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? t("dialog.saving") : t("dialog.save")}
        </Button>
      </div>
    </form>
  );
}

export function MedicationsPanel({
  clientId,
  medications,
  prescribers,
  canWrite,
}: {
  clientId: string;
  medications: Medication[];
  prescribers: Prescriber[];
  canWrite: boolean;
}) {
  const t = useTranslations("Medications");
  const [dialog, setDialog] = useState<{ mode: "add" } | { mode: "edit"; med: Medication } | null>(
    null,
  );
  const [toRemove, setToRemove] = useState<Medication | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  function save(values: Record<string, string>) {
    const local = clientMedicationSchema.safeParse(values);
    if (!local.success) {
      const next: Record<string, string> = {};
      for (const i of local.error.issues) next[i.path.join(".")] ??= i.message;
      setErrors(next);
      return;
    }
    setErrors({});
    const current = dialog;
    startTransition(async () => {
      const result =
        current?.mode === "edit"
          ? await updateClientMedicationAction(current.med.id, values)
          : await addClientMedicationAction(clientId, values);
      if (result.ok) {
        toast.success(t(current?.mode === "edit" ? "toast.updated" : "toast.added"));
        setDialog(null);
      } else {
        setErrors(result.fieldErrors ?? {});
        toast.error(t(`errors.${result.error}`));
      }
    });
  }

  function remove() {
    if (!toRemove) return;
    startTransition(async () => {
      const result = await removeClientMedicationAction(toRemove.id);
      if (result.ok) toast.success(t("toast.removed"));
      else toast.error(t(`errors.${result.error}`));
      setToRemove(null);
    });
  }

  const formLabel = (m: Medication) =>
    m.form === "OTHER"
      ? (m.formOther ?? t("forms.OTHER"))
      : m.form
        ? t(`forms.${m.form}` as "forms.TABLET")
        : "—";

  return (
    <Card
      title={t("title")}
      action={
        canWrite ? (
          <Button
            size="sm"
            onClick={() => {
              setErrors({});
              setDialog({ mode: "add" });
            }}
          >
            <Plus aria-hidden className="size-4" />
            {t("add")}
          </Button>
        ) : null
      }
    >
      {medications.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-6 text-center">
          <div className="bg-primary-soft text-primary flex size-11 items-center justify-center rounded-xl">
            <Pill aria-hidden className="size-5" />
          </div>
          <p className="font-semibold">{t("empty")}</p>
          {canWrite && <p className="text-muted text-sm">{t("emptyHelp")}</p>}
        </div>
      ) : (
        <div className="-mx-5 overflow-x-auto">
          <table className="w-full min-w-[820px] border-collapse text-[13px]">
            <thead>
              <tr className="text-left text-xs font-semibold text-[#4a5366]">
                {(["name", "dose", "frequency", "form", "prescriber", "notes"] as const).map(
                  (c) => (
                    <th
                      key={c}
                      scope="col"
                      className="border-border border-b bg-[#f8f9fb] px-5 py-2.5"
                    >
                      {t(`columns.${c}`)}
                    </th>
                  ),
                )}
                {canWrite && (
                  <th scope="col" className="border-border border-b bg-[#f8f9fb] px-5 py-2.5">
                    <span className="sr-only">{t("actions")}</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {medications.map((m) => (
                <tr key={m.id} className="border-b border-[#f1f3f6] align-top">
                  <td className="px-5 py-3 font-semibold">{m.name}</td>
                  <td className="px-5 py-3">{m.dose ?? "—"}</td>
                  <td className="px-5 py-3">{m.frequency ?? "—"}</td>
                  <td className="px-5 py-3">{formLabel(m)}</td>
                  <td className="px-5 py-3">
                    {m.prescriber ? (
                      <span className={m.prescriber.removed ? "text-muted" : ""}>
                        {m.prescriber.removed
                          ? t("removedPrescriber", { name: m.prescriber.name })
                          : m.prescriber.name}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="text-muted px-5 py-3">{m.notes ?? "—"}</td>
                  {canWrite && (
                    <td className="px-5 py-3">
                      <div className="flex justify-end gap-1.5">
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={`${t("edit")}: ${m.name}`}
                          onClick={() => {
                            setErrors({});
                            setDialog({ mode: "edit", med: m });
                          }}
                        >
                          <Pencil aria-hidden className="size-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={`${t("remove")}: ${m.name}`}
                          onClick={() => setToRemove(m)}
                        >
                          <Trash2 aria-hidden className="size-3.5" />
                        </Button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={dialog !== null}
        title={dialog?.mode === "edit" ? t("dialog.editTitle") : t("dialog.addTitle")}
        description={dialog?.mode === "edit" ? dialog.med.name : undefined}
        closeLabel={t("dialog.cancel")}
        onClose={() => setDialog(null)}
        busy={pending}
      >
        {Object.keys(errors).length > 0 && (
          <div className="mb-4">
            <Alert tone="error">{t("errors.invalid")}</Alert>
          </div>
        )}
        {dialog && (
          <MedicationForm
            key={dialog.mode === "edit" ? dialog.med.id : "new"}
            initial={dialog.mode === "edit" ? dialog.med : undefined}
            prescribers={prescribers}
            pending={pending}
            errors={errors}
            onSubmit={save}
            onCancel={() => setDialog(null)}
          />
        )}
      </Modal>
      <ConfirmDialog
        open={toRemove !== null}
        title={t("removeDialog.title", { name: toRemove?.name ?? "" })}
        body={t("removeDialog.body")}
        confirmLabel={t("removeDialog.confirm")}
        cancelLabel={t("dialog.cancel")}
        pendingLabel={t("removeDialog.removing")}
        pending={pending}
        onConfirm={remove}
        onCancel={() => setToRemove(null)}
      />
    </Card>
  );
}
