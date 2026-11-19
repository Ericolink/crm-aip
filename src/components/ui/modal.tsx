"use client";

import { X } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";

/**
 * Ventana modal con el <dialog> nativo (foco atrapado, Esc para cerrar, accesible).
 * El contenido (normalmente un formulario) va como children.
 */
export function Modal({
  open,
  title,
  description,
  closeLabel,
  onClose,
  busy,
  children,
}: {
  open: boolean;
  title: string;
  description?: string;
  closeLabel: string;
  onClose: () => void;
  /** Mientras se guarda, no se puede cerrar. */
  busy?: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descId = useId();

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
      aria-describedby={description ? descId : undefined}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
      className="border-border bg-surface m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-xl overflow-y-auto rounded-xl border p-0 shadow-xl backdrop:bg-[rgba(20,26,38,0.45)]"
    >
      {open && (
        <div className="p-5 sm:p-6">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h2 id={titleId} className="text-lg font-semibold">
                {title}
              </h2>
              {description && (
                <p id={descId} className="text-muted mt-1 text-sm">
                  {description}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              aria-label={closeLabel}
              className="text-muted inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-lg hover:bg-[#f1f3f7]"
            >
              <X aria-hidden className="size-4" />
            </button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}
