"use client";

import { ArrowDown, ArrowUp, Pencil, Plus } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import type { ActionResult } from "@/lib/action-result";
import { createConditionAction, moveConditionAction, updateConditionAction } from "../actions";
import { CatalogTable, StatusPill } from "./catalog-ui";

type Condition = { id: string; nameEs: string; nameEn: string; isActive: boolean; clients: number };
type Editing = Condition | "new" | null;

export function ConditionsManager({ conditions }: { conditions: Condition[] }) {
  const t = useTranslations("Settings.conditions");
  const tf = useTranslations("Settings.fieldErrors");
  const locale = useLocale();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState<Editing>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const name = (c: Condition) => (locale === "en" ? c.nameEn : c.nameEs);
  const fieldError = (code?: string) =>
    !code
      ? null
      : code === "duplicate"
        ? t("errors.conflict")
        : tf.has(code)
          ? tf(code as "required")
          : t("errors.invalid");

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
    const input = { nameEs: form.get("nameEs"), nameEn: form.get("nameEn") };
    run(
      () =>
        editing === "new"
          ? createConditionAction(input)
          : updateConditionAction((editing as Condition).id, input),
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

      <CatalogTable
        minWidth={640}
        headers={[
          { key: "order", label: t("columns.order") },
          { key: "condition", label: t("columns.condition") },
          { key: "status", label: t("columns.status") },
          { key: "clients", label: t("columns.clients") },
          { key: "actions", label: t("columns.actions"), srOnly: true },
        ]}
      >
        {conditions.map((c, i) => (
          <tr key={c.id} className={`border-b border-[#f1f3f6] ${c.isActive ? "" : "opacity-60"}`}>
            <td className="px-4 py-2">
              <div className="flex gap-1">
                <Button
                  variant="secondary"
                  size="sm"
                  aria-label={t("moveUp", { name: name(c) })}
                  disabled={pending || i === 0}
                  onClick={() => run(() => moveConditionAction(c.id, "up"), t("toast.updated"))}
                >
                  <ArrowUp aria-hidden className="size-3.5" />
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  aria-label={t("moveDown", { name: name(c) })}
                  disabled={pending || i === conditions.length - 1}
                  onClick={() => run(() => moveConditionAction(c.id, "down"), t("toast.updated"))}
                >
                  <ArrowDown aria-hidden className="size-3.5" />
                </Button>
              </div>
            </td>
            <td className="px-4 py-3">
              <div className="font-semibold">{name(c)}</div>
              <div className="text-muted text-xs">{locale === "en" ? c.nameEs : c.nameEn}</div>
            </td>
            <td className="px-4 py-3">
              <StatusPill active={c.isActive} label={c.isActive ? t("active") : t("inactive")} />
            </td>
            <td className="px-4 py-3 tabular-nums">{c.clients}</td>
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
                      () => updateConditionAction(c.id, { isActive: !c.isActive }),
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
