"use client";

import { useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { useRouter } from "@/i18n/navigation";
import { authClient } from "@/lib/auth/client";
import { PASSWORD_POLICY } from "@/lib/auth/policy";
import { authErrorKey, type AuthErrorKey } from "@/modules/auth/auth-errors";

type FormError = AuthErrorKey | "tooShort" | "mismatch";

/**
 * Cambiar la contraseña. Con `forced`, es el paso obligatorio tras una contraseña puesta por
 * un administrador: al terminar continúa al sistema (o a configurar la 2FA si falta).
 */
export function ChangePasswordForm({ forced = false }: { forced?: boolean }) {
  const router = useRouter();
  const t = useTranslations("Account");
  const tErr = useTranslations("Errors");
  const [error, setError] = useState<FormError | null>(null);
  const [done, setDone] = useState(false);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formEl = event.currentTarget;
    const form = new FormData(formEl);
    const currentPassword = String(form.get("current") ?? "");
    const newPassword = String(form.get("next") ?? "");
    setDone(false);

    if (newPassword.length < PASSWORD_POLICY.minLength) return setError("tooShort");
    if (newPassword !== String(form.get("confirm") ?? "")) return setError("mismatch");
    if (newPassword === currentPassword) return setError("passwordReused");

    setPending(true);
    setError(null);
    const { error: authError } = await authClient.changePassword({
      currentPassword,
      newPassword,
      // Cambiar la contraseña cierra la sesión en los demás dispositivos.
      revokeOtherSessions: true,
    });
    setPending(false);
    if (authError) {
      const key = authErrorKey(authError);
      return setError(key === "invalidCredentials" ? "wrongPassword" : key);
    }
    formEl.reset();
    if (forced) {
      router.replace("/dashboard");
      router.refresh();
      return;
    }
    setDone(true);
  }

  const message =
    error === "tooShort"
      ? t("passwordTooShort", { min: PASSWORD_POLICY.minLength })
      : error === "mismatch"
        ? t("passwordMismatch")
        : error
          ? tErr(error)
          : null;

  return (
    <form onSubmit={onSubmit} className="flex max-w-sm flex-col gap-3" noValidate>
      {!forced && <h3 className="font-semibold">{t("changePassword")}</h3>}
      {message && <Alert tone="error">{message}</Alert>}
      {done && <Alert tone="success">{t("passwordChanged")}</Alert>}
      <Field
        label={forced ? t("temporaryPassword") : t("currentPassword")}
        name="current"
        type="password"
        autoComplete="current-password"
        required
      />
      <Field
        label={t("newPassword")}
        name="next"
        type="password"
        autoComplete="new-password"
        hint={t("passwordHint", { min: PASSWORD_POLICY.minLength })}
        minLength={PASSWORD_POLICY.minLength}
        required
      />
      <Field
        label={t("confirmPassword")}
        name="confirm"
        type="password"
        autoComplete="new-password"
        required
      />
      <Button type="submit" size="sm" disabled={pending} className={forced ? "" : "self-start"}>
        {pending ? t("savingPassword") : t("savePassword")}
      </Button>
    </form>
  );
}
