# ADR 0003 — Interfaz bilingüe con next-intl

- **Estado:** aceptada (2026-11-18)

## Decisión

- **next-intl 4.15** con rutas prefijadas: `/es/...` y `/en/...` (`localePrefix: "always"`). Español es el idioma por defecto.
- El idioma de cada petición se lee del segmento raíz `[locale]` con `next/root-params` (el método recomendado; reemplaza a `setRequestLocale`, ya obsoleto).
- Primera visita: idioma del navegador. Después, cookie `NEXT_LOCALE` de 1 año. En la Etapa 1 también se guardará en `User.preferredLocale`.
- Textos en `src/messages/{es,en}.json`. La base de datos guarda **códigos**, no textos traducidos.
- Zona horaria de formato: `America/New_York` (configurable por usuario más adelante).
- Enlaces y redirecciones siempre con los helpers de `src/i18n/navigation.ts`.
- Prueba automática (`tests/unit/i18n-messages.test.ts`): ambos idiomas deben tener las mismas claves, sin textos vacíos y con las mismas variables.

## Next.js 16

El antiguo `middleware.ts` ahora se llama **`proxy.ts`** (`src/proxy.ts`). Solo resuelve el idioma; la autorización real nunca depende del proxy.
