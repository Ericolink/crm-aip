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
import { createCarrierAction, setCarrierProgramAction, updateCarrierAction } from "../actions";

type Program = { id: string; code: string; nameEs: string; nameEn: string };
type Carrier = {
  id: string;
  name: string;
  isActive: boolean;
  programCodes: string[];
  currentCoverages: number;
};

export function CarriersManager({
  programs,
  carriers,
}: {
  programs: Program[];
  carriers: Carrier[];
}) {
  const t = useTranslations("Settings.carriers");
  const locale = useLocale();
  const [pending, startTransition] = useTransition();
  const [newName, setNewName] = useState("");
  const [renaming, setRenaming] = useState<Carrier | null>(null);
  const [renameError, setRenameError] = useState<string | null>(null);
  const programName = (p: Program) => (locale === "en" ? p.nameEn : p.nameEs);
  const noLinks = carriers.every((c) => c.programCodes.length === 0);

  function run(action: () => Promise<ActionResult<unknown>>, success: string, onDone?: () => void) {
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        toast.success(success);
        onDone?.();
      } else {
        toast.error(t(`errors.${result.error}`));
      }
    });
  }

  function add(e: FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    run(
      () => createCarrierAction(newName),
      t("toast.created"),
      () => setNewName(""),
    );
  }

  function rename(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!renaming) return;
    const name = String(new FormData(e.currentTarget).get("name") ?? "");
    startTransition(async () => {
      const result = await updateCarrierAction(renaming.id, { name });
      if (result.ok) {
        toast.success(t("toast.updated"));
        setRenaming(null);
      } else {
        setRenameError(t(`errors.${result.error}`));
      }
    });
  }

  return (
    <div className="flex flex-col gap-4" aria-busy={pending}>
      <div className="max-w-3xl">
        <h2 className="text-lg font-semibold">{t("title")}</h2>
        <p className="text-muted mt-1 text-sm">{t("subtitle")}</p>
      </div>

      {noLinks && <Alert tone="info">{t("noLinks")}</Alert>}

      <form onSubmit={add} className="flex max-w-md items-end gap-2">
        <div className="flex-1">
          <Field
            label={t("add")}
            placeholder={t("addPlaceholder")}
            value={newName}
            maxLength={80}
            onChange={(e) => setNewName(e.target.value)}
          />
        </div>
        <Button type="submit" disabled={pending || !newName.trim()}>
          <Plus aria-hidden className="size-4" />
          {pending ? t("adding") : t("add")}
        </Button>
      </form>

      <section className="border-border bg-surface rounded-xl border">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold text-[#4a5366]">
                <th scope="col" className="border-border border-b bg-[#f8f9fb] px-4 py-2.5">
                  {t("columns.carrier")}
                </th>
                {programs.map((p) => (
                  <th
                    key={p.code}
                    scope="col"
                    className="border-border border-b bg-[#f8f9fb] px-4 py-2.5"
                  >
                    {programName(p)}
                  </th>
                ))}
                <th scope="col" className="border-border border-b bg-[#f8f9fb] px-4 py-2.5">
                  {t("columns.status")}
                </th>
                <th scope="col" className="border-border border-b bg-[#f8f9fb] px-4 py-2.5">
                  {t("columns.current")}
                </th>
                <th scope="col" className="border-border border-b bg-[#f8f9fb] px-4 py-2.5">
                  <span className="sr-only">{t("columns.actions")}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {carriers.map((c) => (
                <tr
                  key={c.id}
                  className={`border-b border-[#f1f3f6] ${c.isActive ? "" : "opacity-60"}`}
                >
                  <td className="px-4 py-3 font-semibold">{c.name}</td>
                  {programs.map((p) => {
                    const on = c.programCodes.includes(p.code);
                    return (
                      <td key={p.code} className="px-4 py-3">
                        <button
                          type="button"
                          role="switch"
                          aria-checked={on}
                          aria-label={t("toggle", { carrier: c.name, program: programName(p) })}
                          disabled={pending}
                          onClick={() =>
                            run(() => setCarrierProgramAction(c.id, p.code, !on), t("toast.linked"))
                          }
                          className={`relative h-[26px] w-11 cursor-pointer rounded-full transition-colors disabled:cursor-wait ${
                            on ? "bg-primary" : "bg-[#cbd1dc]"
                          }`}
                        >
                          <span
                            aria-hidden
                            className={`absolute top-[3px] size-5 rounded-full bg-white shadow transition-[left] ${on ? "left-[21px]" : "left-[3px]"}`}
                          />
                        </button>
                      </td>
                    );
                  })}
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex h-6 items-center rounded-full px-2.5 text-xs font-semibold ${
                        c.isActive
                          ? "bg-status-active-bg text-status-active-fg"
                          : "bg-[#eef0f4] text-[#3a4356]"
                      }`}
                    >
                      {c.isActive ? t("active") : t("inactive")}
                    </span>
                  </td>
                  <td className="px-4 py-3">{c.currentCoverages}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap justify-end gap-1.5">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          setRenameError(null);
                          setRenaming(c);
                        }}
                      >
                        <Pencil aria-hidden className="size-3.5" />
                        {t("rename")}
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={pending}
                        onClick={() =>
                          run(
                            () => updateCarrierAction(c.id, { isActive: !c.isActive }),
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
            </tbody>
          </table>
        </div>
      </section>

      <section className="border-border bg-surface max-w-3xl rounded-xl border p-5">
        <h3 className="text-[15px] font-semibold">{t("rules.title")}</h3>
        <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-5 text-sm">
          <li>{t("rules.r1")}</li>
          <li>{t("rules.r2")}</li>
          <li>{t("rules.r3")}</li>
          <li>{t("rules.r4")}</li>
        </ul>
      </section>

      <Modal
        open={renaming !== null}
        title={t("renameTitle", { name: renaming?.name ?? "" })}
        closeLabel={t("cancel")}
        onClose={() => setRenaming(null)}
        busy={pending}
      >
        <form onSubmit={rename} className="flex flex-col gap-4" noValidate>
          <Field
            label={t("columns.carrier")}
            name="name"
            defaultValue={renaming?.name}
            maxLength={80}
            error={renameError}
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setRenaming(null)} disabled={pending}>
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
