"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";

export const SETTINGS_SECTIONS = [
  { key: "users", href: "/settings/users" },
  { key: "carriers", href: "/settings/carriers" },
  { key: "conditions", href: "/settings/conditions" },
  { key: "consents", href: "/settings/consents" },
  { key: "audit", href: "/settings/audit" },
] as const;
export type SettingsSectionKey = (typeof SETTINGS_SECTIONS)[number]["key"];

/** Solo muestra las secciones que el rol permite (las decide el layout en el servidor). */
export function SettingsNav({ allowed }: { allowed: readonly SettingsSectionKey[] }) {
  const t = useTranslations("Settings.nav");
  const pathname = usePathname();
  return (
    <nav aria-label={t("label")} className="flex flex-wrap gap-1.5">
      {SETTINGS_SECTIONS.filter((s) => allowed.includes(s.key)).map((s) => {
        const active = pathname.startsWith(s.href);
        return (
          <Link
            key={s.key}
            href={s.href}
            aria-current={active ? "page" : undefined}
            className={`inline-flex h-10 items-center gap-2 rounded-lg px-3.5 text-sm font-medium ${
              active
                ? "border-border bg-surface text-primary-dark border font-semibold"
                : "text-[#333c4e] hover:bg-[#eef0f4]"
            }`}
          >
            {t(s.key)}
          </Link>
        );
      })}
    </nav>
  );
}
