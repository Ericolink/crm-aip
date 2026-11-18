"use client";

import { useEffect, useId, useRef } from "react";
import { Button } from "./button";

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel: string;
  pending?: boolean;
  pendingLabel?: string;
  tone?: "danger" | "primary";
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * Confirmación con el <dialog> nativo: atrapa el foco, se cierra con Esc
 * y es anunciado por lectores de pantalla sin librerías extra.
 */
export function ConfirmDialog(props: ConfirmDialogProps) {
  const {
    open,
    title,
    body,
    confirmLabel,
    cancelLabel,
    pending,
    pendingLabel,
    tone = "danger",
  } = props;
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const bodyId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={bodyId}
      onCancel={(e) => {
        e.preventDefault();
        if (!pending) props.onCancel();
      }}
      className="border-border bg-surface m-auto w-[calc(100%-2rem)] max-w-md rounded-xl border p-0 shadow-xl backdrop:bg-[rgba(20,26,38,0.45)]"
    >
      <div className="p-5">
        <h2 id={titleId} className="text-base font-semibold">
          {title}
        </h2>
        <p id={bodyId} className="text-muted mt-1.5 text-sm">
          {body}
        </p>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={props.onCancel}
            disabled={pending}
            autoFocus
          >
            {cancelLabel}
          </Button>
          <Button
            variant={tone === "danger" ? "danger" : "primary"}
            size="sm"
            onClick={props.onConfirm}
            disabled={pending}
          >
            {pending && pendingLabel ? pendingLabel : confirmLabel}
          </Button>
        </div>
      </div>
    </dialog>
  );
}
