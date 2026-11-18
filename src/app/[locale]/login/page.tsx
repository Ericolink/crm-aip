import { ShieldCheck } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { LoginForm } from "@/modules/auth/components/login-form";

export default async function LoginPage() {
  const t = await getTranslations("Login");
  const tc = await getTranslations("Common");

  return (
    <div className="bg-canvas flex min-h-screen flex-wrap">
      <aside className="bg-primary-dark flex flex-[1_1_420px] flex-col justify-between gap-8 p-8 text-white sm:p-12">
        <div className="flex items-center gap-3">
          <div className="text-primary-dark flex size-10 items-center justify-center rounded-[10px] bg-white font-bold">
            AA
          </div>
          <span className="font-semibold">CRM · Alejandro Alcazar</span>
        </div>
        <div className="max-w-md">
          <h1 className="text-3xl leading-tight font-bold">{t("hero")}</h1>
          <p className="mt-3 text-[15px] text-[#c9d4f2]">{t("heroSub")}</p>
        </div>
        <p className="flex items-center gap-2 text-[13px] text-[#c9d4f2]">
          <ShieldCheck aria-hidden className="size-4" />
          {t("secure")}
        </p>
      </aside>

      <main className="flex min-w-0 flex-[999_1_520px] flex-col p-4 sm:p-8">
        <div className="flex justify-end">
          <LocaleSwitcher />
        </div>
        <div className="flex flex-1 items-center justify-center py-6">
          <div className="border-border bg-surface w-full max-w-[400px] rounded-2xl border p-6 sm:p-8">
            <Suspense fallback={<p className="text-muted">{tc("loading")}</p>}>
              <LoginForm />
            </Suspense>
          </div>
        </div>
      </main>
    </div>
  );
}
