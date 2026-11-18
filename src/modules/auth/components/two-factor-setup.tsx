"use client";

import { Check, Copy, Download } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import QRCode from "qrcode";
import { useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { authClient, hardNavigate } from "@/lib/auth/client";
import { authErrorKey, type AuthErrorKey } from "../auth-errors";

type Enrollment = { qrDataUrl: string; manualKey: string; backupCodes: string[] };
type Step = "password" | "verify" | "backup";

export function TwoFactorSetup() {
  const t = useTranslations("Setup2FA");
  const tc = useTranslations("Common");
  const tErr = useTranslations("Errors");
  const locale = useLocale();

  const [step, setStep] = useState<Step>("password");
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [error, setError] = useState<AuthErrorKey | null>(null);
  const [pending, setPending] = useState(false);
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);

  async function onPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const password = String(new FormData(event.currentTarget).get("password") ?? "");
    setPending(true);
    setError(null);
    const { data, error: authError } = await authClient.twoFactor.enable({ password });
    if (authError || !data || !("totpURI" in data)) {
      setPending(false);
      return setError(authErrorKey(authError));
    }
    const qrDataUrl = await QRCode.toDataURL(data.totpURI, { margin: 1, width: 208 });
    const manualKey = new URL(data.totpURI).searchParams.get("secret") ?? "";
    setEnrollment({ qrDataUrl, manualKey, backupCodes: data.backupCodes });
    setPending(false);
    setStep("verify");
  }

  async function onVerify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = String(new FormData(event.currentTarget).get("code") ?? "").trim();
    setPending(true);
    setError(null);
    const { error: authError } = await authClient.twoFactor.verifyTotp({ code });
    setPending(false);
    if (authError) return setError(authErrorKey(authError));
    setStep("backup");
  }

  async function copyCodes() {
    if (!enrollment) return;
    await navigator.clipboard.writeText(enrollment.backupCodes.join("\n"));
    setCopied(true);
  }

  function downloadCodes() {
    if (!enrollment) return;
    const blob = new Blob([enrollment.backupCodes.join("\n") + "\n"], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "crm-codigos-respaldo.txt";
    link.click();
    URL.revokeObjectURL(url);
  }

  async function signOut() {
    await authClient.signOut();
    hardNavigate(`/${locale}/login?reason=signed_out`);
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[22px] font-bold">{t("title")}</h1>
        <p className="text-muted mt-1">{t("intro")}</p>
      </div>
      {error && <Alert tone="error">{tErr(error)}</Alert>}

      {step === "password" && (
        <form onSubmit={onPassword} className="flex flex-col gap-4" noValidate>
          <Field
            label={t("passwordLabel")}
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
          <Button type="submit" disabled={pending}>
            {pending ? t("starting") : t("start")}
          </Button>
        </form>
      )}

      {step === "verify" && enrollment && (
        <form onSubmit={onVerify} className="flex flex-col gap-5" noValidate>
          <section className="flex flex-col gap-3">
            <h2 className="font-semibold">{t("scanTitle")}</h2>
            <p className="text-muted text-sm">{t("scanHelp")}</p>
            {/* eslint-disable-next-line @next/next/no-img-element -- data URL local, no optimizable */}
            <img
              src={enrollment.qrDataUrl}
              alt={t("qrAlt")}
              width={208}
              height={208}
              className="border-border self-center rounded-lg border"
            />
            <p className="text-muted text-xs">{t("manualKey")}</p>
            <code className="bg-canvas rounded-md px-3 py-2 font-mono text-sm break-all">
              {enrollment.manualKey}
            </code>
          </section>
          <section className="flex flex-col gap-3">
            <h2 className="font-semibold">{t("confirmTitle")}</h2>
            <Field
              label={t("codeLabel")}
              name="code"
              autoComplete="one-time-code"
              inputMode="numeric"
              maxLength={6}
              className="font-mono text-lg tracking-[0.3em]"
              required
            />
            <Button type="submit" disabled={pending}>
              {pending ? t("confirming") : t("confirm")}
            </Button>
          </section>
        </form>
      )}

      {step === "backup" && enrollment && (
        <section className="flex flex-col gap-4">
          <Alert tone="success">{t("backupTitle")}</Alert>
          <p className="text-muted text-sm">{t("backupHelp")}</p>
          <ul className="border-border bg-canvas grid grid-cols-2 gap-2 rounded-lg border p-4 font-mono text-sm">
            {enrollment.backupCodes.map((code) => (
              <li key={code}>{code}</li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={copyCodes}>
              {copied ? (
                <Check aria-hidden className="size-4" />
              ) : (
                <Copy aria-hidden className="size-4" />
              )}
              {copied ? tc("copied") : tc("copy")}
            </Button>
            <Button variant="secondary" size="sm" onClick={downloadCodes}>
              <Download aria-hidden className="size-4" />
              {tc("download")}
            </Button>
          </div>
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              className="size-4"
              checked={saved}
              onChange={(e) => setSaved(e.target.checked)}
            />
            {t("backupSaved")}
          </label>
          <Button disabled={!saved} onClick={() => hardNavigate(`/${locale}/dashboard`)}>
            {t("finish")}
          </Button>
        </section>
      )}

      {step !== "backup" && (
        <Button variant="ghost" onClick={signOut}>
          {t("signOut")}
        </Button>
      )}
    </div>
  );
}
