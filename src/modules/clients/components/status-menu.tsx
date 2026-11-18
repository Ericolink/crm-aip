"use client";

import { Check, ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { updateClientStatusAction } from "../actions";
import { CLIENT_STATUSES } from "../schema";
import { StatusBadge } from "./status-badge";

type Status = (typeof CLIENT_STATUSES)[number];

/**
 * Estatus editable desde la tabla. Muestra el cambio al instante y, si el servidor lo
 * rechaza, vuelve al valor anterior y avisa.
 */
export function StatusMenu({
  clientId,
  clientName,
  status,
}: {
  clientId: string;
  clientName: string;
  status: Status;
}) {
  const t = useTranslations("Clients");
  const [current, setCurrent] = useState<Status>(status);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function choose(next: Status) {
    setOpen(false);
    if (next === current) return;
    const previous = current;
    setCurrent(next);
    startTransition(async () => {
      const result = await updateClientStatusAction(clientId, next);
      if (result.ok) {
        toast.success(t("statusMenu.changed", { status: t(`status.${next}`) }));
      } else {
        setCurrent(previous);
        toast.error(t(`errors.${result.error}`));
      }
    });
  }

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={t("statusMenu.label", { name: clientName })}
        disabled={pending}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex cursor-pointer items-center gap-0.5 rounded-full disabled:opacity-60"
      >
        <StatusBadge status={current} label={t(`status.${current}`)} />
        <ChevronDown aria-hidden className="text-muted size-3.5" />
      </button>
      {open && (
        <div
          id={menuId}
          role="menu"
          className="border-border bg-surface absolute top-8 left-0 z-20 flex w-44 flex-col gap-0.5 rounded-xl border p-1.5 shadow-lg"
        >
          {CLIENT_STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              role="menuitemradio"
              aria-checked={s === current}
              onClick={() => choose(s)}
              className="flex h-9 cursor-pointer items-center justify-between rounded-md px-2 hover:bg-[#f1f3f7]"
            >
              <StatusBadge status={s} label={t(`status.${s}`)} />
              {s === current && <Check aria-hidden className="text-primary size-4" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
