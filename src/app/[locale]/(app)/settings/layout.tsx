import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { SettingsNav } from "@/components/app-shell/settings-nav";

export default async function SettingsLayout({ children }: { children: ReactNode }) {
  const t = await getTranslations("Settings");
  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <SettingsNav />
      {children}
    </div>
  );
}
