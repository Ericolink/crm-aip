import { KeyRound } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { SignOutButton } from "@/components/app-shell/sign-out-button";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { requireUser } from "@/lib/auth/session";
import { redirect } from "@/i18n/navigation";
import { ChangePasswordForm } from "@/modules/users/components/change-password-form";

/**
 * Cambio obligatorio tras una contraseña puesta por un administrador (alta o restablecimiento).
 * Hasta completarlo, ninguna otra pantalla del sistema está disponible.
 */
async function ChangeGate() {
  const user = await requireUser({ allowWithoutTwoFactor: true, allowPendingPasswordChange: true });
  if (!user.mustChangePassword) {
    return redirect({ href: "/dashboard", locale: await getLocale() });
  }
  const t = await getTranslations("Account");
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <span className="bg-primary-soft text-primary-dark inline-flex size-10 shrink-0 items-center justify-center rounded-full">
          <KeyRound aria-hidden className="size-5" />
        </span>
        <div>
          <h1 className="text-xl font-bold">{t("forcedTitle")}</h1>
          <p className="text-muted mt-1 text-sm">{t("forcedBody", { name: user.name })}</p>
        </div>
      </div>
      <ChangePasswordForm forced />
    </div>
  );
}

export default async function ForcedPasswordChangePage() {
  const tc = await getTranslations("Common");
  return (
    <main className="bg-canvas flex min-h-screen flex-col p-4 sm:p-8">
      <div className="flex justify-end gap-2">
        <LocaleSwitcher />
        <SignOutButton />
      </div>
      <div className="flex flex-1 items-start justify-center py-6 sm:items-center">
        <div className="border-border bg-surface w-full max-w-[460px] rounded-2xl border p-6 sm:p-8">
          <Suspense fallback={<p className="text-muted">{tc("loading")}</p>}>
            <ChangeGate />
          </Suspense>
        </div>
      </div>
    </main>
  );
}
