import { ShieldCheck } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/auth/session";
import { SESSION_POLICY } from "@/lib/auth/policy";
import { ChangePasswordForm } from "@/modules/users/components/change-password-form";
import { SignOutOthersButton } from "@/modules/users/components/sign-out-others-button";

export default async function AccountPage() {
  const user = await requireUser();
  const locale = (await getLocale()) as "es" | "en";
  const t = await getTranslations("Account");
  const tc = await getTranslations("Common");

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <h1 className="text-2xl font-bold">{t("title")}</h1>

      <section className="border-border bg-surface rounded-xl border">
        <h2 className="border-b border-[#edf0f4] px-5 py-4 text-[15px] font-semibold">
          {t("profile")}
        </h2>
        <dl className="grid gap-4 px-5 py-4 sm:grid-cols-2">
          <div>
            <dt className="text-muted text-xs font-medium">{t("name")}</dt>
            <dd className="font-medium">{user.name}</dd>
          </div>
          <div>
            <dt className="text-muted text-xs font-medium">{t("email")}</dt>
            <dd className="font-medium break-all">{user.email}</dd>
          </div>
          <div>
            <dt className="text-muted text-xs font-medium">{t("role")}</dt>
            <dd className="font-medium">{user.roleName[locale]}</dd>
          </div>
          <div>
            <dt className="text-muted text-xs font-medium">{t("languageTitle")}</dt>
            <dd className="font-medium">
              {tc(`languages.${user.preferredLocale === "en" ? "en" : "es"}`)}
            </dd>
            <dd className="text-muted mt-1 text-xs">{t("languageHelp")}</dd>
          </div>
        </dl>
      </section>

      <section className="border-border bg-surface rounded-xl border">
        <h2 className="border-b border-[#edf0f4] px-5 py-4 text-[15px] font-semibold">
          {t("security")}
        </h2>
        <div className="flex flex-col gap-4 px-5 py-4">
          <p className="text-status-active-fg flex items-center gap-2 font-medium">
            <ShieldCheck aria-hidden className="size-5" />
            {t("twoFactorOn")}
          </p>
          <p className="text-muted text-sm">
            {t("sessionPolicy", {
              idle: SESSION_POLICY.idleTimeoutSeconds / 60,
              absolute: SESSION_POLICY.absoluteTimeoutSeconds / 3600,
            })}
          </p>
          <SignOutOthersButton />
          <hr className="border-[#edf0f4]" />
          <ChangePasswordForm />
        </div>
      </section>
    </div>
  );
}
