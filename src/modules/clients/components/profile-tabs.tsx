"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";

export type ProfileTab =
  "overview" | "insurance" | "doctors" | "medications" | "notes" | "activity";

/** Pestañas del perfil como enlaces (cada una es una ruta: se puede compartir y usar "atrás"). */
export function ProfileTabs({ clientId, tabs }: { clientId: string; tabs: ProfileTab[] }) {
  const t = useTranslations("Profile.tabs");
  const pathname = usePathname();
  const base = `/clients/${clientId}`;

  return (
    <nav aria-label={t("label")} className="flex overflow-x-auto border-t border-[#edf0f4] px-5">
      {tabs.map((tab) => {
        const href = tab === "overview" ? base : `${base}/${tab}`;
        const active = tab === "overview" ? pathname === base : pathname.startsWith(href);
        return (
          <Link
            key={tab}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`mr-5 inline-flex h-11 shrink-0 items-center border-b-2 px-1 text-sm whitespace-nowrap ${
              active
                ? "border-primary text-primary-dark font-semibold"
                : "hover:text-ink border-transparent font-medium text-[#4a5366]"
            }`}
          >
            {t(tab)}
          </Link>
        );
      })}
    </nav>
  );
}
