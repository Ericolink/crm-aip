# ADR 0004 — Controles de seguridad de la Etapa 0

- **Estado:** aceptada (2026-11-18)

## Decisión

1. **Encabezados HTTP** en todas las respuestas (`next.config.ts`): HSTS, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy` restrictiva y `Cross-Origin-Opener-Policy`. Sin encabezado `X-Powered-By`.
2. **Sin indexación:** todas las páginas llevan `robots: noindex, nofollow`.
3. **Variables de entorno validadas** con Zod (`src/lib/env.ts`, solo servidor). Si una falta, el error nombra la variable pero **nunca muestra su valor**.
4. **Secretos fuera del repositorio:** `.env*` ignorado (excepto `.env.example`). También se ignoran `*.csv` y `*.xlsx` para no subir exportaciones por accidente.
5. **Cache Components** activado (opción por defecto de la plantilla). Regla para etapas siguientes: **ningún dato de cliente ni de sesión se guarda en caché compartida**; las vistas con datos de usuario son dinámicas.

## Pendiente (etapas siguientes)

- Content-Security-Policy estricta con nonces (Etapa 13, cuando estén todas las pantallas).
- Sesiones, 2FA, límite de intentos y cierre por inactividad (Etapa 1).
- Cifrado de identificadores y auditoría (Etapas 1–2).
