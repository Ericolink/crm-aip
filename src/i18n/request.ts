import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";
import { locale as rootLocale } from "next/root-params";
import { routing } from "./routing";

export default getRequestConfig(async ({ locale }) => {
  // `locale` solo viene definido si se pasa explícitamente (p. ej. getTranslations({ locale })).
  // En el caso normal se lee del segmento raíz [locale] mediante next/root-params.
  const candidate = locale ?? (await rootLocale());
  const resolved = hasLocale(routing.locales, candidate) ? candidate : routing.defaultLocale;

  return {
    locale: resolved,
    messages: (await import(`../messages/${resolved}.json`)).default,
    // Alejandro trabaja en Florida; las fechas se muestran en hora del Este.
    // Cuando existan usuarios en otras zonas se tomará de su perfil.
    timeZone: "America/New_York",
  };
});
