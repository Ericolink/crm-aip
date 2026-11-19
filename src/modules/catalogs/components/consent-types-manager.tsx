"use client";

import { Pencil, Plus } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition, type FormEvent } from "react";
import { toast } from "sonner";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import type { ActionResult } from "@/lib/action-result";
import { createConsentTypeAction, updateConsentTypeAction } from "../actions";
import { MAX_VALIDITY_DAYS } from "../schema";
import { CatalogTable, StatusPill } from "./catalog-ui";

type ConsentType = {
  id: string;
  code: string;
  nameEs: string;
  nameEn: string;
  requiresDocument: boolean;
  defaultValidityDays: number | null;
  isActive: boolean;
  consents: number;
};
type Editing = ConsentType | "new" | null;

export function ConsentTypesManager({ types }: { types: ConsentType[] }) {
  const t = useTranslations("Settings.consents");
  const tf = useTranslations("Settings.fieldErrors");
  const locale = useLocale();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState<Editing>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const name = (c: ConsentType) => (locale === "en" ? c.nameEn : c.nameEs);
  const fieldError = (code?: string) =>
    !code ? null : tf.has(code) ? tf(code as "required") : t("errors.invalid");

  function run(action: () => Promise<ActionResult<unknown>>, success: string, onDone?: () => void) {
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        toast.success(success);
        onDone?.();
      } else if (result.fieldErrors && editing) {
        setErrors(result.fieldErrors);
      } else {
        toast.error(t(`errors.${result.error}`));
      }
    });
  }

  function open(next: Editing) {
    setErrors({});
    setEditing(next);
  }

  function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const rawDays = String(form.get("defaultValidityDays") ?? "").trim();
    const days = rawDays === "" ? null : Number(rawDays);
    if (days !== null && (!Number.isInteger(days) || days < 1)) {
      return setErrors({ defaultValidityDays: "invalidNumber" });
    }
    const input = {
      nameEs: form.get("nameEs"),
      nameEn: form.get("nameEn"),
      requiresDocument: form.get("requiresDocument") === "on",
      defaultValidityDays: days,
    };
    run(
      () =>
        editing === "new"
          ? createConsentTypeAction(input)
          : updateConsentTypeAction((editing as ConsentType).id, input),
      editing === "new" ? t("toast.created") : t("toast.updated"),
      () => setEditing(null),
    );
  }

  const current = editing && editing !== "new" ? editing : null;

  return (
    <div className="flex flex-col gap-4" aria-busy={pending}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-3xl">
          <h2 className="text-lg font-semibold">{t("title")}</h2>
          <p className="text-muted mt-1 text-sm">{t("subtitle")}</p>
        </div>
        <Button onClick={() => open("new")}>
          <Plus aria-hidden className="size-4" />
          {t("add")}
        </Button>
      </div>
      <Alert tone="info">{t("note")}</Alert>

      <CatalogTable
        minWidth={820}
        headers={[
          { key: "type", label: t("columns.type") },
          { key: "code", label: t("columns.code") },
          { key: "document", label: t("columns.document") },
          { key: "validity", label: t("columns.validity") },
          { key: "status", label: t("columns.status") },
          { key: "records", label: t("columns.records") },
          { key: "actions", label: t("columns.actions"), srOnly: true },
        ]}
      >
        {types.map((c) => (
          <tr key={c.id} className={`border-b border-[#f1f3f6] ${c.isActive ? "" : "opacity-60"}`}>
            <td className="px-4 py-3">
              <div className="font-semibold">{name(c)}</div>
              <div className="text-muted text-xs">{locale === "en" ? c.nameEs : c.nameEn}</div>
            </td>
            <td className="px-4 py-3 font-mono text-xs">{c.code}</td>
            <td className="px-4 py-3">{c.requiresDocument ? t("yes") : t("no")}</td>
            <td className="px-4 py-3">
              {c.defaultValidityDays === null
                ? t("noExpiry")
                : t("days", { count: c.defaultValidityDays })}
            </td>
            <td className="px-4 py-3">
              <StatusPill active={c.isActive} label={c.isActive ? t("active") : t("inactive")} />
            </td>
            <td className="px-4 py-3 tabular-nums">{c.consents}</td>
            <td className="px-4 py-3">
              <div className="flex flex-wrap justify-end gap-1.5">
                <Button variant="secondary" size="sm" onClick={() => open(c)}>
                  <Pencil aria-hidden className="size-3.5" />
                  {t("edit")}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={pending}
                  onClick={() =>
                    run(
                      () => updateConsentTypeAction(c.id, { isActive: !c.isActive }),
                      t("toast.updated"),
                    )
                  }
                >
                  {c.isActive ? t("deactivate") : t("activate")}
                </Button>
              </div>
            </td>
          </tr>
        ))}
      </CatalogTable>

      <Modal
        open={editing !== null}
        title={editing === "new" ? t("addTitle") : t("editTitle")}
        closeLabel={t("cancel")}
        onClose={() => setEditing(null)}
        busy={pending}
      >
        <form onSubmit={save} className="flex flex-col gap-4" noValidate>
          <Field
            label={t("nameEs")}
            name="nameEs"
            defaultValue={current?.nameEs}
            maxLength={80}
            required
            autoFocus
            error={fieldError(errors.nameEs)}
          />
          <Field
            label={t("nameEn")}
            name="nameEn"
            defaultValue={current?.nameEn}
            maxLength={80}
            required
            error={fieldError(errors.nameEn)}
          />
          <Field
            label={t("validity")}
            name="defaultValidityDays"
            type="number"
            inputMode="numeric"
            min={1}
            max={MAX_VALIDITY_DAYS}
            step={1}
            defaultValue={current?.defaultValidityDays ?? ""}
            hint={t("validityHint")}
            error={fieldError(errors.defaultValidityDays)}
          />
          <label className="flex items-center gap-2.5 text-sm">
            <input
              type="checkbox"
              name="requiresDocument"
              defaultChecked={current?.requiresDocument ?? false}
              className="size-4"
            />
            {t("requiresDocument")}
          </label>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setEditing(null)} disabled={pending}>
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={pending}>
              {t("save")}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
