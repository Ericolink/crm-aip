import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";
import { locale as rootLocale } from "next/root-params";
import { routing } from "./routing";

/** Idioma del segmento [locale]; undefined fuera de una ruta (p. ej. en una Server Action). */
async function routeLocale(): Promise<string | undefined> {
  try {
    return await rootLocale();
  } catch {
    return undefined;
  }
}

export default getRequestConfig(async ({ locale, requestLocale }) => {
  // `locale` solo viene definido si se pasa explícitamente (p. ej. getTranslations({ locale })).
  // En páginas se lee del segmento raíz [locale] mediante next/root-params. En Server Actions
  // root-params no está permitido: ahí se usa el idioma que el proxy de next-intl ya resolvió.
  const candidate = locale ?? (await routeLocale()) ?? (await requestLocale);
  const resolved = hasLocale(routing.locales, candidate) ? candidate : routing.defaultLocale;

  return {
    locale: resolved,
    messages: (await import(`../messages/${resolved}.json`)).default,
    // Alejandro trabaja en Florida; las fechas se muestran en hora del Este.
    // Cuando existan usuarios en otras zonas se tomará de su perfil.
    timeZone: "America/New_York",
  };
});
