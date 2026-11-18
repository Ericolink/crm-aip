import { ShieldX } from "lucide-react";
import { getTranslations } from "next-intl/server";

/** Pantalla para cuando el rol del usuario no permite ver una sección. */
export async function Forbidden() {
  const t = await getTranslations("Clients.errors");
  return (
    <div className="border-border bg-surface flex max-w-xl flex-col items-center gap-3 rounded-xl border p-8 text-center">
      <ShieldX aria-hidden className="text-muted size-8" />
      <p className="font-medium">{t("forbidden")}</p>
    </div>
  );
}
