"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { signOutOtherSessions } from "../actions";

export function SignOutOthersButton() {
  const t = useTranslations("Account");
  const tErr = useTranslations("Errors");
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<"ok" | "error" | null>(null);

  return (
    <div className="flex flex-col items-start gap-3">
      <Button
        variant="secondary"
        size="sm"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const { ok } = await signOutOtherSessions();
            setResult(ok ? "ok" : "error");
          })
        }
      >
        {pending ? t("signingOutOthers") : t("signOutOthers")}
      </Button>
      {result === "ok" && <Alert tone="success">{t("signedOutOthers")}</Alert>}
      {result === "error" && <Alert tone="error">{tErr("generic")}</Alert>}
    </div>
  );
}
