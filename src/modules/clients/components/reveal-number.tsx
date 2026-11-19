"use client";

import { Eye, EyeOff, Lock } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { maskLast4 } from "@/lib/crypto/sensitive-field";
import { revealInsuranceNumberAction } from "@/modules/insurance/actions";
import { revealBeneficiaryNumberAction } from "../actions";
import { formatBeneficiaryNumber } from "../identifiers";

const AUTO_HIDE_MS = 30_000;

/**
 * Muestra "•••• 1234". Con permiso, "Revelar" pide el valor al servidor (queda en auditoría)
 * y lo oculta otra vez a los 30 s. El valor nunca se guarda en el navegador.
 */
export type RevealTarget =
  | { kind: "beneficiary"; enrollmentId: string }
  | { kind: "insurance"; insuranceId: string; field: "member" | "confirmation" };

export function RevealNumber({
  target,
  last4,
  canReveal,
}: {
  target: RevealTarget;
  last4: string;
  canReveal: boolean;
}) {
  const t = useTranslations("Clients");
  const [value, setValue] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!value) return;
    const timer = window.setTimeout(() => setValue(null), AUTO_HIDE_MS);
    return () => window.clearTimeout(timer);
  }, [value]);

  function reveal() {
    startTransition(async () => {
      if (target.kind === "beneficiary") {
        const result = await revealBeneficiaryNumberAction(target.enrollmentId);
        if (result.ok)
          setValue(formatBeneficiaryNumber(result.data.programCode, result.data.value));
        else toast.error(t(`errors.${result.error}`));
      } else {
        const result = await revealInsuranceNumberAction(target.insuranceId, target.field);
        if (result.ok) setValue(result.data.value);
        else toast.error(t(`errors.${result.error}`));
      }
    });
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <span className="font-mono text-[15px]" aria-live="polite">
        {value ?? maskLast4(last4)}
      </span>
      {canReveal ? (
        <button
          type="button"
          onClick={value ? () => setValue(null) : reveal}
          disabled={pending}
          title={t("detail.revealNote")}
          className="border-border-strong hover:bg-canvas inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium disabled:opacity-60"
        >
          {value ? (
            <EyeOff aria-hidden className="size-3.5" />
          ) : (
            <Eye aria-hidden className="size-3.5" />
          )}
          {pending ? t("detail.revealing") : value ? t("detail.hide") : t("detail.reveal")}
        </button>
      ) : (
        <Lock aria-label={t("errors.forbidden")} className="text-muted size-3.5" />
      )}
    </span>
  );
}
