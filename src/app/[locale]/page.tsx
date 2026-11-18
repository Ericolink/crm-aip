import { getLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";

/** La raíz de cada idioma lleva al panel (el proxy y la sesión deciden si hay que iniciar sesión). */
export default async function LocaleRoot() {
  return redirect({ href: "/dashboard", locale: await getLocale() });
}
