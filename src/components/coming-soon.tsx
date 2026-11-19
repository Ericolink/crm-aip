import { Hammer } from "lucide-react";
import { getTranslations } from "next-intl/server";

/** Sección del perfil que se construye en una etapa posterior. */
export async function ComingSoon({ stage }: { stage: number }) {
  const t = await getTranslations("Profile");
  return (
    <div className="border-border-strong bg-surface flex flex-col items-center gap-2 rounded-xl border border-dashed p-10 text-center">
      <Hammer aria-hidden className="text-muted size-6" />
      <p className="text-muted text-sm">{t("comingSoon", { stage })}</p>
    </div>
  );
}
