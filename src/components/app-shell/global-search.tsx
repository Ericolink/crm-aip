"use client";

import { Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "@/i18n/navigation";

/** Buscador general de la barra superior. Ctrl/⌘ + K lo enfoca; Enter abre la lista filtrada. */
export function GlobalSearch() {
  const t = useTranslations("GlobalSearch");
  const router = useRouter();
  const [q, setQ] = useState("");
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        input.current?.focus();
        input.current?.select();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        const value = q.trim();
        router.push(value ? `/clients?q=${encodeURIComponent(value)}` : "/clients");
      }}
      className="relative flex min-w-0 flex-[1_1_280px] items-center sm:max-w-[520px]"
    >
      <label className="sr-only" htmlFor="global-search">
        {t("label")}
      </label>
      <Search aria-hidden className="text-muted absolute left-3 size-4" />
      <input
        ref={input}
        id="global-search"
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={t("placeholder")}
        autoComplete="off"
        spellCheck={false}
        aria-describedby="global-search-hint"
        className="border-border-strong focus:border-primary focus:bg-surface focus:ring-primary-soft h-10 w-full rounded-lg border bg-[#f8f9fb] pr-16 pl-9 text-sm outline-none focus:ring-3"
      />
      <kbd
        id="global-search-hint"
        aria-label={t("shortcut")}
        className="border-border-strong text-muted absolute right-2 hidden rounded-md border bg-[#f8f9fb] px-1.5 py-0.5 text-[11px] font-medium sm:inline"
      >
        Ctrl K
      </kbd>
    </form>
  );
}
