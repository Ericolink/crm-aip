"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";

const SECTIONS = [
  { key: "users", href: "/settings/users" },
  { key: "carriers", href: "/settings/carriers" },
  { key: "conditions", href: "/settings/conditions" },
  { key: "consents", href: "/settings/consents" },
] as const;

export function SettingsNav() {
  const t = useTranslations("Settings.nav");
  const pathname = usePathname();
  return (
    <nav aria-label={t("label")} className="flex flex-wrap gap-1.5">
      {SECTIONS.map((s) => {
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
