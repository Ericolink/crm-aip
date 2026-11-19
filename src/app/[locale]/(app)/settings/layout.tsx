import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { SettingsNav, type SettingsSectionKey } from "@/components/app-shell/settings-nav";
import { hasPermission, requireUser } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/permissions/catalog";

export default async function SettingsLayout({ children }: { children: ReactNode }) {
  const t = await getTranslations("Settings");
  const user = await requireUser();
  const can = (p: (typeof PERMISSIONS)[keyof typeof PERMISSIONS]) => hasPermission(user, p);
  const allowed: SettingsSectionKey[] = [
    ...(can(PERMISSIONS.USER_MANAGE) ? (["users"] as const) : []),
    ...(can(PERMISSIONS.SETTINGS_MANAGE) ? (["carriers", "conditions", "consents"] as const) : []),
    ...(can(PERMISSIONS.AUDIT_READ) ? (["audit"] as const) : []),
  ];
  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <SettingsNav allowed={allowed} />
      {children}
    </div>
  );
}
