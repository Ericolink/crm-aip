"use client";

import {
  CalendarDays,
  LayoutDashboard,
  SlidersHorizontal,
  UserRound,
  Users,
  ArrowDownUp,
  type LucideIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";

export type NavItem = {
  key: "dashboard" | "clients" | "reminders" | "importExport" | "settings" | "account";
  href: string;
  /** false = módulo de una etapa futura: se muestra deshabilitado con la etiqueta "Pronto". */
  available: boolean;
};

const ICONS: Record<NavItem["key"], LucideIcon> = {
  dashboard: LayoutDashboard,
  clients: Users,
  reminders: CalendarDays,
  importExport: ArrowDownUp,
  settings: SlidersHorizontal,
  account: UserRound,
};

const itemClass =
  "flex h-10 items-center gap-2.5 rounded-lg px-3 text-sm font-medium text-[#333c4e] hover:bg-[#f1f3f7] hover:text-ink";

export function SidebarNav({ main, secondary }: { main: NavItem[]; secondary: NavItem[] }) {
  const t = useTranslations("Nav");
  const pathname = usePathname();

  function render(item: NavItem) {
    const Icon = ICONS[item.key];
    if (!item.available) {
      return (
        <span
          key={item.key}
          aria-disabled="true"
          className={`${itemClass} cursor-default opacity-55 hover:bg-transparent`}
        >
          <Icon aria-hidden className="size-[18px]" />
          {t(item.key)}
          <span className="ml-auto rounded-full bg-[#eef0f4] px-2 py-0.5 text-[11px] font-semibold text-[#3a4356]">
            {t("soon")}
          </span>
        </span>
      );
    }
    const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
    return (
      <Link
        key={item.key}
        href={item.href}
        aria-current={active ? "page" : undefined}
        className={`${itemClass} ${active ? "bg-primary-soft text-primary-dark font-semibold" : ""}`}
      >
        <Icon aria-hidden className="size-[18px]" />
        {t(item.key)}
      </Link>
    );
  }

  return (
    <>
      <nav aria-label={t("mainNav")} className="flex flex-col gap-0.5">
        {main.map(render)}
      </nav>
      <div className="min-h-6 flex-1" />
      <div className="flex flex-col gap-0.5">{secondary.map(render)}</div>
    </>
  );
}
