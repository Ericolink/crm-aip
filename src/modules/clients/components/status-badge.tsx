import { TriangleAlert } from "lucide-react";

const STYLES: Record<string, string> = {
  NEW: "bg-status-new-bg text-status-new-fg",
  PENDING: "bg-status-pending-bg text-status-pending-fg",
  ACTIVE: "bg-status-active-bg text-status-active-fg",
  URGENT: "bg-status-urgent-bg text-status-urgent-fg",
};

/** Etiqueta de estatus. El color nunca es la única señal: siempre lleva texto, y "Urgente" un ícono. */
export function StatusBadge({ status, label }: { status: string; label: string }) {
  return (
    <span
      className={`inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold whitespace-nowrap ${
        STYLES[status] ?? "bg-[#eef0f4] text-[#3a4356]"
      }`}
    >
      {status === "URGENT" ? (
        <TriangleAlert aria-hidden className="size-3" strokeWidth={2.5} />
      ) : (
        <span aria-hidden className="size-[7px] rounded-full bg-current" />
      )}
      {label}
    </span>
  );
}
