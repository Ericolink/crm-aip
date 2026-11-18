"use client";

import { LogOut } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { authClient, hardNavigate } from "@/lib/auth/client";

export function SignOutButton() {
  const t = useTranslations("Nav");
  const locale = useLocale();

  async function signOut() {
    await authClient.signOut();
    hardNavigate(`/${locale}/login?reason=signed_out`);
  }

  return (
    <button
      type="button"
      onClick={signOut}
      aria-label={t("signOut")}
      title={t("signOut")}
      className="inline-flex size-9 cursor-pointer items-center justify-center rounded-lg text-[#4a5366] hover:bg-[#f1f3f7]"
    >
      <LogOut aria-hidden className="size-[17px]" />
    </button>
  );
}
