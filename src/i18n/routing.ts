import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["es", "en"],
  defaultLocale: "es",
  // Todas las rutas llevan prefijo de idioma: /es/... y /en/...
  localePrefix: "always",
  // En la primera visita se usa el idioma del navegador; después, la elección guardada.
  localeDetection: true,
  // Conserva el idioma elegido entre sesiones (1 año). En la Etapa 1 también se guardará
  // en el perfil del usuario (User.preferredLocale) para seguirlo entre dispositivos.
  localeCookie: {
    name: "NEXT_LOCALE",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  },
});

export type AppLocale = (typeof routing.locales)[number];
