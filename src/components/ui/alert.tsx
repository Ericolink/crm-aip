import { CircleAlert, CircleCheck, Info, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";

type Tone = "error" | "success" | "info" | "warning";

const tones: Record<Tone, { box: string; Icon: typeof Info }> = {
  error: { box: "border-[#f3b8b3] bg-[#fff8f7] text-status-urgent-fg", Icon: CircleAlert },
  success: { box: "border-[#b7e0c4] bg-[#f3fbf5] text-status-active-fg", Icon: CircleCheck },
  warning: {
    box: "border-[#f0d58a] bg-[#fffaeb] text-status-pending-fg",
    Icon: TriangleAlert,
  },
  info: { box: "border-[#c9d6f3] bg-primary-soft text-primary-dark", Icon: Info },
};

export function Alert({ tone = "info", children }: { tone?: Tone; children: ReactNode }) {
  const { box, Icon } = tones[tone];
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={`flex items-start gap-2.5 rounded-lg border px-3.5 py-3 text-sm ${box}`}
    >
      <Icon aria-hidden className="mt-0.5 size-4 shrink-0" />
      <div>{children}</div>
    </div>
  );
}
