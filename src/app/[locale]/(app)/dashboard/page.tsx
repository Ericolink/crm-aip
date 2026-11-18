import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/auth/session";

/** Panel provisional. Los indicadores se construyen en la Etapa 9. */
export default async function DashboardPage() {
  const user = await requireUser();
  const t = await getTranslations("Dashboard");

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">{t("greeting", { name: user.name })}</h1>
      <p className="border-border bg-surface text-muted max-w-2xl rounded-xl border p-5">
        {t("stageNote")}
      </p>
    </div>
  );
}
