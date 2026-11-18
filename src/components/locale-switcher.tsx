"use client";

import { useLocale, useTranslations } from "next-intl";
import { useTransition } from "react";
import { usePathname, useRouter } from "@/i18n/navigation";
import { routing, type AppLocale } from "@/i18n/routing";

/** Selector EN / ES. Cambia el idioma sin salir de la página actual. */
export function LocaleSwitcher() {
  const t = useTranslations("Common");
  const current = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  function select(next: AppLocale) {
    if (next === current) return;
    startTransition(() => router.replace(pathname, { locale: next }));
  }

  return (
    <div
      role="group"
      aria-label={t("language")}
      className="border-border-strong bg-surface inline-flex gap-0.5 rounded-lg border p-[3px]"
    >
      {routing.locales.map((loc) => {
        const active = loc === current;
        return (
          <button
            key={loc}
            type="button"
            lang={loc}
            title={t(`languages.${loc}`)}
            aria-pressed={active}
            disabled={isPending}
            onClick={() => select(loc)}
            className={`h-[30px] min-w-10 cursor-pointer rounded-md px-2.5 text-xs font-semibold uppercase transition-colors disabled:opacity-60 ${
              active ? "bg-primary text-white" : "text-muted hover:bg-canvas"
            }`}
          >
            {loc}
          </button>
        );
      })}
    </div>
  );
}
