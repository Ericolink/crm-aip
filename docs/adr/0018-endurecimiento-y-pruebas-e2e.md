# ADR 0018: Endurecimiento, pruebas E2E y checklist HIPAA

- **Estado:** propuesta para revisión (2026-11-19)

## Decisiones del usuario

| Tema                  | Decisión                                                         |
| --------------------- | ---------------------------------------------------------------- |
| CSP                   | Estricta con nonce por petición (se desactiva `cacheComponents`) |
| Pruebas en navegador  | Playwright, solo Chromium                                        |
| Bitácora de auditoría | Visor de solo lectura en Configuración (permiso `audit.read`)    |
| Respaldos             | Scripts locales cifrados con prueba de restauración              |

## CSP

- El proxy genera un **nonce aleatorio de 128 bits por petición**. Lo pone en el encabezado `Content-Security-Policy` de la petición (Next lo aplica a sus scripts) y en el de la respuesta. La política vive en `src/lib/security/csp.ts`.
- Directivas:
  - `script-src 'self' 'nonce-…' 'strict-dynamic'` (sin `unsafe-inline` ni `unsafe-eval` en producción).
  - `object-src 'none'`, `frame-src 'none'`, `frame-ancestors 'none'`, `base-uri 'self'`, `form-action 'self'`, `connect-src 'self'`, `upgrade-insecure-requests`.
- **`style-src 'self' 'unsafe-inline'`**: la librería de avisos (sonner) inserta un `<style>` sin nonce, y React usa atributos `style`. Un estilo inyectado no ejecuta código; se acepta y queda documentado.
- **Sin `cacheComponents`**: el prerenderizado parcial es incompatible con los nonces (el HTML estático no tendría el nonce). El layout raíz llama a `connection()` y todas las páginas se generan por petición. El impacto es mínimo porque todas dependen de la sesión.
- Encabezados nuevos: `Cross-Origin-Resource-Policy: same-origin` y `X-Robots-Tag: noindex, nofollow`.
- Las páginas ya responden `Cache-Control: private, no-store`.

## Visor de auditoría (Configuración → Auditoría)

- Solo lectura, permiso `audit.read` (solo Administrador).
- Filtros: fechas (días completos en hora ET), acción, resultado y usuario. Paginación estable de 50 en 50.
- Muestra fecha, usuario, acción traducida, resultado, objeto, IP y detalles. La bitácora nunca contiene PHI.
- Consultarla se registra (`AUDIT_VIEWED`), deduplicado por minuto y filtro.
- El menú de Configuración muestra solo las secciones que el rol permite.

## Respaldos

- `npm run db:backup`: `pg_dump` (formato personalizado) dentro del contenedor. Se cifra en memoria con **AES-256-GCM** (`BACKUP_ENCRYPTION_KEY`, 32 bytes) y se guarda en `./backups/crm-AAAAMMDD-HHMMSS.dump.enc` (fuera de git). El volcado sin cifrar nunca toca el disco.
- `npm run db:restore-test [archivo]`:
  1. Descifra el respaldo (falla si la llave es incorrecta o el archivo se alteró).
  2. Lo restaura en una base temporal (`crm_restore_test`).
  3. Compara el número de filas de 10 tablas con la base de origen.
  4. Borra la base temporal.
- Sin dependencias nuevas (crypto de Node). Producción usará los respaldos del proveedor con BAA (ver checklist).

## Pruebas E2E (Playwright)

- **Dependencia nueva:** `@playwright/test` **1.64.1** (versión fija, solo desarrollo). Chromium se descarga aparte con `npx playwright install chromium` (~150 MB, en la caché del usuario, fuera del proyecto).
- `npm run test:e2e`:
  1. Crea la base desechable `crm_e2e` (solo local), la migra y carga el seed con un administrador de contraseña aleatoria más los datos demo ficticios.
  2. Compila y levanta `next start`.
  3. Corre las pruebas y al final borra la base.
  - `--no-build` reutiliza la compilación.
- **24 pruebas.** Cada pantalla falla la prueba si hay una violación de la CSP o un error de JavaScript en consola.
  - **Primer acceso:** el administrador configura la 2FA por la interfaz real; se lee la clave manual y se genera el código TOTP.
  - **Navegación:** las 13 pantallas principales en español e inglés, más las pestañas del perfil.
  - **Seguridad:**
    - Sin sesión, todo redirige al login.
    - Encabezados y CSP presentes.
    - **La CSP bloquea un manejador `onerror` inyectado como HTML.**
    - El texto con HTML de un cliente se muestra como texto.
  - **Flujos:**
    - Crear cliente y buscarlo.
    - Plantilla → revisar → importar.
    - Exportar CSV filtrado.
    - Alta de usuario → cambio obligatorio de contraseña en otro navegador → configurar 2FA → desactivación (pierde acceso) → registro en la auditoría.
    - Condición crónica.

## Hallazgos y correcciones

- **Bug (Etapa 11):** `getLocale()` dentro de una Server Action fallaba porque `next/root-params` no está permitido ahí. Afectaba la descarga de plantilla y la exportación en el navegador; las pruebas de integración llaman al servicio directo y no lo detectaban.
  - `src/i18n/request.ts` ahora usa el idioma que resuelve next-intl en la petición cuando no hay contexto de ruta.
  - Los errores inesperados de esas acciones se registran (solo el tipo de error).
- **Vulnerabilidad nueva en dependencias:** `effect` < 3.22.1 (ReDoS, CLI de Prisma). Se corrige con un `overrides` a `effect@3.22.4` (misma versión mayor) en lugar de bajar Prisma a la v6. `prisma validate`, `migrate status` y todas las pruebas funcionan. `npm audit`: 0 vulnerabilidades.
- README: tenía al final una línea en UTF-16 (`# crm-aip`) que convertía el archivo en "binario". Se quitó y se documentaron los comandos nuevos.

## Checklist HIPAA

`docs/HIPAA-CHECKLIST.md`: salvaguardas técnicas, administrativas y físicas. Indica qué está implementado y probado y qué falta, y lista los **bloqueantes antes de usar datos reales** (BAA, HTTPS, respaldos de producción, análisis de riesgos, procedimientos). No afirma cumplimiento.

## Pruebas

- **Unitarias:** 122 (7 nuevas): CSP, nonce, cifrado de respaldos (ida y vuelta, llave incorrecta, alteración), etiquetas de todas las acciones de auditoría.
- **Integración:** 151 (+1: visor de auditoría con permisos, filtros y registro de la consulta).
- **E2E:** 24 en Chromium.
- Respaldo y restauración probados sobre la base de desarrollo: 10 de 10 tablas coinciden. Una llave incorrecta se rechaza.
