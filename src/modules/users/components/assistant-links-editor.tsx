"use client";

import { Link2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { linkAssistantAction, unlinkAssistantAction } from "../admin-actions";

type Person = { id: string; name: string; isActive: boolean };

/** Vínculos de un asistente: quitar (con confirmación) y agregar agentes. */
export function AssistantLinksEditor({
  assistant,
  linkedAgents,
  availableAgents,
}: {
  assistant: { id: string; name: string };
  linkedAgents: Person[];
  availableAgents: { id: string; name: string }[];
}) {
  const t = useTranslations("Settings.users");
  const selectId = useId();
  const [selected, setSelected] = useState("");
  const [toRemove, setToRemove] = useState<Person | null>(null);
  const [pending, startTransition] = useTransition();
  const options = availableAgents.filter((a) => !linkedAgents.some((l) => l.id === a.id));

  function link() {
    if (!selected) return;
    startTransition(async () => {
      const result = await linkAssistantAction(assistant.id, selected);
      if (result.ok) {
        toast.success(t("toast.linked"));
        setSelected("");
      } else toast.error(t(`errors.${result.error}`));
    });
  }

  function unlink() {
    if (!toRemove) return;
    startTransition(async () => {
      const result = await unlinkAssistantAction(assistant.id, toRemove.id);
      if (result.ok) toast.success(t("toast.unlinked"));
      else toast.error(t(`errors.${result.error}`));
      setToRemove(null);
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-muted text-xs">{t("linkedAgents")}</span>
        {linkedAgents.length === 0 && (
          <span className="text-muted text-xs italic">{t("noLinks")}</span>
        )}
        {linkedAgents.map((agent) => (
          <span
            key={agent.id}
            className={`inline-flex h-7 items-center gap-1 rounded-md border pr-0.5 pl-2 text-xs font-medium ${
              agent.isActive
                ? "border-border-strong bg-primary-soft text-primary-dark"
                : "border-border text-muted line-through"
            }`}
          >
            {agent.name}
            <button
              type="button"
              aria-label={t("remove", { name: agent.name })}
              onClick={() => setToRemove(agent)}
              className="inline-flex size-6 cursor-pointer items-center justify-center rounded hover:bg-white/70"
            >
              <X aria-hidden className="size-3.5" />
            </button>
          </span>
        ))}
      </div>
      {options.length > 0 && (
        <div className="flex items-center gap-1.5">
          <label htmlFor={selectId} className="sr-only">
            {t("chooseAgent")}
          </label>
          <select
            id={selectId}
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="border-border-strong bg-surface h-8 rounded-md border px-2 text-xs"
          >
            <option value="">{t("chooseAgent")}</option>
            {options.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <Button
            size="sm"
            variant="secondary"
            className="h-8"
            disabled={!selected || pending}
            onClick={link}
          >
            <Link2 aria-hidden className="size-3.5" />
            {t("link")}
          </Button>
        </div>
      )}
      <ConfirmDialog
        open={toRemove !== null}
        title={t("confirmTitle")}
        body={t("confirmBody", { assistant: assistant.name, agent: toRemove?.name ?? "" })}
        confirmLabel={t("confirm")}
        cancelLabel={t("cancel")}
        pendingLabel={t("removing")}
        pending={pending}
        onConfirm={unlink}
        onCancel={() => setToRemove(null)}
      />
    </div>
  );
}
