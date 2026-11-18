import { getTranslations } from "next-intl/server";
import { LocaleSwitcher } from "@/components/locale-switcher";

/**
 * Página temporal de la Etapa 0. En la Etapa 1 se reemplaza por la redirección
 * al login o al dashboard según la sesión.
 */
export default async function HomePage() {
  const t = await getTranslations("Home");

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-6 px-4 py-16">
      <div className="flex justify-end">
        <LocaleSwitcher />
      </div>
      <section className="border-border bg-surface rounded-xl border p-8">
        <p className="text-muted text-sm font-medium">CRM · Alejandro Alcazar</p>
        <h1 className="mt-1 text-2xl font-bold">{t("title")}</h1>
        <p className="text-muted mt-2">{t("subtitle")}</p>
        <p className="mt-6 text-sm">{t("nextStep")}</p>
        <p className="text-muted mt-2 text-sm">
          {t("sampleDate", { date: new Date("2026-11-18T12:00:00Z") })}
        </p>
      </section>
    </main>
  );
}
