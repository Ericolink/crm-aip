import { getLocale, getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { requireUser } from "@/lib/auth/session";
import { redirect } from "@/i18n/navigation";
import { TwoFactorSetup } from "@/modules/auth/components/two-factor-setup";

/** Solo accesible con sesión. Si la 2FA ya está activa, no hay nada que configurar. */
async function SetupGate() {
  const user = await requireUser({ allowWithoutTwoFactor: true });
  if (user.twoFactorEnabled) {
    return redirect({ href: "/dashboard", locale: await getLocale() });
  }
  return <TwoFactorSetup />;
}

export default async function SetupTwoFactorPage() {
  const tc = await getTranslations("Common");
  return (
    <main className="bg-canvas flex min-h-screen flex-col p-4 sm:p-8">
      <div className="flex justify-end">
        <LocaleSwitcher />
      </div>
      <div className="flex flex-1 items-start justify-center py-6 sm:items-center">
        <div className="border-border bg-surface w-full max-w-[460px] rounded-2xl border p-6 sm:p-8">
          <Suspense fallback={<p className="text-muted">{tc("loading")}</p>}>
            <SetupGate />
          </Suspense>
        </div>
      </div>
    </main>
  );
}
