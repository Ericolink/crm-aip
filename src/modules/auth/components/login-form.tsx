"use client";

import { LockKeyhole } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { authClient, hardNavigate } from "@/lib/auth/client";
import { SESSION_POLICY } from "@/lib/auth/policy";
import { routing } from "@/i18n/routing";
import { authErrorKey, type AuthErrorKey } from "../auth-errors";

type Step = "credentials" | "totp" | "backup";
const REASONS = ["idle", "expired", "inactive", "signed_out"] as const;
type Reason = (typeof REASONS)[number];

function isReason(value: string | null): value is Reason {
  return value !== null && (REASONS as readonly string[]).includes(value);
}

/** Navegación completa (no SPA) para que el servidor lea la sesión recién creada. */
function goToApp(preferredLocale: unknown, fallbackLocale: string) {
  const locale =
    typeof preferredLocale === "string" &&
    (routing.locales as readonly string[]).includes(preferredLocale)
      ? preferredLocale
      : fallbackLocale;
  hardNavigate(`/${locale}/dashboard`);
}

export function LoginForm() {
  const t = useTranslations("Login");
  const tErr = useTranslations("Errors");
  const locale = useLocale();
  const reasonParam = useSearchParams().get("reason");
  const reason = isReason(reasonParam) ? reasonParam : null;

  const [step, setStep] = useState<Step>("credentials");
  const [error, setError] = useState<AuthErrorKey | null>(null);
  const [pending, setPending] = useState(false);
  const [trustDevice, setTrustDevice] = useState(false);

  async function onCredentials(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError(null);
    const { data, error: authError } = await authClient.signIn.email({
      email: String(form.get("email") ?? "").trim(),
      password: String(form.get("password") ?? ""),
    });
    setPending(false);
    if (authError) return setError(authErrorKey(authError));
    if (data && "twoFactorRedirect" in data && data.twoFactorRedirect) return setStep("totp");
    goToApp(data && "user" in data ? data.user.preferredLocale : null, locale);
  }

  async function onCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = String(new FormData(event.currentTarget).get("code") ?? "").trim();
    setPending(true);
    setError(null);
    const result =
      step === "totp"
        ? await authClient.twoFactor.verifyTotp({ code, trustDevice })
        : await authClient.twoFactor.verifyBackupCode({ code, trustDevice });
    setPending(false);
    if (result.error) {
      const key = authErrorKey(result.error);
      if (key === "sessionStep") setStep("credentials");
      return setError(key);
    }
    goToApp(result.data?.user?.preferredLocale, locale);
  }

  if (step === "credentials") {
    return (
      <form onSubmit={onCredentials} className="flex flex-col gap-4" noValidate>
        <div>
          <h2 className="text-[22px] font-bold">{t("title")}</h2>
          <p className="text-muted mt-1">{t("subtitle")}</p>
        </div>
        {reason && !error && (
          <Alert
            tone={reason === "signed_out" ? "success" : reason === "inactive" ? "error" : "info"}
          >
            {t(`reasons.${reason}`)}
          </Alert>
        )}
        {error && <Alert tone="error">{tErr(error)}</Alert>}
        <Field label={t("email")} name="email" type="email" autoComplete="username" required />
        <Field
          label={t("password")}
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
        <Button type="submit" disabled={pending}>
          {pending ? t("submitting") : t("submit")}
        </Button>
        <p className="text-muted text-center text-xs">
          {t("footer", { minutes: SESSION_POLICY.idleTimeoutSeconds / 60 })}
        </p>
      </form>
    );
  }

  const isTotp = step === "totp";
  return (
    <form onSubmit={onCode} className="flex flex-col gap-4" noValidate key={step}>
      <div className="bg-primary-soft text-primary flex size-11 items-center justify-center rounded-xl">
        <LockKeyhole aria-hidden className="size-5" />
      </div>
      <div>
        <h2 className="text-[22px] font-bold">{t("otpTitle")}</h2>
        <p className="text-muted mt-1">{isTotp ? t("otpSubtitle") : t("backupSubtitle")}</p>
      </div>
      {error && <Alert tone="error">{tErr(error)}</Alert>}
      <Field
        label={isTotp ? t("otpLabel") : t("backupLabel")}
        name="code"
        autoComplete="one-time-code"
        inputMode={isTotp ? "numeric" : "text"}
        maxLength={isTotp ? 6 : 20}
        className="font-mono text-lg tracking-[0.3em]"
        autoFocus
        required
      />
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="size-4"
          checked={trustDevice}
          onChange={(e) => setTrustDevice(e.target.checked)}
        />
        {t("trustDevice", { days: SESSION_POLICY.trustedDeviceDays })}
      </label>
      <Button type="submit" disabled={pending}>
        {pending ? t("verifying") : t("verify")}
      </Button>
      <Button
        variant="ghost"
        onClick={() => {
          setError(null);
          setStep(isTotp ? "backup" : "totp");
        }}
      >
        {isTotp ? t("useBackup") : t("useTotp")}
      </Button>
    </form>
  );
}
