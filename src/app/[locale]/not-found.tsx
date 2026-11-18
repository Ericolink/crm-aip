import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";

export default async function NotFound() {
  const t = await getTranslations("NotFound");
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 px-4 py-16 text-center">
      <h1 className="text-xl font-bold">{t("title")}</h1>
      <Link href="/" className="text-primary hover:text-primary-dark font-medium">
        {t("back")}
      </Link>
    </main>
  );
}
